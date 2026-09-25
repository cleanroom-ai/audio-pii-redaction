import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { vendorCore } from "@cleanroom-ai/core/scripts/vendor.mjs";
import "./fetch-models.mjs";

const appDir = resolve(dirname(new URL(import.meta.url).pathname.slice(process.platform === "win32" ? 1 : 0)), "..");
vendorCore({ appDir, models: ["pii"], libs: ["ort", "transformers"] });
const src = join(appDir, ".cache", "Xenova", "whisper-tiny.en");
const dst = join(appDir, "models", "whisper");
if (!existsSync(join(src, "onnx", "encoder_model_quantized.onnx"))) throw new Error("Whisper cache missing; run npm run vendor again");
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const f of ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer_config.json", "tokenizer.json", "onnx/decoder_model_merged_quantized.onnx", "onnx/encoder_model_quantized.onnx"]) {
  cpSync(join(src, ...f.split("/")), join(dst, ...f.split("/")), { recursive: true });
}
console.log("   models: whisper");
