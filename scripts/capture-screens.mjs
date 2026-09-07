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
  {
    path: "/agents/companion",
    name: "companion_agent",
    wait: 1500,
    start: "Talk to",
    // Long enough for the acoustic analyser to fill its rolling window, so the
    // shot shows populated measurements rather than an empty panel.
    startWait: 14000,
  },
  {
    path: "/agents/companion",
    name: "avatar_picker",
    wait: 2500,
    start: "Change avatar",
    startWait: 2000,
  },
  { path: "/sign", name: "fingerspelling", wait: 2500 },
  { path: "/appointments", name: "appointments", wait: 1500, seed: "appointments" },
  { path: "/history", name: "history", wait: 2000, seed: "history" },
  // The home page again in the light theme, since both are real palettes
  // rather than one inverted and a dark-only shot only shows half the work.
  { path: "/", name: "home_morning", wait: 1500, theme: "morning" },
];

/**
 * Sample data for the two pages that are empty on a fresh browser.
 *
 * Screenshotting the empty state of a history page communicates nothing, so
 * these seed a plausible few days — including one deliberately poor reading,
 * because how a bad measurement is presented is the more interesting half of
 * the design.
 */
const SEEDS = {
  appointments: () => {
    const at = (days, hour) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(hour, 30, 0, 0);
      return d.toISOString();
    };
    return {
      "sanjivani-setu.appointments.v1": [
        {
          id: "seed1",
          agentSlug: "companion",
          agentName: "Live Wellness Companion",
          startsAt: at(1, 9),
          durationMinutes: 20,
          reason: "Weekly check-in, same time each week so the readings compare.",
          status: "scheduled",
          createdAt: new Date().toISOString(),
        },
        {
          id: "seed2",
          agentSlug: "vitals",
          agentName: "Contactless Vitals",
          startsAt: at(4, 8),
          durationMinutes: 10,
          reason: "",
          status: "scheduled",
          createdAt: new Date().toISOString(),
        },
      ],
    };
  },
  history: () => {
    const reading = (daysAgo, hr, br, hrv, quality) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      d.setHours(8, 15, 0, 0);
      return {
        agentSlug: "vitals",
        agentName: "Contactless Vitals",
        takenAt: d.toISOString(),
        durationSeconds: 45,
        quality,
        qualityNote: quality < 0.5 ? "Too much head movement to trust this one" : null,
        metrics: [
          { label: "Heart rate", value: hr, unit: "bpm" },
          { label: "Breathing rate", value: br, unit: "/min" },
          { label: "HRV (SDNN)", value: hrv, unit: "ms" },
        ],
      };
    };
    return {
      "sanjivani-setu.history.v1": [
        reading(0, 66, 13, 58, 0.88),
        reading(1, 69, 14, 54, 0.81),
        reading(2, 132, 22, 12, 0.24),
        reading(3, 71, 14, 49, 0.76),
        reading(5, 74, 15, 45, 0.83),
        reading(7, 72, 14, 47, 0.79),
      ],
    };
  },
};

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
      const videoStream = canvas.captureStream(30);

      // A 130 Hz sawtooth stands in for a voice, so the companion's acoustic
      // panel shows real measured values in the screenshot.
      let audioStream = null;
      const makeAudioStream = () => {
        if (audioStream) return audioStream;
        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = 130;
        const gain = audioCtx.createGain();
        gain.gain.value = 0.25;
        const destination = audioCtx.createMediaStreamDestination();
        osc.connect(gain);
        gain.connect(destination);
        osc.start();
        audioStream = destination.stream;
        return audioStream;
      };

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async (constraints = {}) =>
            constraints.audio && !constraints.video ? makeAudioStream() : videoStream,
          enumerateDevices: async () => [],
        },
      });
    });

    for (const shot of SHOTS) {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle0" });
      if (shot.theme) {
        await page.evaluate((theme) => {
          window.localStorage.setItem("sanjivani-setu.theme", theme);
        }, shot.theme);
        await page.reload({ waitUntil: "networkidle0" });
      }
      if (shot.seed) {
        await page.evaluate((entries) => {
          for (const [key, value] of Object.entries(entries)) {
            window.localStorage.setItem(key, JSON.stringify(value));
          }
        }, SEEDS[shot.seed]());
        await page.reload({ waitUntil: "networkidle0" });
      }
      if (shot.start) {
        await page.evaluate((label) => {
          [...document.querySelectorAll("button")]
            .find((b) => b.textContent?.includes(label))
            ?.click();
        }, shot.start);
        await new Promise((r) => setTimeout(r, shot.startWait ?? 8000));
      }
      await new Promise((r) => setTimeout(r, shot.wait));
      const file = `${OUT}/${shot.name}.png`;
      await page.screenshot({ path: file, fullPage: shot.path === "/" || shot.path === "/sign" });
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
