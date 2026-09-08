import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
  existsSync,
);
const BASE = process.env.BASE ?? "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1100, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("  page error:", String(e).slice(0, 200)));

await page.goto(`${BASE}/agents/companion`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2000));

const change = await page.$$eval("button", (els) => {
  const b = els.find((e) => e.textContent?.trim() === "Change avatar");
  if (b) b.click();
  return !!b;
});
console.log("opened settings:", change);
await new Promise((r) => setTimeout(r, 2500));

const names = await page.$$eval("button", (els) =>
  els.map((e) => e.textContent?.trim() ?? "").filter((t) => /^(Maya|Daniel|Grace|Sofia|Nova|Pip)/.test(t)),
);
console.log("roster on screen:", names.map((n) => n.split("\n")[0]).join(", ") || "(none)");

const looks = await page.$$eval("button", (els) =>
  els.map((e) => e.textContent?.trim()).filter((t) => t === "A face" || t === "A shape"),
);
console.log("look choices:", looks.join(", ") || "(none)");

const canvases = await page.$$eval("canvas", (els) => els.length);
console.log("presenter canvases:", canvases);

await page.screenshot({ path: "/tmp/companion.png" });
await browser.close();
