import { CATEGORY_COLORS as CORE_COLORS } from "../vendor/core/redact.js";
import { maskPreview, prettyLabel, CATEGORIES } from "../vendor/core/rules.js";
import { resampleTo16k, mixToMono, renderEditedAudio, encodeWav } from "./audio.js";
import { redactedTranscript, makeSrt } from "./pii.js";

const COLORS = { ...CORE_COLORS, cleanup: "#94a3b8" };
const $ = (s) => document.querySelector(s);
const els = {
  file: $("#file"), drop: $("#drop"), workspace: $("#workspace"), status: $("#status"), engine: $("#engine"),
  waveform: $("#waveform"), audio: $("#audio"), transcript: $("#transcript"), list: $("#detections"), empty: $("#detections-empty"),
  cleanup: $("#cleanup"), terms: $("#terms"), useNer: $("#use-ner"), record: $("#record"), stop: $("#stop-record"),
  play: $("#play-preview"), wav: $("#download-wav"), txt: $("#download-txt"), srt: $("#download-srt"), reset: $("#reset"), rescan: $("#rescan"),
};
const state = { audioBuffer: null, samples16: null, words: [], detections: [], selected: new Set(), fileName: "audio", id: 0, recorder: null, chunks: [], audioUrl: null };
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
const pending = new Map();
worker.onmessage = ({ data: m }) => {
  if (m.type === "ready") setEngine("✓ Engine ready — Whisper and PII models are bundled", "ok");
  if (m.type === "download" && m.total) setEngine(`Loading on-device model… ${mb(m.loaded)} / ${mb(m.total)} MB (one time)`);
  if (m.type === "progress") setStatus(m.text, "busy");
  if (m.type === "warning") setStatus(m.text, "warn");
  if (m.type === "result" || m.type === "error") { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.type === "result" ? p.resolve(m) : p.reject(new Error(m.text)); } }
};
worker.onerror = (e) => setEngine(`Engine failed: ${e.message}`, "warn");
worker.postMessage({ type: "warmup" });

els.file.addEventListener("change", () => els.file.files[0] && loadBlob(els.file.files[0]));
els.drop.addEventListener("click", (e) => e.target.closest("button,a") || els.file.click());
for (const t of [document.body]) {
  t.addEventListener("dragover", (e) => { e.preventDefault(); els.drop.classList.add("over"); });
  t.addEventListener("dragleave", (e) => e.relatedTarget || els.drop.classList.remove("over"));
  t.addEventListener("drop", (e) => { e.preventDefault(); els.drop.classList.remove("over"); const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("audio/") || x.type.startsWith("video/")); if (f) loadBlob(f); });
}
document.querySelectorAll("[data-example]").forEach((b) => b.addEventListener("click", async (e) => {
  e.stopPropagation();
  const [wav, sidecar] = await Promise.all([fetch(b.dataset.example).then((r) => r.blob()), fetch(b.dataset.transcript).then((r) => r.json())]);
  await loadBlob(new File([wav], b.dataset.example.split("/").pop(), { type: "audio/wav" }), b.dataset.name, sidecar.words);
}));

els.cleanup.addEventListener("change", () => state.audioBuffer && process(state.words));
els.useNer.addEventListener("change", () => state.audioBuffer && process(state.words));
els.rescan.addEventListener("click", () => state.audioBuffer && process(state.words));
document.querySelectorAll("input[name=style]").forEach((r) => r.addEventListener("change", render));
els.reset.addEventListener("click", reset);
els.play.addEventListener("click", playPreview);
els.wav.addEventListener("click", () => downloadBlob(encodeWav(renderEditedAudio(state.audioBuffer, state.detections, state.selected, style())), `${state.fileName}-redacted.wav`));
els.txt.addEventListener("click", () => downloadText(redactedTranscript(state.words, state.detections, state.selected), `${state.fileName}-redacted.txt`));
els.srt.addEventListener("click", () => downloadText(makeSrt(state.words, state.detections, state.selected), `${state.fileName}-redacted.srt`));

els.record.addEventListener("click", async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.chunks = []; state.recorder = new MediaRecorder(stream); state.recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
  state.recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); loadBlob(new Blob(state.chunks, { type: state.chunks[0]?.type || "audio/webm" }), "microphone-recording"); };
  state.recorder.start(); els.record.hidden = true; els.stop.hidden = false; setStatus("Recording…", "busy");
});
els.stop.addEventListener("click", () => { state.recorder?.stop(); els.record.hidden = false; els.stop.hidden = true; });

async function loadBlob(blob, name, knownWords = null) {
  try {
    setStatus("Decoding audio in your browser…", "busy");
    state.fileName = (name || blob.name || "audio").replace(/\.[^.]+$/, "");
    const ctx = new AudioContext();
    state.audioBuffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    await ctx.close();
    state.samples16 = await resampleTo16k(state.audioBuffer);
    setAudioBlob(blob);
    els.drop.hidden = true; els.workspace.hidden = false;
    await process(knownWords);
  } catch (err) { setStatus(`Could not read that media file: ${err.message}`, "warn"); }
}

async function process(knownWords = null) {
  const id = ++state.id; const t0 = performance.now(); state.selected = new Set();
  const payload = state.samples16.buffer.slice(0);
  const result = await new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ type: "process", id, samples: payload, words: knownWords, cleanup: els.cleanup.checked, useNer: els.useNer.checked, customTerms: terms() }, [payload]); });
  state.words = result.words; state.detections = result.detections;
  for (const d of state.detections) if (d.category !== "cleanup" || els.cleanup.checked) state.selected.add(d.id);
  setStatus(summary((performance.now() - t0) / 1000), "ok"); render();
}

function render() { drawWaveform(); renderTranscript(); renderList(); const ready = !!state.audioBuffer; els.play.disabled = els.wav.disabled = els.txt.disabled = els.srt.disabled = !ready; }
function drawWaveform() {
  const c = els.waveform, ctx = c.getContext("2d"), w = c.clientWidth || 900, h = 220; c.width = w * devicePixelRatio; c.height = h * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio); ctx.clearRect(0,0,w,h); ctx.fillStyle = "#0f172a"; ctx.fillRect(0,0,w,h);
  if (!state.audioBuffer) return; const data = mixToMono(state.audioBuffer), step = Math.max(1, Math.floor(data.length / w)); ctx.strokeStyle = "#a5b4fc"; ctx.beginPath();
  for (let x = 0; x < w; x++) { let min = 1, max = -1; for (let i = x * step; i < Math.min(data.length, (x + 1) * step); i++) { min = Math.min(min, data[i]); max = Math.max(max, data[i]); } ctx.moveTo(x, h * (0.5 - max * 0.42)); ctx.lineTo(x, h * (0.5 - min * 0.42)); }
  ctx.stroke(); const dur = state.audioBuffer.duration; for (const d of state.detections) { const x = d.startTime / dur * w, ww = Math.max(2, (d.endTime - d.startTime) / dur * w); ctx.fillStyle = hexA(COLORS[d.category] || "#22d3ee", state.selected.has(d.id) ? .45 : .16); ctx.fillRect(x, 0, ww, h); }
}
function renderTranscript() {
  els.transcript.replaceChildren(...state.words.map((w, i) => { const s = document.createElement("button"); s.type = "button"; s.className = "word"; s.textContent = w.text; const d = state.detections.find((x) => i >= x.startWord && i < x.endWord); if (d) { s.dataset.cat = d.category; s.style.setProperty("--c", COLORS[d.category] || "#22d3ee"); if (state.selected.has(d.id)) s.classList.add("on"); s.title = pretty(d); s.onclick = () => { toggle(d.id); }; } return s; }));
}
els.transcript.addEventListener("mouseup", () => {
  const sel = getSelection(); if (!sel || sel.isCollapsed || !els.transcript.contains(sel.anchorNode)) return;
  const buttons = [...els.transcript.querySelectorAll(".word")]; const chosen = buttons.map((b, i) => sel.containsNode(b, true) ? i : -1).filter((i) => i >= 0); sel.removeAllRanges();
  if (!chosen.length) return; const a = Math.min(...chosen), b = Math.max(...chosen) + 1; const d = { id: Math.max(0, ...state.detections.map((x) => x.id)) + 1, label: "CUSTOM", category: "custom", source: "you", score: 1, startWord: a, endWord: b, startTime: state.words[a].start, endTime: state.words[b - 1].end, text: state.words.slice(a,b).map((w) => w.text).join(" ") };
  state.detections.push(d); state.selected.add(d.id); render();
});
function renderList() {
  els.list.replaceChildren(...state.detections.map((d) => { const li = document.createElement("li"); const cb = Object.assign(document.createElement("input"), { type: "checkbox", checked: state.selected.has(d.id) }); cb.onchange = () => toggle(d.id, cb.checked); const dot = Object.assign(document.createElement("span"), { className: "dot" }); dot.style.background = COLORS[d.category] || "#22d3ee"; const name = Object.assign(document.createElement("span"), { className: "name", textContent: `#${d.id} ${prettyLabel(d.label)} · ${time(d.startTime)}–${time(d.endTime)}` }); const prev = Object.assign(document.createElement("span"), { className: "preview", textContent: maskPreview(d.normalizedText || d.text) }); const lab = document.createElement("label"); lab.append(cb, dot, name, prev); li.append(lab); return li; }));
  els.empty.hidden = state.detections.length > 0;
}
function toggle(id, on = null) { if (on ?? !state.selected.has(id)) state.selected.add(id); else state.selected.delete(id); render(); }
async function playPreview() { const blob = encodeWav(renderEditedAudio(state.audioBuffer, state.detections, state.selected, style())); setAudioBlob(blob); await els.audio.play(); }
function style() { return document.querySelector("input[name=style]:checked").value; }
function terms() { return els.terms.value.split(new RegExp("[,\\n]")).map((t) => t.trim()).filter(Boolean); }
function pretty(d) { return `${prettyLabel(d.label)} ${time(d.startTime)}–${time(d.endTime)}`; }
function time(t) { const m = Math.floor(t / 60), s = (t % 60).toFixed(1).padStart(4, "0"); return `${m}:${s}`; }
function mb(n) { return (n / 1048576).toFixed(1); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }
function summary(sec) { const counts = {}; for (const d of state.detections) counts[d.category] = (counts[d.category] || 0) + 1; const parts = Object.entries(counts).map(([k,v]) => `${v} ${k.replace("_"," ")}`); return `Found ${state.detections.length} region${state.detections.length === 1 ? "" : "s"} in ${sec.toFixed(1)}s${parts.length ? ` — ${parts.join(", ")}` : ""}. Review before exporting.`; }
function setStatus(text, kind = "") { els.status.textContent = text; els.status.dataset.kind = kind; }
function setEngine(text, kind = "") { els.engine.textContent = text; els.engine.dataset.kind = kind; }
function downloadBlob(blob, name) { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
function downloadText(text, name) { downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), name); }
function setAudioBlob(blob) { revokeAudioUrl(); state.audioUrl = URL.createObjectURL(blob); els.audio.src = state.audioUrl; }
function revokeAudioUrl() { if (state.audioUrl) URL.revokeObjectURL(state.audioUrl); state.audioUrl = null; els.audio.removeAttribute("src"); }
function reset() { revokeAudioUrl(); state.audioBuffer = null; state.words = []; state.detections = []; state.selected = new Set(); els.workspace.hidden = true; els.drop.hidden = false; els.file.value = ""; setStatus(""); render(); }
addEventListener("beforeunload", revokeAudioUrl);
