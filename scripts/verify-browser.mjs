#!/usr/bin/env node
/**
 * Browser verification for the parts the unit tests cannot reach.
 *
 * The signal chain is covered by `npm test` against synthetic traces, but
 * that runs in Node and never touches a browser. This script drives a real
 * Chrome with a fake camera to confirm what only fails at run time: that the
 * WASM runtime and task models are served from our own origin, that the face
 * landmarker actually initialises, and that every page mounts without a
 * console error.
 *
 * Run: npm run verify:browser   (with the dev server already running)
 */

import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ??
  [
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find(existsSync);

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Noise that arrives on the console error channel without being an error.
 *
 * The XNNPACK line is the TensorFlow Lite runtime inside MediaPipe announcing
 * which delegate it picked. It is prefixed "INFO:" and is emitted on stderr,
 * which the browser surfaces as console.error — so it has to be matched here
 * or every page that loads a landmarker fails this check.
 */
const IGNORABLE_CONSOLE =
  /DevTools|favicon|Download the React|Lit is in dev mode|XNNPACK delegate|^INFO:/i;

async function main() {
  if (!CHROME) throw new Error("No Chrome binary found. Set CHROME_PATH.");

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-capture",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Chrome's own fake capture device cannot bind inside a container, so the
    // camera is stood up as a canvas-backed MediaStream instead. The app sees
    // an ordinary video track and every downstream stage runs for real; there
    // is simply no face in the frames, which is exactly the condition we want
    // to prove the engine handles by reporting nothing.
    await page.evaluateOnNewDocument(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      let frame = 0;
      const draw = () => {
        frame++;
        // A slowly shifting skin-like field, so the ROI sampler has plausible
        // pixel values to average even though no face will be detected.
        ctx.fillStyle = `rgb(${165 + Math.sin(frame / 12) * 3 | 0}, 120, 105)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
      };
      draw();

      const videoStream = canvas.captureStream(30);

      /**
       * A synthetic voice for the microphone, at a pitch we can check for.
       *
       * A sawtooth at 130 Hz has the same harmonic structure as voiced speech,
       * so the acoustic analyser should lock onto it and report roughly 130 Hz.
       * That turns "the microphone path runs" into a real assertion about the
       * number that comes out the far end of it.
       */
      window.__TEST_VOICE_HZ__ = 130;
      let audioStream = null;
      const makeAudioStream = () => {
        if (audioStream) return audioStream;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = window.__TEST_VOICE_HZ__;
        const gain = ctx.createGain();
        gain.gain.value = 0.25;
        const destination = ctx.createMediaStreamDestination();
        osc.connect(gain);
        gain.connect(destination);
        osc.start();
        audioStream = destination.stream;
        return audioStream;
      };

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async (constraints = {}) => {
            // Honour the constraints: the vitals agent asks for video only and
            // the companion asks for audio only, and handing back the wrong
            // kind of track would make both look broken for the wrong reason.
            if (constraints.audio && !constraints.video) return makeAudioStream();
            if (constraints.audio && constraints.video) {
              const combined = new MediaStream([
                ...videoStream.getVideoTracks(),
                ...makeAudioStream().getAudioTracks(),
              ]);
              return combined;
            }
            return videoStream;
          },
          enumerateDevices: async () => [
            { kind: "videoinput", deviceId: "canvas", label: "Canvas test camera" },
            { kind: "audioinput", deviceId: "osc", label: "Oscillator test microphone" },
          ],
        },
      });
    });

    const consoleErrors = [];
    const badStatuses = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORABLE_CONSOLE.test(m.text())) {
        consoleErrors.push(m.text());
      }
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 400 && !r.url().includes("favicon")) {
        badStatuses.push(`${r.status()} ${new URL(r.url()).pathname}`);
      }
    });

    console.log("\nMediaPipe assets served from our own origin");
    await page.goto(BASE, { waitUntil: "networkidle0" });
    for (const asset of [
      "/mediapipe/wasm/vision_wasm_internal.js",
      "/mediapipe/wasm/vision_wasm_internal.wasm",
      "/mediapipe/models/face_landmarker.task",
      "/mediapipe/models/hand_landmarker.task",
      "/mediapipe/models/pose_landmarker_lite.task",
    ]) {
      const status = await page.evaluate(
        async (url) => (await fetch(url, { method: "HEAD" })).status,
        asset,
      );
      record(asset, status === 200, `HTTP ${status}`);
    }

    console.log("\nCamera and face model, through the vitals agent");
    const mediapipeHits = new Set();
    page.on("response", (r) => {
      if (r.url().includes("/mediapipe/")) {
        mediapipeHits.add(`${new URL(r.url()).pathname} ${r.status()}`);
      }
    });

    await page.goto(`${BASE}/agents/vitals`, { waitUntil: "networkidle0" });
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Start measuring"),
      );
      if (!button) return false;
      button.click();
      return true;
    });
    record("vitals page exposes a Start control", clicked);

    // Wait for the camera to open and the model to download and instantiate.
    const deadline = Date.now() + 30_000;
    let stage = "";
    while (Date.now() < deadline) {
      stage = await page.evaluate(() => document.body.innerText);
      if (/Face tracked|Looking for a face|Camera unavailable|failed to load/i.test(stage)) {
        // Give the landmarker a moment past first detection.
        await new Promise((r) => setTimeout(r, 3000));
        stage = await page.evaluate(() => document.body.innerText);
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    const cameraOk = !/Camera unavailable|No camera was found/i.test(stage);
    record("camera stream acquired", cameraOk);

    const modelOk = !/Model failed to load|Could not load the face model/i.test(stage);
    record("face model initialised without error", modelOk);

    const trackingOk = /Face tracked|Looking for a face/i.test(stage);
    record(
      "detection loop is running",
      trackingOk,
      trackingOk ? stage.match(/Face tracked|Looking for a face/i)[0] : "never reached",
    );

    const wasmFetched = [...mediapipeHits].some((h) => h.includes("wasm"));
    const modelFetched = [...mediapipeHits].some((h) => h.includes("face_landmarker"));
    record("WASM runtime fetched locally", wasmFetched, [...mediapipeHits].join(", "));
    record("face model fetched locally", modelFetched);

    // With the fake device there is no face in frame, so the only correct
    // behaviour is to show nothing rather than invent a number.
    const noSpuriousHr = !/\b\d{2,3}\s*bpm\b/i.test(stage.replace(/Typical rest: 15–20/g, ""));
    record("no heart rate invented from a faceless video", noSpuriousHr);
    const bpWithheld = /one-time calibration|Not calibrated/i.test(stage);
    record("blood pressure withheld pending calibration", bpWithheld);

    console.log("\nMicrophone path, through the companion agent");
    const audioAsset = await page.evaluate(
      async (url) => (await fetch(url, { method: "HEAD" })).status,
      "/audio/voice-capture.js",
    );
    record("/audio/voice-capture.js served", audioAsset === 200, `HTTP ${audioAsset}`);

    consoleErrors.length = 0;
    await page.goto(`${BASE}/agents/companion`, { waitUntil: "networkidle0" });
    const startedConversation = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Start conversation"),
      );
      if (!button) return false;
      button.click();
      return true;
    });
    record("companion exposes a Start control", startedConversation);

    // The analyser needs a few seconds of audio in its rolling window before
    // it will commit to a number, which is the behaviour we want.
    let voiceText = "";
    const voiceDeadline = Date.now() + 25_000;
    while (Date.now() < voiceDeadline) {
      voiceText = await page.evaluate(() => document.body.innerText);
      if (/\b\d{2,3}\s*Hz\b/.test(voiceText)) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    const pitchMatch = voiceText.match(/(\d{2,3})\s*Hz/);
    const pitch = pitchMatch ? Number(pitchMatch[1]) : null;
    record(
      "audio worklet captured and the analyser produced a pitch",
      pitch !== null,
      pitch === null ? "no pitch reported within 25s" : `${pitch} Hz`,
    );
    record(
      "measured pitch matches the 130 Hz test tone",
      pitch !== null && Math.abs(pitch - 130) <= 8,
      pitch === null ? "not measured" : `${pitch} Hz vs 130 Hz`,
    );
    record(
      "companion ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

    console.log("\nPage mounting");
    for (const path of [
      "/",
      "/agents/vitals",
      "/agents/alertness",
      "/agents/motor",
      "/agents/fast",
      "/agents/companion",
    ]) {
      consoleErrors.length = 0;
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
      // 304 is a cache hit against the production server, which is a success.
      const status = res.status();
      record(
        `${path} mounts cleanly`,
        (status === 200 || status === 304) && consoleErrors.length === 0,
        consoleErrors.slice(0, 2).join(" | ") || `HTTP ${status}`,
      );
    }

    record("no failing network requests", badStatuses.length === 0, badStatuses.slice(0, 3).join(", "));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed` +
      (failed.length ? `, ${failed.length} FAILED` : ""),
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
