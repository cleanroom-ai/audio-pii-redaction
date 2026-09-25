import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const WHISPER = {
  id: "Xenova/whisper-tiny.en",
  revision: "79fb389fc764e7c395bd330e9531d9d32ada7049",
  files: [
    ["config.json", "37a1073be00d19118c06557896c7c148598f4d8277edc0f5bc07c9f5554839f1"],
    ["generation_config.json", "132c95ba9db45f4498f2eab3fea7c1d6a174005010f8f6b7d20cfd5e9795996b"],
    ["preprocessor_config.json", "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d"],
    ["tokenizer_config.json", "e082c1ad251541bf277967a703252cddd4bb37a71a43737e03d050c22ec08238"],
    ["tokenizer.json", "c6ee8f089220a5b1188f6426456772572671c6141ae007eecb83c6a8349f5deb"],
    ["onnx/decoder_model_merged_quantized.onnx", "dbb2e063b7fbc41d9803b9698f93ecb035c50cbb3fb87b56cb131e4a5eb99059"],
    ["onnx/encoder_model_quantized.onnx", "8cc3c6f8563d1b3fbd2c5af9f64c2bed8b020bc593c402d1ef53b9f08fbf1b90"],
  ],
};
const root = resolve(new URL("..", import.meta.url).pathname.slice(process.platform === "win32" ? 1 : 0));
const cacheDir = join(root, ".cache", "Xenova", "whisper-tiny.en");
function sha(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
async function download(file, dst) {
  const url = `https://huggingface.co/${WHISPER.id}/resolve/${WHISPER.revision}/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
}
for (const [file, expected] of WHISPER.files) {
  const dst = join(cacheDir, ...file.split("/"));
  if (!existsSync(dst) || sha(dst) !== expected) {
    console.log(`fetch ${file}`);
    await download(file, dst);
  }
  const got = sha(dst);
  if (got !== expected) throw new Error(`SHA-256 mismatch for ${file}: ${got}`);
}
console.log(`Whisper model ready in ${cacheDir}`);
