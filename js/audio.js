export function detectSilences(samples, sampleRate, { threshold = 0.012, minSeconds = 0.8, frameSeconds = 0.05 } = {}) {
  const frame = Math.max(1, Math.round(sampleRate * frameSeconds));
  const minFrames = Math.ceil(minSeconds / frameSeconds);
  const quiet = [];
  for (let i = 0; i < samples.length; i += frame) {
    let sum = 0, n = Math.min(frame, samples.length - i);
    for (let j = 0; j < n; j++) sum += samples[i + j] * samples[i + j];
    quiet.push(Math.sqrt(sum / Math.max(1, n)) < threshold);
  }
  const spans = [];
  for (let i = 0; i < quiet.length;) {
    if (!quiet[i]) { i++; continue; }
    let j = i; while (quiet[j]) j++;
    if (j - i >= minFrames) spans.push({ label: "LONG_SILENCE", category: "cleanup", source: "cleanup", score: 1, startTime: i * frameSeconds, endTime: Math.min(samples.length / sampleRate, j * frameSeconds), text: "long pause" });
    i = j;
  }
  return spans;
}

function regionsFromDetections(detections, selected, duration, pad = 0.08) {
  return [...detections].filter((d) => selected.has(d.id)).map((d) => ({ ...d, start: Math.max(0, d.startTime - pad), end: Math.min(duration, d.endTime + pad) })).filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
}

export function renderEditedAudio(buffer, detections, selected, style = "bleep") {
  const sampleRate = buffer.sampleRate, channels = buffer.numberOfChannels || buffer.channels?.length || 1;
  const input = Array.from({ length: channels }, (_, c) => buffer.getChannelData ? buffer.getChannelData(c) : buffer.channels[c]);
  const duration = input[0].length / sampleRate;
  const regions = regionsFromDetections(detections, selected, duration);
  if (style === "cut") return cutAudio(input, sampleRate, regions);
  const out = input.map((ch) => new Float32Array(ch));
  for (const r of regions) {
    const a = Math.max(0, Math.floor(r.start * sampleRate)), b = Math.min(out[0].length, Math.ceil(r.end * sampleRate));
    for (let c = 0; c < out.length; c++) {
      for (let i = a; i < b; i++) out[c][i] = style === "silence" ? 0 : 0.22 * Math.sin(2 * Math.PI * 1000 * i / sampleRate);
    }
  }
  return { sampleRate, channels: out };
}

function cutAudio(input, sampleRate, regions) {
  const merged = [];
  for (const r of regions) {
    const a = Math.max(0, Math.floor(r.start * sampleRate)), b = Math.min(input[0].length, Math.ceil(r.end * sampleRate));
    const last = merged.at(-1);
    if (last && a <= last.end) last.end = Math.max(last.end, b); else merged.push({ start: a, end: b });
  }
  const keepLength = input[0].length - merged.reduce((n, r) => n + r.end - r.start, 0);
  const out = input.map(() => new Float32Array(Math.max(0, keepLength)));
  let src = 0, dst = 0;
  for (const r of [...merged, { start: input[0].length, end: input[0].length }]) {
    const len = Math.max(0, r.start - src);
    for (let c = 0; c < input.length; c++) out[c].set(input[c].subarray(src, r.start), dst);
    dst += len; src = r.end;
  }
  return { sampleRate, channels: out };
}

export function encodeWav(rendered) {
  const { sampleRate, channels } = rendered;
  const numChannels = channels.length, frames = channels[0].length, bytes = frames * numChannels * 2;
  const buf = new ArrayBuffer(44 + bytes), view = new DataView(buf);
  const text = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + bytes, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); view.setUint16(32, numChannels * 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, bytes, true);
  let o = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < numChannels; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([buf], { type: "audio/wav" });
}

export function mixToMono(buffer) {
  const n = buffer.length, out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

export async function resampleTo16k(buffer) {
  const mono = mixToMono(buffer);
  if (buffer.sampleRate === 16000) return mono;
  const ctx = new OfflineAudioContext(1, Math.ceil(mono.length * 16000 / buffer.sampleRate), 16000);
  const src = ctx.createBufferSource();
  const b = ctx.createBuffer(1, mono.length, buffer.sampleRate);
  b.copyToChannel(mono, 0); src.buffer = b; src.connect(ctx.destination); src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}
