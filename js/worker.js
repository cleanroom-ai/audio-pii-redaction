import { asrChunksToWords, detectTranscript } from "./pii.js";
import { detectSilences } from "./audio.js";
import { createNer } from "../vendor/core/ner.js";
import { configureOrt } from "../vendor/core/engines.js";
import * as ort from "../vendor/ort/ort.wasm.min.mjs";

const BASE = new URL("../", import.meta.url);
const WASM_PATH = new URL("vendor/ort/", BASE).href;
configureOrt(ort, WASM_PATH);
let transformersPromise, asrPromise, nerPromise;
const post = (m) => self.postMessage(m);

async function transformers() {
  if (!transformersPromise) transformersPromise = import("../vendor/transformers.web.min.js").then((t) => {
    t.env.allowRemoteModels = false;
    t.env.allowLocalModels = true;
    t.env.useBrowserCache = true;
    t.env.localModelPath = new URL("models/", BASE).pathname;
    if (t.env.backends?.onnx?.wasm) t.env.backends.onnx.wasm.wasmPaths = WASM_PATH;
    return t;
  });
  return transformersPromise;
}
async function loadAsr() {
  if (!asrPromise) asrPromise = transformers().then(({ pipeline }) => pipeline("automatic-speech-recognition", "whisper", { dtype: "q8", device: "wasm", progress_callback: (p) => post({ type: "download", label: p.file || p.name || "whisper", loaded: p.loaded || 0, total: p.total || 0 }) }));
  return asrPromise;
}
async function loadNer() {
  if (!nerPromise) nerPromise = transformers().then((t) => createNer(t, { localModelPath: new URL("models/", BASE).pathname, wasmPaths: WASM_PATH, device: "wasm" }));
  return nerPromise;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "warmup") { post({ type: "ready" }); return; }
    if (data.type !== "process") return;
    const samples = new Float32Array(data.samples);
    let words = data.words;
    if (!words) {
      post({ type: "progress", text: "Transcribing locally with Whisper…" });
      const out = await (await loadAsr())(samples, { return_timestamps: "word", chunk_length_s: 20, stride_length_s: 2 });
      words = asrChunksToWords(out);
    }
    post({ type: "progress", text: "Finding private details…" });
    const ner = data.useNer ? await loadNer().catch((e) => (post({ type: "warning", text: `Name model unavailable: ${e.message}` }), null)) : null;
    const detections = await detectTranscript(words, { customTerms: data.customTerms || [], ner, cleanup: data.cleanup });
    if (data.cleanup) {
      const silences = detectSilences(samples, 16000).map((d, i) => ({ ...d, id: detections.length + i + 1, selected: true, startWord: 0, endWord: 0 }));
      detections.push(...silences);
    }
    detections.forEach((d, i) => d.id = i + 1);
    post({ type: "result", id: data.id, words, detections });
  } catch (err) {
    post({ type: "error", id: data.id, text: err?.message || String(err) });
  }
};
