#!/usr/bin/env node
// Scratch: grab frames of the presenter preview so the warp can be eyeballed.
import { existsSync, mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);

const OUT = "/tmp/presenter";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
page.on("console", (m) => m.type() === "error" && console.error("browser:", m.text()));

await page.goto(`${BASE}/agents/companion`, { waitUntil: "networkidle0" });
await page.evaluate(() => {
  localStorage.setItem(
    "sanjivani-setu.companion-profile.v1",
    JSON.stringify({ presence: "photoreal", avatarId: "vikram", profileId: "scratchscratch" }),
  );
});
await page.reload({ waitUntil: "networkidle0" });

// Open settings, where the selected avatar mouths the preview line.
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === "Change avatar",
  );
  button?.click();
});
await new Promise((r) => setTimeout(r, 1500));

// Blow the selected picker card up so the mouth is big enough to judge.
await page.evaluate(() => {
  const style = document.createElement("style");
  style.textContent = `
    .grid.gap-3.sm\\:grid-cols-3 { display: block !important; }
    .grid.gap-3.sm\\:grid-cols-3 > button { display: none !important; }
    .grid.gap-3.sm\\:grid-cols-3 > button:nth-child(2) {
      display: block !important; width: 900px !important;
    }`;
  document.head.appendChild(style);
});
await new Promise((r) => setTimeout(r, 600));

const tiles = await page.$$('canvas[aria-label*="synthetic presenter"]');
console.log(
  "presenter canvases:",
  await page.evaluate(() =>
    [...document.querySelectorAll('canvas[aria-label*="synthetic presenter"]')].map((c) => ({
      label: c.getAttribute("aria-label"),
      jaw: c.dataset.jaw,
    })),
  ),
);
const tile = tiles[Number(process.env.TILE ?? 0)];
if (!tile) {
  console.error("no presenter canvas found");
  console.log(
    await page.evaluate(() =>
      [...document.querySelectorAll("canvas")].map((c) => c.getAttribute("aria-label")),
    ),
  );
} else {
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 260));
    const jaw = await page.evaluate((el) => el.dataset.jaw, tile);
    await tile.screenshot({ path: `${OUT}/frame-${String(i).padStart(2, "0")}-jaw${jaw}.png` });
    process.stdout.write(`${i}:${jaw} `);
  }
  console.log();
}

await browser.close();
