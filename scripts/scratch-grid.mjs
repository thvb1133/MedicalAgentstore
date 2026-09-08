#!/usr/bin/env node
// Scratch: render the presenter at fixed expressions and crop to the mouth.
import { existsSync, mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);

const OUT = "/tmp/grid";
mkdirSync(OUT, { recursive: true });

const cases = process.env.CASES
  ? JSON.parse(process.env.CASES)
  : [
      { jaw: 0, spread: 0, blink: 0 },
      { jaw: 0.3, spread: 0, blink: 0 },
      { jaw: 0.6, spread: 0.2, blink: 0 },
      { jaw: 0.95, spread: 0.2, blink: 0 },
      { jaw: 0.3, spread: 1, blink: 0 },
      { jaw: 0.3, spread: -1, blink: 0 },
      { jaw: 0, spread: 0, blink: 1 },
      { jaw: 0, spread: 0, blink: 0.5 },
    ];

const avatar = process.env.AVATAR ?? "vikram";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 760, deviceScaleFactor: 1 });
page.on("console", (m) => m.type() === "error" && console.error("browser:", m.text()));

for (const c of cases) {
  const url = `${BASE}/scratch?avatar=${avatar}&jaw=${c.jaw}&spread=${c.spread}&blink=${c.blink}`;
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForFunction("document.body.dataset.drawn === 'yes'", { timeout: 15000 });
  const canvas = await page.$("canvas");
  const name = `${avatar}-j${c.jaw}-s${c.spread}-b${c.blink}.png`;
  await canvas.screenshot({ path: `${OUT}/${name}` });
  console.log(name);
}

await browser.close();
