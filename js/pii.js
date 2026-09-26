import { findSpans, mergeSpans } from "../vendor/core/rules.js";

export const CLEANUP_CATEGORY = "cleanup";
export const FILLER_WORDS = new Set(["um", "uh", "erm", "ah", "hmm", "like"]);
const DIGITS = new Map(Object.entries({ zero:"0", oh:"0", o:"0", one:"1", won:"1", two:"2", too:"2", to:"2", three:"3", four:"4", for:"4", five:"5", six:"6", seven:"7", eight:"8", ate:"8", nine:"9", niner:"9" }));
const TEENS = new Map(Object.entries({ ten:"10", eleven:"11", twelve:"12", thirteen:"13", fourteen:"14", fifteen:"15", sixteen:"16", seventeen:"17", eighteen:"18", nineteen:"19" }));
const TENS = new Map(Object.entries({ twenty:"2", thirty:"3", forty:"4", fourty:"4", fifty:"5", sixty:"6", seventy:"7", eighty:"8", ninety:"9" }));
const EMAIL_JOIN = new Map(Object.entries({ dot:".", period:".", point:".", at:"@", dash:"-", hyphen:"-", underscore:"_" }));
const DIGIT_SEPARATORS = new Map(Object.entries({ dash:"-", hyphen:"-", minus:"-" }));
const WORD_RE = /[\p{L}\p{N}'’.-]+/gu;

export function asrChunksToWords(result) {
  if (Array.isArray(result?.words)) return result.words.map(cleanWord).filter(Boolean);
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  const out = [];
  for (const ch of chunks) {
    const raw = String(ch.text || "").trim();
    const ts = ch.timestamp || [ch.start ?? 0, ch.end ?? 0];
    const pieces = raw.match(WORD_RE) || [];
    if (!pieces.length) continue;
    const start = Number(ts[0] ?? 0), end = Math.max(start, Number(ts[1] ?? start));
    pieces.forEach((p, i) => out.push(cleanWord({ text: p, start: start + (end - start) * i / pieces.length, end: start + (end - start) * (i + 1) / pieces.length })));
  }
  if (!out.length && result?.text) {
    [...String(result.text).matchAll(WORD_RE)].forEach((m, i) => out.push({ text: m[0], start: i * 0.35, end: (i + 1) * 0.35 }));
  }
  return out.filter(Boolean);
}

function cleanWord(w) {
  const text = String(w.text ?? w.word ?? "").trim();
  if (!text) return null;
  const start = Math.max(0, Number(w.start ?? w.timestamp?.[0] ?? 0));
  const end = Math.max(start + 0.01, Number(w.end ?? w.timestamp?.[1] ?? start + 0.25));
  return { text, start, end };
}

export function buildTextMap(words) {
  let text = ""; const charToWord = []; const ranges = [];
  words.forEach((w, i) => {
    if (text) { charToWord.push(i); text += " "; }
    const start = text.length;
    for (const ch of w.text) { text += ch; charToWord.push(i); }
    ranges.push([start, text.length]);
  });
  return { text, charToWord, ranges };
}

function token(word) { return String(word.text).toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""); }
function emit(out, str, wordIndexes, kind = null, value = null) {
  if (out.text) { out.text += " "; out.charToWord.push(wordIndexes[0] ?? out.charToWord.at(-1) ?? 0); }
  const start = out.text.length;
  for (let i = 0; i < str.length; i++) { out.text += str[i]; out.charToWord.push(wordIndexes[Math.min(i, wordIndexes.length - 1)] ?? wordIndexes[0] ?? 0); }
  const end = out.text.length;
  if (kind) out.segments.push({ kind, start, end, value: value ?? str, wordStart: Math.min(...wordIndexes), wordEnd: Math.max(...wordIndexes) + 1 });
}

function readDigit(words, i) {
  const t = token(words[i]);
  if (DIGITS.has(t)) return { digits: DIGITS.get(t), used: 1 };
  if (TEENS.has(t)) return { digits: TEENS.get(t), used: 1 };
  if (TENS.has(t)) {
    const n = token(words[i + 1] || {});
    if (DIGITS.has(n) && DIGITS.get(n) !== "0") return { digits: TENS.get(t) + DIGITS.get(n), used: 2 };
    return { digits: TENS.get(t) + "0", used: 1 };
  }
  if (/^\d+$/.test(t)) return { digits: t, used: 1 };
  if (/^[\d.-]+$/.test(t) && (t.match(/\d/g) || []).length >= 3) return { digits: t.replace(/\D/g, ""), used: 1 };
  if ((t === "double" || t === "triple") && words[i + 1]) {
    const d = readDigit(words, i + 1);
    if (d && d.digits.length === 1) return { digits: d.digits.repeat(t === "double" ? 2 : 3), used: 1 + d.used };
  }
  return null;
}

function readDigitRun(words, i) {
  let j = i, digits = "", text = "", idx = [];
  while (j < words.length) {
    const d = readDigit(words, j);
    if (d) {
      digits += d.digits; text += d.digits;
      for (let k = 0; k < d.digits.length; k++) idx.push(j + Math.min(k, d.used - 1));
      j += d.used;
      continue;
    }
    const sep = DIGIT_SEPARATORS.get(token(words[j]));
    if (!sep || !digits || !readDigit(words, j + 1)) break;
    text += sep; idx.push(j); j++;
  }
  return digits.length >= 3 ? { digits, text, next: j, indexes: idx } : null;
}

function isDigitWord(t) { return DIGITS.has(t) || TEENS.has(t) || TENS.has(t) || t === "double" || t === "triple" || /^[\d.-]+$/.test(t); }
function readEmail(words, i) {
  if (token(words[i]) === "my" && ["email", "e-mail", "mail"].includes(token(words[i + 1] || {}))) return readEmail(words, i + 1);
  if (["email", "e-mail", "mail"].includes(token(words[i]))) {
    let j = i + 1;
    if (token(words[j] || {}) === "address") j++;
    if (token(words[j] || {}) === "is") j++;
    return readEmail(words, j);
  }
  const look = words.slice(i, i + 14).map(token);
  const atRel = look.findIndex((t) => t === "at" || t.includes("@"));
  if (atRel <= 0) return null;
  let j = i, s = "", indexes = [], hasAt = false, hasDotAfterAt = false, lastWasJoin = false;
  while (j < words.length && j < i + 18) {
    const raw = String(words[j].text || "").toLowerCase();
    const t = token(words[j]);
    if (!t || ["and", "or", "then"].includes(t)) break;
    let part = null, used = 1, partIndexes = null;
    const digit = readDigit(words, j);
    if (/^\.[a-z0-9._%+-]+$/.test(raw)) part = `.${t}`;
    else if (EMAIL_JOIN.has(t)) part = EMAIL_JOIN.get(t);
    else if (/^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(t)) part = t;
    else if (digit) { part = digit.digits; used = digit.used; partIndexes = Array.from({ length: part.length }, (_, k) => j + Math.min(k, used - 1)); }
    else if (/^[a-z0-9._%+-]+$/.test(t) && !isDigitWord(t)) part = t;
    else break;
    if (part.includes("@")) { if (hasAt || !s || lastWasJoin) break; hasAt = true; }
    if ((part === "." || part.includes(".")) && hasAt) hasDotAfterAt = true;
    if ((part === "." || part === "@") && lastWasJoin) break;
    s += part;
    indexes.push(...(partIndexes || Array.from({ length: part.length }, () => j)));
    lastWasJoin = part.length === 1 && /[.@_-]/.test(part);
    j += used;
    const next = token(words[j] || {});
    if (hasAt && hasDotAfterAt && /@[^@]+\.[a-z]{2,}$/i.test(s) && !["dot", "period", "point", "dash", "hyphen", "underscore"].includes(next)) break;
  }
  return hasAt && hasDotAfterAt && /@[^@]+\.[a-z]{2,}$/i.test(s) ? { email: s, next: j, indexes } : null;
}

export function normalizeSpoken(words) {
  const out = { text: "", charToWord: [], segments: [] };
  for (let i = 0; i < words.length;) {
    const email = readEmail(words, i);
    if (email) { emit(out, email.email, email.indexes, "email", email.email); i = email.next; continue; }
    const run = readDigitRun(words, i);
    if (run) { emit(out, run.text, run.indexes, "digits", run.digits); i = run.next; continue; }
    emit(out, words[i].text, [i]); i++;
  }
  return out;
}

function luhn(value) {
  const digits = [...value].map(Number); let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) { let n = digits[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return digits.length >= 13 && digits.length <= 19 && new Set(digits).size > 1 && sum % 10 === 0;
}

function originalHeuristics(text) {
  const spans = [];
  const addAll = (re, label, category, group = 1) => { for (const m of text.matchAll(re)) { const v = m[group]; if (!v) continue; const start = m.index + m[0].indexOf(v); spans.push({ start, end: start + v.length, label, category, score: 0.9, source: "speech-rule" }); } };
  addAll(/\b(?:this is|my name is|i am|i'm|i’m)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g, "PERSON", "person");
  addAll(/\b(?:address is|at|ship to|located at)\s+(\d{1,5}\s+[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,3})\b/g, "ADDRESS", "location");
  spans.push(...passwordSpans(text));
  for (const m of text.matchAll(/\b\d[\d .-]{7,}\d\b/g)) { const digits = m[0].replace(/\D/g, ""); if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1")) || (digits.length === 9 && /(?:call|phone|back at).{0,30}$/i.test(text.slice(0, m.index)))) spans.push({ start: m.index, end: m.index + m[0].length, label: "PHONE", category: "contact", score: 0.95, source: "speech-rule" }); else if (luhn(digits)) spans.push({ start: m.index, end: m.index + m[0].length, label: "CREDIT_CARD", category: "financial", score: 0.95, source: "speech-rule" }); }
  return spans;
}

const SPELLING_CONTROLS = new Set(["capital", "uppercase", "upper", "lowercase", "lower", "letter", "number", "digit", "symbol"]);
const PUNCT_WORDS = new Set(["exclamation", "mark", "question", "comma", "period", "dot", "dash", "hyphen", "minus", "underscore", "slash", "backslash", "colon", "semicolon", "quote", "apostrophe", "at", "pound", "hash", "dollar", "percent", "ampersand", "star", "asterisk", "plus", "equal", "equals", "open", "close", "left", "right", "paren", "parenthesis", "bracket", "brace"]);
function isSpellingToken(t) {
  return /^[a-z]$/i.test(t) || DIGITS.has(t) || TEENS.has(t) || TENS.has(t) || SPELLING_CONTROLS.has(t) || PUNCT_WORDS.has(t);
}
function passwordSpans(text) {
  const spans = [];
  for (const m of text.matchAll(/\b(?:my\s+)?(?:password|passcode|pin)\s+(?:is|equals|as)\s+/gi)) {
    const base = m.index + m[0].length;
    const tail = text.slice(base);
    const toks = [...tail.matchAll(WORD_RE)].map((x) => ({ text: x[0], token: x[0].toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""), start: base + x.index, end: base + x.index + x[0].length, relStart: x.index, relEnd: x.index + x[0].length }));
    if (!toks.length) continue;
    let end = toks[0].end, count = 0;
    while (count < toks.length && isSpellingToken(toks[count].token)) {
      end = toks[count].end; count++;
      const nextStart = count < toks.length ? toks[count].relStart : tail.length;
      if (/[.!?;]/.test(tail.slice(toks[count - 1].relEnd, nextStart))) break;
    }
    if (count < 2) {
      end = toks[0].end;
      for (let i = 1; i < Math.min(5, toks.length); i++) {
        const gap = text.slice(toks[i - 1].end, toks[i].start);
        if (/[.!?;]/.test(gap)) break;
        end = toks[i].end;
      }
    }
    spans.push({ start: base, end, label: "PASSWORD_OR_SECRET", category: "secrets", score: 0.9, source: "speech-rule" });
  }
  return spans;
}

function mapSpan(span, map, words, normalizedText = null) {
  const hit = new Set();
  for (let c = Math.max(0, span.start); c < Math.min(map.charToWord.length, span.end); c++) if (map.charToWord[c] != null) hit.add(map.charToWord[c]);
  if (!hit.size) return null;
  const indexes = [...hit].sort((a, b) => a - b);
  const startWord = indexes[0], endWord = indexes.at(-1) + 1;
  const start = Math.max(0, words[startWord].start - 0.08);
  const end = words[endWord - 1].end + 0.08;
  const text = words.slice(startWord, endWord).map((w) => w.text).join(" ");
  return { ...span, startTime: start, endTime: end, startWord, endWord, text, normalizedText: normalizedText?.slice(span.start, span.end) };
}

function mergeTimeDetections(items) {
  const ordered = items.filter(Boolean).sort((a, b) => a.startWord - b.startWord || b.endWord - b.startWord - (a.endWord - a.startWord));
  const out = [];
  for (const d of ordered) {
    const overlap = out.find((x) => d.startWord < x.endWord && d.endWord > x.startWord);
    if (!overlap) out.push(d);
    else if ((d.category === "secrets" ? 3 : d.category === "financial" ? 2 : 1) > (overlap.category === "secrets" ? 3 : overlap.category === "financial" ? 2 : 1)) Object.assign(overlap, d);
  }
  return out.sort((a, b) => a.startTime - b.startTime);
}

export async function detectTranscript(words, { categories = null, customTerms = [], ner = null, cleanup = false } = {}) {
  const wanted = categories ? new Set(categories) : null;
  const original = buildTextMap(words);
  const normalized = normalizeSpoken(words);
  const ruleOriginal = findSpans(original.text, categories, customTerms);
  const heuristic = originalHeuristics(original.text).filter((s) => !wanted || wanted.has(s.category));
  const ruleNorm = findSpans(normalized.text, categories, customTerms);
  const heuristicNorm = originalHeuristics(normalized.text).filter((s) => !wanted || wanted.has(s.category)).map((s) => ({ ...s, source: "normalized-speech-rule" }));
  const spoken = [];
  for (const seg of normalized.segments) {
    if (seg.kind === "email" && (!wanted || wanted.has("contact"))) spoken.push({ start: seg.start, end: seg.end, label: "EMAIL", category: "contact", score: 1, source: "spoken", segment: seg });
    if (seg.kind === "digits") {
      const n = seg.value.length;
      if ((n === 10 || (n === 11 && seg.value.startsWith("1"))) && (!wanted || wanted.has("contact"))) spoken.push({ start: seg.start, end: seg.end, label: "PHONE", category: "contact", score: 1, source: "spoken", segment: seg });
      else if (n === 9 && (!wanted || wanted.has("government_id"))) spoken.push({ start: seg.start, end: seg.end, label: "US_SSN", category: "government_id", score: 0.86, source: "spoken", segment: seg });
      else if (luhn(seg.value) && (!wanted || wanted.has("financial"))) spoken.push({ start: seg.start, end: seg.end, label: "CREDIT_CARD", category: "financial", score: 1, source: "spoken", segment: seg });
    }
  }
  let nerSpans = [];
  if (ner && (!wanted || wanted.has("person") || wanted.has("location"))) nerSpans = await ner.find(original.text, wanted || new Set(["person", "location"]));
  const spans = mergeSpans([...ruleOriginal, ...heuristic], nerSpans);
  const mapped = [
    ...spans.map((s) => mapSpan(s, original, words)),
    ...ruleNorm.map((s) => mapSpan({ ...s, source: s.source || "normalized" }, normalized, words, normalized.text)),
    ...heuristicNorm.map((s) => mapSpan(s, normalized, words, normalized.text)),
    ...spoken.map((s) => mapSpan(s, normalized, words, normalized.text)),
  ];
  if (cleanup) mapped.push(...detectFillers(words));
  return mergeTimeDetections(mapped).map((d, i) => ({ ...d, id: i + 1, selected: d.category !== CLEANUP_CATEGORY }));
}

export function detectFillers(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const t = token(words[i]);
    const next = `${t} ${token(words[i + 1] || {})}`;
    if (FILLER_WORDS.has(t) || next === "you know") {
      const endWord = next === "you know" ? i + 2 : i + 1;
      out.push({ label: next === "you know" ? "FILLER_PHRASE" : "FILLER", category: CLEANUP_CATEGORY, score: 1, source: "cleanup", startWord: i, endWord, startTime: Math.max(0, words[i].start - 0.02), endTime: words[endWord - 1].end + 0.02, text: words.slice(i, endWord).map((w) => w.text).join(" ") });
    }
  }
  return out;
}

export function redactedTranscript(words, detections, selected) {
  const marks = [...detections].filter((d) => selected.has(d.id) && d.category !== CLEANUP_CATEGORY).sort((a, b) => a.startWord - b.startWord);
  const parts = [];
  for (let i = 0; i < words.length;) {
    const d = marks.find((x) => x.startWord === i);
    if (d) { parts.push(`[${d.label}]`); i = d.endWord; }
    else parts.push(words[i++].text);
  }
  return parts.join(" ").replace(/\s+([,.;:!?])/g, "$1");
}

export function makeSrt(words, detections, selected, maxWords = 9) {
  const lines = [];
  for (let i = 0, n = 1; i < words.length;) {
    const chunk = words.slice(i, i + maxWords); const start = chunk[0].start, end = chunk.at(-1).end;
    lines.push(`${n++}\n${srtTime(start)} --> ${srtTime(end)}\n${redactedTranscript(chunk, clipDetections(detections, i, i + chunk.length), selected)}\n`);
    i += maxWords;
  }
  return lines.join("\n");
}
function clipDetections(detections, startWord, endWord) {
  return detections
    .filter((d) => d.endWord > startWord && d.startWord < endWord)
    .map((d) => ({ ...d, startWord: Math.max(d.startWord, startWord) - startWord, endWord: Math.min(d.endWord, endWord) - startWord }));
}
function srtTime(t) { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000); return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(ms).padStart(3,"0")}`; }
