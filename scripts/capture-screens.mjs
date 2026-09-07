#!/usr/bin/env node
/**
 * Capture screenshots of the running app for documentation.
 *
 * Uses the same canvas-backed camera substitute as the browser verification,
 * so the camera pages show their real running state rather than a permission
 * prompt. Run with the dev server up: node scripts/capture-screens.mjs [outDir]
 */

import { existsSync, mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "./screenshots";
const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(
    existsSync,
  );

const SHOTS = [
  { path: "/", name: "home_agent_store", wait: 1500 },
  { path: "/agents/vitals", name: "vitals_agent", wait: 1500, start: "Start measuring" },
  { path: "/agents/motor", name: "motor_agent", wait: 1200 },
  { path: "/agents/fast", name: "fast_agent", wait: 1200 },
];

async function main() {
  if (!CHROME) throw new Error("No Chrome binary found. Set CHROME_PATH.");
  mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=2"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 });

    await page.evaluateOnNewDocument(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      let frame = 0;
      const draw = () => {
        frame++;
        ctx.fillStyle = `rgb(${(165 + Math.sin(frame / 12) * 3) | 0}, 120, 105)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
      };
      draw();
      const stream = canvas.captureStream(30);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: async () => stream, enumerateDevices: async () => [] },
      });
    });

    for (const shot of SHOTS) {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle0" });
      if (shot.start) {
        await page.evaluate((label) => {
          [...document.querySelectorAll("button")]
            .find((b) => b.textContent?.includes(label))
            ?.click();
        }, shot.start);
        await new Promise((r) => setTimeout(r, 8000));
      }
      await new Promise((r) => setTimeout(r, shot.wait));
      const file = `${OUT}/${shot.name}.png`;
      await page.screenshot({ path: file, fullPage: shot.path === "/" });
      console.log(`  wrote ${file}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
