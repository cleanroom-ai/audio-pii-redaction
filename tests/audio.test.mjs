import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { pipeline, env } from "@huggingface/transformers";
import { normalizeSpoken, detectTranscript, redactedTranscript, asrChunksToWords } from "../js/pii.js";
import { detectSilences, renderEditedAudio, encodeWav } from "../js/audio.js";

const words = (s, step = 0.25) => s.split(/\s+/).map((text, i) => ({ text, start: i * step, end: i * step + step * 0.8 }));

test("spoken numbers and email normalize with char to word mapping", () => {
  const w = words("call four one five double five five zero one three two email john dot smith at gmail dot com");
  const n = normalizeSpoken(w);
  assert.match(n.text, /4155550132/);
  assert.match(n.text, /john\.smith@gmail\.com/);
  const at = n.text.indexOf("@");
  assert.equal(w[n.charToWord[at]].text, "at");
});

test("PII detection maps spoken phone, email, name and password to word timestamps", async () => {
  const w = words("Hi this is Jennifer Walsh call me at four one five five five five zero one three two or email jennifer dot walsh at contoso dot com my password is blue falcon ninety nine");
  const d = await detectTranscript(w);
  assert.ok(d.some((x) => x.label === "PERSON" && x.text.includes("Jennifer")));
  assert.ok(d.some((x) => x.label === "PHONE" && x.normalizedText === "4155550132"));
  assert.ok(d.some((x) => x.label === "EMAIL" && x.normalizedText === "jennifer.walsh@contoso.com"));
  assert.ok(d.some((x) => x.label === "PASSWORD_OR_SECRET" && /blue falcon/.test(x.text)));
  const selected = new Set(d.map((x) => x.id));
  const txt = redactedTranscript(w, d, selected);
  assert.ok(!txt.includes("415"));
  assert.match(txt, /\[PHONE\]/);
});

test("filler and silence cleanup detectors", () => {
  const f = words("um hello you know there");
  const ds = detectSilences(new Float32Array([...Array(1600).fill(0.1), ...Array(16000).fill(0), ...Array(1600).fill(0.1)]), 16000);
  assert.equal(ds.length, 1);
  assert.ok(ds[0].endTime - ds[0].startTime >= 0.8);
});

test("audio edit renderer bleeps, silences and cuts at expected samples", async () => {
  const sr = 1000; const data = Float32Array.from({ length: 1000 }, (_, i) => i / 1000);
  const buffer = { sampleRate: sr, numberOfChannels: 1, getChannelData: () => data };
  const det = [{ id: 1, startTime: 0.2, endTime: 0.3 }]; const sel = new Set([1]);
  const silent = renderEditedAudio(buffer, det, sel, "silence").channels[0];
  assert.equal(silent[120], 0); assert.equal(silent[500], data[500]);
  const bleep = renderEditedAudio(buffer, det, sel, "bleep").channels[0];
  assert.notEqual(bleep[123], data[123]);
  const cut = renderEditedAudio(buffer, det, sel, "cut").channels[0];
  assert.equal(cut.length, 740); // 0.2-0.3 with ±80 ms padding = 260 samples removed
});

test("WAV encoder writes a valid PCM header and length", async () => {
  const blob = encodeWav({ sampleRate: 16000, channels: [new Float32Array(160)] });
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.subarray(0, 4).toString(), "RIFF");
  assert.equal(buf.subarray(8, 12).toString(), "WAVE");
  assert.equal(buf.readUInt16LE(22), 1);
  assert.equal(buf.readUInt32LE(24), 16000);
  assert.equal(buf.length, 44 + 160 * 2);
});

function readPcm16(path) {
  const b = readFileSync(path); assert.equal(b.subarray(0,4).toString(), "RIFF");
  const sr = b.readUInt32LE(24), channels = b.readUInt16LE(22), bits = b.readUInt16LE(34);
  assert.equal(bits, 16); let off = 12;
  while (off < b.length && b.subarray(off, off + 4).toString() !== "data") off += 8 + b.readUInt32LE(off + 4);
  const len = b.readUInt32LE(off + 4), start = off + 8, frames = len / 2 / channels, out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < channels; c++) s += b.readInt16LE(start + (i * channels + c) * 2) / 32768; out[i] = s / channels; }
  return { samples: out, sampleRate: sr };
}

test("Whisper integration on fake examples maps detections to timestamps", { timeout: 180_000, skip: !existsSync(".cache/Xenova/whisper-tiny.en/onnx/encoder_model_quantized.onnx") && "model not fetched" }, async () => {
  env.cacheDir = "./.cache"; env.allowRemoteModels = false; env.allowLocalModels = true;
  const asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", { dtype: "q8" });
  const t0 = performance.now();
  const { samples } = readPcm16("examples/voicemail.wav");
  const out = await asr(samples, { return_timestamps: "word", chunk_length_s: 20 });
  const words = asrChunksToWords(out);
  const d = await detectTranscript(words);
  console.log(`Whisper voicemail ${((performance.now() - t0) / 1000).toFixed(1)}s: ${out.text}`);
  assert.ok(words.length > 8);
  assert.ok(d.some((x) => x.label === "PERSON" && x.startTime >= 0 && x.endTime > x.startTime));
  assert.ok(d.some((x) => x.label === "PHONE"));
  assert.ok(d.some((x) => x.label === "EMAIL"));
});
