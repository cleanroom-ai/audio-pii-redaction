import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
const root = resolve(new URL("..", import.meta.url).pathname.slice(process.platform === "win32" ? 1 : 0));
execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts", "make-examples.ps1")], { stdio: "inherit" });
function words(text, total) {
  const toks = text.match(/[\w.'’@-]+|[,.;:!?]/g).filter((t) => !/^[,.;:!?]$/.test(t));
  const step = total / toks.length;
  return toks.map((text, i) => ({ text, start: +(0.25 + i * step).toFixed(2), end: +(0.25 + (i + .82) * step).toFixed(2) }));
}
writeFileSync(join(root, "examples", "voicemail.json"), JSON.stringify({ words: words("Hi this is Jennifer Walsh Call me back at four one five five five five zero one three two or email jennifer dot walsh at contoso dot com", 9.2) }, null, 2));
writeFileSync(join(root, "examples", "support-call.json"), JSON.stringify({ words: words("Um the card is four one one one one one one one one one one one one one one one The address is 742 Evergreen Terrace and my password is blue falcon ninety nine You know thanks", 13.8) }, null, 2));
