import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openApp } from "@cleanroom-ai/core/testing/browser.mjs";

const base = process.argv[2] || "http://127.0.0.1:8090/";
const shotsDir = fileURLToPath(new URL("../.cache/e2e/", import.meta.url));
mkdirSync(shotsDir, { recursive: true });
let app;
let finished = false;
try {
  app = await openApp(base, { shotsDir });
  const { page, shot, assertLogo, finish } = app;
  await page.goto(base);
  await page.locator("#engine[data-kind=ok]").waitFor();
  await assertLogo();
  console.log(`engine ready | crossOriginIsolated=${await page.evaluate(() => crossOriginIsolated)}`);

  async function runExample(name, labels) {
    if (await page.locator("#reset").isVisible()) await page.locator("#reset").click();
    const t0 = Date.now();
    await page.getByRole("button", { name }).click();
    await page.locator("#status[data-kind=ok]").waitFor({ timeout: Number(process.env.E2E_SCAN_TIMEOUT_MS || 240_000) }).catch(async (e) => {
      await shot(`${name.toLowerCase().replace(/\W+/g, "-")}-FAILED`).catch(() => {});
      const status = await page.locator("#status").innerText().catch(() => "?");
      const kind = await page.locator("#status").getAttribute("data-kind").catch(() => "?");
      const engine = await page.locator("#engine").innerText().catch(() => "?");
      throw new Error(`${name}: scan did not finish; status[${kind}]="${status}" engine="${engine}"\n${app.problems.join("\n")}\n${e.message}`);
    });
    const status = await page.locator("#status").innerText();
    const items = await page.locator("#detections li .name").allInnerTexts();
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)}s | ${status}`);
    console.log("  " + items.join(" | "));
    for (const label of labels) assert.ok(items.some((i) => i.includes(label)), `${name} missing ${label}`);
    await shot(name.toLowerCase().replace(/\W+/g, "-"));
  }
  await runExample("Voicemail", ["Person", "Phone", "Email"]);
  await runExample("Support call", ["Credit Card", "Address", "Password Or Secret"]);
  await page.getByLabel("Remove fillers & long pauses").check();
  await page.waitForFunction(() => [...document.querySelectorAll("#detections li .name")].some((n) => /Filler|Long Silence/.test(n.textContent)));
  assert.ok((await page.locator("#detections li .name").allInnerTexts()).some((t) => /Filler|Long Silence/.test(t)), "cleanup detections");

  const [txt] = await Promise.all([page.waitForEvent("download"), page.evaluate(() => document.querySelector("#download-txt").click())]);
  const txtBody = readFileSync(await txt.path(), "utf8");
  assert.match(txtBody, /\[(CREDIT_CARD|PASSWORD_OR_SECRET|ADDRESS)\]/);
  assert.ok(!txtBody.includes("4111111111111111"));
  await txt.delete();
  const [wav] = await Promise.all([page.waitForEvent("download"), page.evaluate(() => document.querySelector("#download-wav").click())]);
  const wavBody = readFileSync(await wav.path());
  assert.equal(wavBody.subarray(0, 4).toString(), "RIFF");
  await wav.delete();
  await finish();
  finished = true;
  console.log("E2E OK");
} finally {
  if (app && !finished) await Promise.race([app.browser.close(), new Promise((r) => setTimeout(r, 5000))]);
}
process.exit(0);
