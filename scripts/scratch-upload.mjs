import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
  existsSync,
);
const BASE = process.env.BASE ?? "http://localhost:3000";
const PICTURE = process.env.PICTURE ?? "/opt/cursor/artifacts/assets/nova-photo.png";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1100, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("  page error:", String(e).slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("  console error:", m.text().slice(0, 200));
});

await page.goto(`${BASE}/agents/companion`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));

await page.$$eval("button", (els) => {
  els.find((e) => e.textContent?.trim() === "Change avatar")?.click();
});
await new Promise((r) => setTimeout(r, 1500));

const input = await page.$('input[type="file"]');
if (!input) throw new Error("no file input found");
await input.uploadFile(PICTURE);

console.log("uploaded, waiting for the face to be found…");
await page.waitForFunction(
  () =>
    Array.from(document.querySelectorAll("*")).some((e) =>
      (e.textContent ?? "").includes("animated from your picture"),
    ) ||
    Array.from(document.querySelectorAll("p")).some((e) =>
      (e.textContent ?? "").includes("No face found"),
    ),
  { timeout: 60000 },
);

const outcome = await page.evaluate(() => {
  const animated = Array.from(document.querySelectorAll("*")).some((e) =>
    (e.textContent ?? "").includes("animated from your picture"),
  );
  const failed = Array.from(document.querySelectorAll("p")).find((e) =>
    (e.textContent ?? "").includes("No face found"),
  );
  const cached = window.localStorage.getItem("sanjivani-setu.portrait-rig.v1");
  return {
    animated,
    failure: failed?.textContent?.slice(0, 60) ?? null,
    rigCached: cached ? JSON.parse(cached).rig.points.length : 0,
  };
});
console.log("outcome:", JSON.stringify(outcome));

// Prove the mouth is actually driven, by asking the presenter for a frame.
const jaw = await page.evaluate(async () => {
  const canvases = Array.from(document.querySelectorAll("canvas"));
  const tile = canvases.find((c) => c.dataset.jaw !== undefined);
  if (!tile) return null;
  const seen = [];
  for (let i = 0; i < 40; i++) {
    seen.push(Number(tile.dataset.jaw));
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { max: Math.max(...seen), distinct: new Set(seen.map((v) => v.toFixed(3))).size };
});
console.log("presenter jaw over 40 frames:", JSON.stringify(jaw));

await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").includes("Use a different picture"),
  );
  el?.scrollIntoView({ block: "center" });
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: "/tmp/upload.png" });
await browser.close();
