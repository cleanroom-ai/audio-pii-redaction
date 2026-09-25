# Bundled models

Runtime model files are build outputs created by `npm run vendor` and are intentionally git-ignored. The app loads them only from its own origin with `env.allowRemoteModels = false`.

## Whisper ASR

- Model: `Xenova/whisper-tiny.en`
- Pinned revision: `79fb389fc764e7c395bd330e9531d9d32ada7049`
- Base model: `openai/whisper-tiny.en`
- License: MIT (Whisper); ONNX conversion published for transformers.js use.
- Why this model: it is the smallest English Whisper model we verified in transformers.js 4.3.0 that returns `return_timestamps: "word"` in Node. `onnx-community/whisper-tiny.en` failed because its decoder ONNX output lacks cross-attentions.
- Bundled size: ~41 MB quantized ONNX + tokenizer/config files.

| File | SHA-256 | Bytes |
|---|---|---:|
| `whisper/config.json` | `37a1073be00d19118c06557896c7c148598f4d8277edc0f5bc07c9f5554839f1` | 2,202 |
| `whisper/generation_config.json` | `132c95ba9db45f4498f2eab3fea7c1d6a174005010f8f6b7d20cfd5e9795996b` | 1,590 |
| `whisper/preprocessor_config.json` | `a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d` | 339 |
| `whisper/tokenizer_config.json` | `e082c1ad251541bf277967a703252cddd4bb37a71a43737e03d050c22ec08238` | 835 |
| `whisper/tokenizer.json` | `c6ee8f089220a5b1188f6426456772572671c6141ae007eecb83c6a8349f5deb` | 2,128,494 |
| `whisper/onnx/decoder_model_merged_quantized.onnx` | `dbb2e063b7fbc41d9803b9698f93ecb035c50cbb3fb87b56cb131e4a5eb99059` | 30,727,382 |
| `whisper/onnx/encoder_model_quantized.onnx` | `8cc3c6f8563d1b3fbd2c5af9f64c2bed8b020bc593c402d1ef53b9f08fbf1b90` | 10,124,913 |

## PII name model

`npm run vendor` also copies `@cleanroom-ai/core`'s `pii` bundle:

- `onnx-community/bert-small-pii-detection-ONNX`
- Upstream model: `gravitee-io/bert-small-pii-detection`
- See `@cleanroom-ai/core/models/README.md` for the pinned sources, checksums and license.
