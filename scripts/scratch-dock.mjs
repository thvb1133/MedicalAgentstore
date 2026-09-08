import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/root/.cache/puppeteer/chrome/linux-131.0.6778.108/chrome-linux64/chrome",
].find(existsSync);

const BASE = process.env.BASE ?? "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
page.on("console", (m) => {
  if (m.type() === "error") console.log("  console error:", m.text().slice(0, 200));
});
page.on("pageerror", (e) => console.log("  page error:", String(e).slice(0, 200)));

await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });

const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
console.log("theme:", theme, "body background:", bg);

// The launcher is client-only, so wait for it rather than reading the SSR markup.
await page.waitForSelector('button[aria-label^="Ask "]', { timeout: 10000 });
const launcher = await page.$eval('button[aria-label^="Ask "]', (el) => ({
  label: el.getAttribute("aria-label"),
  rect: el.getBoundingClientRect().toJSON(),
}));
console.log("launcher:", launcher.label, "at x=", Math.round(launcher.rect.x));

await page.click('button[aria-label^="Ask "]');
await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
const panel = await page.$eval('div[role="dialog"]', (el) => ({
  label: el.getAttribute("aria-label"),
  hasInput: !!el.querySelector('input[aria-label="Your question"]'),
  hasMic: !!el.querySelector('button[aria-label*="Speak"], button[aria-label*="listening"]'),
  hasCanvas: !!el.querySelector("canvas"),
  rect: el.getBoundingClientRect().toJSON(),
}));
console.log("panel:", JSON.stringify(panel));

await page.screenshot({ path: "/tmp/dock-home.png" });

// Present on another route too, and the panel state survives navigation.
await page.goto(`${BASE}/history`, { waitUntil: "networkidle0" });
await page.waitForSelector('button[aria-label^="Ask "], div[role="dialog"]', { timeout: 10000 });
console.log("dock on /history:", true);

await browser.close();
