---
title: Audio Redactor
emoji: 🔊
colorFrom: gray
colorTo: indigo
sdk: static
app_file: index.html
pinned: false
license: apache-2.0
custom_headers:
  cross-origin-embedder-policy: require-corp
  cross-origin-opener-policy: same-origin
  cross-origin-resource-policy: cross-origin
short_description: Bleep names, numbers & secrets in audio, in-browser
thumbnail: https://huggingface.co/spaces/cleanroom-ai/audio-pii-redaction/resolve/main/assets/social-preview.png
models:
  - Xenova/whisper-tiny.en
  - onnx-community/bert-small-pii-detection-ONNX
  - gravitee-io/bert-small-pii-detection
tags:
  - audio
  - speech-to-text
  - whisper
  - redaction
  - audio-redaction
  - privacy
  - pii
  - pii-detection
  - anonymization
  - podcast
  - gdpr
  - in-browser
  - onnx
  - transformers.js
---

# 🔊 Audio Redactor

<p align="center"><img src="assets/icon.svg" width="112" height="112" alt="Audio Redactor logo"></p>

[![CI](https://github.com/paragpsawant/audio-pii-redaction/actions/workflows/ci.yml/badge.svg)](https://github.com/paragpsawant/audio-pii-redaction/actions/workflows/ci.yml)
[Open the Hugging Face demo](https://huggingface.co/spaces/cleanroom-ai/audio-pii-redaction)

**Bleep names, numbers & secrets in recordings — in your browser.**

Drop a WAV/MP3/M4A/OGG/WebM audio file, a video file with an audio track, record from your mic, or try a bundled fake example. Audio is decoded with WebAudio, resampled to 16 kHz mono for on-device Whisper transcription, scanned for PII, reviewed on a waveform/transcript UI, then exported as a redacted WAV, text transcript and optional SRT.

## Why

Podcasters, support teams and people sharing meeting recordings often need to remove phone numbers, emails, names, passwords or payment details before sending audio outside a trusted room. Audio Redactor keeps that cleanup local: no uploads, no analytics, no CDN, no runtime model downloads.

## Features

- 🔒 100% client-side with a strict Content-Security-Policy.
- 🎙️ File drop/chooser, mic recording and fake synthetic examples.
- 🧠 Whisper (`Xenova/whisper-tiny.en`) via transformers.js + ONNX Runtime Web with word timestamps.
- 🧩 Shared `@cleanroom-ai/core` PII rules and NER model for names/addresses.
- 🔢 Spoken-form normalization for digit-by-digit phones/cards/SSNs, spoken emails and password phrases.
- 🧹 Optional filler-word and long-silence cleanup.
- 🎧 Bleep, silence or cut selected regions, with ±80 ms padding.
- 📄 Export redacted WAV, transcript `.txt` and `.srt`.

## How it works

```
audio/video/mic ─► WebAudio decode ─► 16 kHz mono ─► Whisper worker (word timestamps)
                                      ├─► core rules + NER
                                      ├─► spoken-form PII normalization
                                      └─► review UI ─► bleep/silence/cut render ─► WAV/TXT/SRT
```

All runtime libraries and model files are vendored into `vendor/` and `models/` during `npm run vendor`. Deployed pages set `env.allowRemoteModels = false` and load models from their own origin.

## Run locally

```bash
npm ci
npm run vendor
npm test
node node_modules/@cleanroom-ai/core/scripts/serve.mjs .
```

Then open <http://127.0.0.1:8090/> (or the port printed by the server). For browser E2E tests:

```bash
npx playwright-core install chromium
E2E_BROWSER=chromium node tests/e2e.browser.mjs http://127.0.0.1:8090/
```

## CI/CD

- `ci.yml`: installs Node 24, caches the pinned Whisper model, vendors all runtime assets, runs Node tests (including Whisper integration when the model is fetched), starts a local server and runs a real-browser no-upload E2E test.
- `deploy-space.yml`: on `main`, if `HF_TOKEN` exists, vendors assets and uploads this static app to `cleanroom-ai/audio-pii-redaction` while excluding source-only files.

## Limitations

- English only (`whisper-tiny.en`).
- ASR and NER can make mistakes. Always review the waveform and transcript before sharing.
- Very noisy, overlapping or music-heavy audio can reduce timestamp accuracy.
- Browser audio decoding depends on formats supported by the user's browser.

## Credits & licenses

Built by **Parag Sawant** ([@paragpsawant](https://github.com/paragpsawant) · [parags.dev](https://parags.dev) · [LinkedIn](https://www.linkedin.com/in/paragsawant/)).

Audio Redactor is Apache-2.0. It uses `@cleanroom-ai/core` (Apache-2.0), ONNX Runtime Web (MIT), transformers.js (Apache-2.0), Whisper (MIT) and `bert-small-pii-detection` / ONNX conversion (see core model metadata). Model sources, revisions and SHA-256 hashes are documented in [`models/README.md`](models/README.md).
