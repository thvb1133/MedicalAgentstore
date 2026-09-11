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

/**
 * A face to upload, when checking that an uploaded photograph animates.
 *
 * One of the shipped presenter portraits, which means the check needs no
 * fixture of its own and the picture is unambiguously of nobody.
 */
const SAMPLE_FACE = "public/portraits/nova.photo.webp";

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
        `${BASE}${asset}`,
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

    // The trust panels report on a face. With none in frame they have to stay
    // silent rather than announce that the light is unusable or that a
    // rhythm was uneven, both of which would be claims about nobody.
    record(
      "the trust panels say nothing about a face that is not there",
      !/Beat spacing|Cross-check/i.test(stage) && !/Not enough/i.test(stage),
      stage.slice(0, 80),
    );

    console.log("\nMicrophone path, through the companion agent");
    const audioAsset = await page.evaluate(
      async (url) => (await fetch(url, { method: "HEAD" })).status,
      `${BASE}/audio/voice-capture.js`,
    );
    record("/audio/voice-capture.js served", audioAsset === 200, `HTTP ${audioAsset}`);

    consoleErrors.length = 0;
    await page.goto(`${BASE}/agents/companion`, { waitUntil: "networkidle0" });
    const startedConversation = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.startsWith("Talk to"),
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

    console.log("\nAvatar picker");
    consoleErrors.length = 0;
    await page.goto(`${BASE}/agents/companion`, { waitUntil: "networkidle0" });
    const openedSettings = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Change avatar",
      );
      if (!button) return false;
      button.click();
      return true;
    });
    record("companion exposes an avatar control", openedSettings);

    await new Promise((r) => setTimeout(r, 800));
    const picker = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      return {
        // Each avatar preview is a live canvas, so counting them confirms the
        // presence renderer mounted once per option rather than the grid
        // being a set of placeholders.
        previews: dialog.querySelectorAll("canvas").length,
        voices: [...dialog.querySelectorAll("button")].filter(
          (b) => b.getAttribute("aria-label")?.startsWith("Hear "),
        ).length,
        toggles: dialog.querySelectorAll('[role="switch"]').length,
        text: dialog.innerText,
      };
    });
    record("avatar picker opens", picker !== null);
    record(
      "every avatar renders a live preview",
      (picker?.previews ?? 0) >= 6,
      `${picker?.previews ?? 0} canvases`,
    );
    // Only the voices for the selected language are offered. A voice reading
    // a language it was not trained on comes out as noise, so the count here
    // is the English catalogue rather than every voice that exists.
    record(
      "voices can be previewed before choosing",
      (picker?.voices ?? 0) >= 3,
      `${picker?.voices ?? 0} preview buttons`,
    );
    record("access settings are offered", (picker?.toggles ?? 0) >= 3);
    record(
      "access mode is described for the people it is for",
      /Deaf|hard of hearing/i.test(picker?.text ?? ""),
    );
    record(
      "languages are named the way their speakers name them",
      /हिन्दी/.test(picker?.text ?? "") && /日本語/.test(picker?.text ?? ""),
    );
    record(
      "signing is offered at three levels, off included",
      /fingerspelling/i.test(picker?.text ?? "") &&
        /key signs/i.test(picker?.text ?? "") &&
        /caption only/i.test(picker?.text ?? ""),
    );
    record(
      "the signing setting says it is not interpretation",
      /real ASL signs/i.test(picker?.text ?? "") &&
        /without a Deaf signer/i.test(picker?.text ?? ""),
    );
    record(
      "the portrait upload says the picture never leaves the device",
      /never uploaded/i.test(picker?.text ?? ""),
    );
    record(
      "the portrait upload says the face will be made to speak",
      /will appear to speak/i.test(picker?.text ?? ""),
    );

    // Changing language has to move the voice with it.
    const languageSwitch = await page.evaluate(async () => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const before = [...dialog.querySelectorAll("button")]
        .map((b) => b.getAttribute("aria-label"))
        .filter((l) => l?.startsWith("Hear "));
      const hindi = [...dialog.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("हिन्दी"),
      );
      if (!hindi) return null;
      hindi.click();
      await new Promise((r) => setTimeout(r, 400));
      const after = [...dialog.querySelectorAll("button")]
        .map((b) => b.getAttribute("aria-label"))
        .filter((l) => l?.startsWith("Hear "));
      return { before, after };
    });
    record(
      "choosing a language changes which voices are offered",
      (languageSwitch?.after?.length ?? 0) > 0 &&
        languageSwitch.after.every((v) => !languageSwitch.before.includes(v)),
      `${languageSwitch?.before?.length ?? 0} → ${languageSwitch?.after?.length ?? 0} voices`,
    );

    // Put it back so the rest of the run is in English.
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      [...(dialog?.querySelectorAll("button") ?? [])]
        .find((b) => b.textContent?.includes("English (UK)"))
        ?.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    // Switching avatar must change the persona shown and survive a reload,
    // which is the whole point of storing the profile.
    const switched = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const target = [...dialog.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Grace"),
      );
      if (!target) return false;
      target.click();
      const done = [...dialog.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Done",
      );
      done?.click();
      return true;
    });
    await new Promise((r) => setTimeout(r, 500));
    const afterSwitch = await page.evaluate(() => document.body.innerText);
    record("choosing an avatar takes effect", switched && /Talk to Grace/.test(afterSwitch));

    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));
    const afterReload = await page.evaluate(() => document.body.innerText);
    record("the choice survives a reload", /Talk to Grace/.test(afterReload));

    // The presenters must be a roster rather than five variations on one
    // person, because a health tool defaulting to one part of the world is a
    // thing people notice about themselves.
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.trim() === "Change avatar")
        ?.click();
    });
    await new Promise((r) => setTimeout(r, 900));

    const roster = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const names = ["Maya", "Daniel", "Grace", "Sofia", "Nova", "Pip"];
      const text = dialog?.textContent ?? "";
      return {
        present: names.filter((n) => text.includes(n)).length,
        looks: [...(dialog?.querySelectorAll("button") ?? [])]
          .map((b) => b.textContent?.trim())
          .filter((t) => t === "A face" || t === "A shape").length,
        // Only a talking presenter publishes its jaw, so this counts the
        // animated ones rather than every canvas in the grid.
        presenters: [...(dialog?.querySelectorAll("canvas") ?? [])].filter(
          (c) => c.dataset.jaw !== undefined,
        ).length,
        // The disclosure is not optional and is not behind a disclosure
        // triangle: it sits on the tile.
        badges: [...(dialog?.querySelectorAll("*") ?? [])].filter(
          (e) => e.childElementCount === 0 && e.textContent?.trim() === "AI avatar",
        ).length,
      };
    });
    record("all six companions are offered", roster.present === 6, `${roster.present}/6`);
    record("the look is a face or a shape", roster.looks === 2);
    record(
      "the five presenters are animated, and Pip is not",
      roster.presenters === 5,
      `${roster.presenters} canvases`,
    );
    record("every presenter is badged as an AI avatar", roster.badges >= 5, `${roster.badges} badges`);

    // A photograph somebody uploads has to become a presenter too — the mesh
    // is found here in the browser rather than at build time — and the
    // warning about whose face it is has to be at the point of upload.
    const consent = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.textContent ?? "",
    );
    record(
      "uploading warns about using someone else's face",
      /will appear to speak/i.test(consent) && /agreement/i.test(consent),
    );

    const upload = await page.$('input[type="file"]');
    if (upload) {
      const before = await page.evaluate(
        () =>
          [
            ...(document.querySelector('[role="dialog"]')?.querySelectorAll("canvas") ?? []),
          ].filter((c) => c.dataset.jaw !== undefined).length,
      );
      await upload.uploadFile(SAMPLE_FACE);
      await page
        .waitForFunction(
          () => {
            const text = document.querySelector('[role="dialog"]')?.textContent ?? "";
            return /animated from your picture/i.test(text) || /No face found/i.test(text);
          },
          { timeout: 90000 },
        )
        .catch(() => undefined);

      const uploaded = await page.evaluate(() => {
        const text = document.querySelector('[role="dialog"]')?.textContent ?? "";
        const cached = localStorage.getItem("sanjivani-setu.portrait-rig.v1");
        return {
          animated: /animated from your picture/i.test(text),
          landmarks: cached ? JSON.parse(cached).rig.points.length : 0,
        };
      });
      record("an uploaded photograph becomes a presenter", uploaded.animated);
      record(
        "its face is found in the browser and kept",
        uploaded.landmarks >= 478,
        `${uploaded.landmarks} landmarks`,
      );

      // And the mouth is actually driven, rather than the picture merely
      // being drawn onto a canvas. Measured on the canvas the upload added,
      // while its preview line is still playing.
      const jaw = await page.evaluate(async (previous) => {
        // Inside the dialog only: the last presenter on the page is the live
        // tile behind it, which is idle and correctly not moving its mouth.
        const find = () =>
          [...(document.querySelector('[role="dialog"]')?.querySelectorAll("canvas") ?? [])].filter(
            (c) => c.dataset.jaw !== undefined,
          );
        // The attribute is written by the animation loop, so a canvas that
        // has only just mounted does not have one yet.
        for (let i = 0; i < 120 && find().length <= previous; i++) {
          await new Promise((r) => requestAnimationFrame(r));
        }
        const tiles = find();
        if (tiles.length <= previous) return null;
        const tile = tiles[tiles.length - 1];
        tile.scrollIntoView({ block: "center" });
        const seen = [];
        for (let i = 0; i < 60; i++) {
          seen.push(Number(tile.dataset.jaw));
          await new Promise((r) => requestAnimationFrame(r));
        }
        return { max: Math.max(...seen), distinct: new Set(seen.map((v) => v.toFixed(3))).size };
      }, before);
      record(
        "the uploaded face actually moves its mouth",
        jaw !== null && jaw.max > 0.1 && jaw.distinct > 5,
        jaw ? `max jaw ${jaw.max}, ${jaw.distinct} distinct` : "no presenter canvas",
      );

      await page.evaluate(() => {
        [...(document.querySelector('[role="dialog"]')?.querySelectorAll("button") ?? [])]
          .find((b) => b.textContent?.trim() === "Remove")
          ?.click();
      });
    } else {
      record("an uploaded photograph becomes a presenter", false, "no file input");
    }

    await page.evaluate(() => {
      [...(document.querySelector('[role="dialog"]')?.querySelectorAll("button") ?? [])]
        .find((b) => b.textContent?.trim() === "Done")
        ?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    record(
      "avatar picker ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

    console.log("\nSigning");
    consoleErrors.length = 0;
    await page.goto(`${BASE}/sign`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500));

    const signing = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const ctx = canvas?.getContext("2d");
      let painted = 0;
      const tones = new Set();
      if (ctx && canvas.width > 0) {
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 8) {
            painted++;
            tones.add(`${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`);
          }
        }
      }
      return {
        painted,
        tones: tones.size,
        label: canvas?.getAttribute("aria-label") ?? "",
        tabs: [...document.querySelectorAll('[role="tab"]')].length,
        text: document.body.innerText,
      };
    });

    record("the signing page offers both signing and spelling", signing.tabs === 2);
    record("a signer is drawn", signing.painted > 3000, `${signing.painted} pixels`);
    // Skin, sleeve, torso, hair. A single tone would mean the body never drew
    // and only the hand did.
    record("the body, arms and hands all render", signing.tones >= 4, `${signing.tones} tones`);
    record("the canvas describes what is being signed", /^A signer signing: .+/.test(signing.label));
    record("the lexicon is listed for checking", /the lexicon · \d+ signs/i.test(signing.text));
    record(
      "the page says these are real signs but not fluent ASL",
      /not fluent ASL/i.test(signing.text),
    );
    record(
      "the page admits it was built without a Deaf signer",
      /without a Deaf signer/i.test(signing.text),
    );
    record(
      "it reports how much of the text it actually covered",
      /\d+ signed · \d+ spelled · \d+ skipped/.test(signing.text),
    );

    // Both hands have to move, or two-handed signs are not being produced.
    const signMoved = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const ctx = canvas.getContext("2d");
      // Track the horizontal spread of painted pixels: a two-handed sign
      // changes it, a still frame does not.
      const spread = () => {
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let min = canvas.width, max = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 8) {
            const x = (i / 4) % canvas.width;
            if (x < min) min = x;
            if (x > max) max = x;
            count++;
          }
        }
        return { width: max - min, count };
      };
      const samples = [];
      for (let i = 0; i < 6; i++) {
        samples.push(spread());
        await new Promise((r) => setTimeout(r, 400));
      }
      return samples;
    });
    const spreads = signMoved.map((s) => s.width);
    const counts = signMoved.map((s) => s.count);
    record(
      "the signer moves through the sequence",
      Math.max(...counts) - Math.min(...counts) > 200,
      `pixel count varied by ${Math.max(...counts) - Math.min(...counts)}`,
    );
    record(
      "the hands reach out into signing space",
      Math.max(...spreads) > 0,
      `widest span ${Math.max(...spreads)}px`,
    );
    /*
     * Fingerspelling has to survive being chained after signs.
     *
     * The state is unit-tested, but what was doubted is the render: whether
     * the hand actually comes up to the spelling position mid-sentence rather
     * than hanging at the side while the label claims otherwise.
     */
    await page.evaluate(() => {
      const box = document.querySelector("textarea");
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      ).set;
      setter.call(box, "Your heart rate is 72.");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 300));
    const spellRender = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const ctx = canvas.getContext("2d");
      const dpr = canvas.width / canvas.clientWidth;
      const unit = Math.min(canvas.clientWidth / 2.5, canvas.clientHeight / 2.9);
      const originY = canvas.clientHeight * 0.56;
      const gloss = () =>
        canvas.parentElement.querySelector("span[style]")?.textContent ?? "";
      const spelling = [];
      const idle = [];
      const started = performance.now();
      await new Promise((resolve) => {
        const tick = () => {
          const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const w = canvas.width;
          let sum = 0;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if ((i / 4) % w > w / 2) continue;
            const [r0, g0, b0] = [d[i], d[i + 1], d[i + 2]];
            if (d[i + 3] > 40 && r0 > 140 && r0 < 240 && g0 > 90 && g0 < 190 && r0 - b0 > 40) {
              sum += Math.floor(i / 4 / w);
              n++;
            }
          }
          if (n > 0) {
            const y = (sum / n / dpr - originY) / unit;
            const label = gloss();
            if (/spelling/i.test(label)) spelling.push(y);
            else if (label === "·") idle.push(y);
          }
          if (performance.now() - started < 9000) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      return { frames: spelling.length, spelling: mean(spelling), idle: mean(idle) };
    });
    record(
      "fingerspelling still happens when chained after signs",
      spellRender.frames > 20,
      `${spellRender.frames} frames spelling`,
    );
    record(
      "the spelling hand comes up rather than hanging at the side",
      spellRender.spelling < spellRender.idle - 0.1,
      `${spellRender.spelling.toFixed(2)} vs ${spellRender.idle.toFixed(2)} body units`,
    );

    /*
     * The brows carry grammar, so measure them rather than trusting them.
     *
     * They were once drawn at a height that put a raised brow underneath the
     * hair — dark on dark. The marking was applied, the tests passed, and the
     * single most important non-manual marker in the language was invisible.
     * Nothing short of reading the pixels catches that.
     */
    const brows = {};
    for (const [label, sentence] of [
      ["statement", "You feel tired."],
      ["question", "Do you have pain?"],
      ["wh", "How do you feel?"],
    ]) {
      await page.evaluate((text) => {
        const box = document.querySelector("textarea");
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        ).set;
        setter.call(box, text);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      }, sentence);
      await new Promise((r) => setTimeout(r, 300));
      brows[label] = await page.evaluate(async () => {
        const canvas = document.querySelector("canvas");
        const ctx = canvas.getContext("2d");
        const dpr = canvas.width / canvas.clientWidth;
        const unit = Math.min(canvas.clientWidth / 2.5, canvas.clientHeight / 2.9);
        const cx = canvas.clientWidth / 2;
        const cy = canvas.clientHeight * 0.56 - 1.02 * unit;
        const r = 0.31 * unit;
        // A band across the brows: below the hairline, above the eyes.
        const x0 = Math.round((cx - r * 0.75) * dpr);
        const x1 = Math.round((cx + r * 0.75) * dpr);
        const y0 = Math.round((cy - r * 0.42) * dpr);
        const y1 = Math.round((cy + r * 0.03) * dpr);
        const rows = [];
        const started = performance.now();
        await new Promise((resolve) => {
          const tick = () => {
            const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
            const width = x1 - x0;
            let sum = 0;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] > 40 && d[i] < 70 && d[i + 1] < 70 && d[i + 2] < 80) {
                sum += Math.floor(i / 4 / width);
                n++;
              }
            }
            if (n > 20) rows.push(sum / n);
            if (performance.now() - started < 4000) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        return rows.reduce((a, b) => a + b, 0) / Math.max(1, rows.length);
      });
    }
    record(
      "a yes/no question visibly raises the brows",
      brows.question < brows.statement - 1.5,
      `question ${brows.question.toFixed(1)} vs statement ${brows.statement.toFixed(1)}`,
    );
    record(
      "a wh-question visibly lowers them instead",
      brows.wh > brows.statement + 1.5,
      `wh ${brows.wh.toFixed(1)} vs statement ${brows.statement.toFixed(1)}`,
    );

    record(
      "signing ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

    console.log("\nFingerspelling");
    consoleErrors.length = 0;
    await page.evaluate(() => {
      [...document.querySelectorAll('[role="tab"]')][1].click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    const sign = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll("canvas")];
      // A blank canvas would pass a mere count, so check that pixels were
      // actually written — a hand model that silently draws nothing is
      // exactly the failure worth catching here.
      const painted = canvases.filter((c) => {
        const ctx = c.getContext("2d");
        if (!ctx || c.width === 0) return false;
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return true;
        return false;
      }).length;
      return { total: canvases.length, painted, text: document.body.innerText };
    });

    // Twenty-six letters, ten digits, and the animated hand.
    record("the alphabet chart renders every shape", sign.total >= 37, `${sign.total} canvases`);
    record("the handshapes are actually drawn", sign.painted >= 36, `${sign.painted} painted`);
    record(
      "the spelling tab distinguishes itself from signing",
      /is not signing/i.test(sign.text),
    );
    record(
      "the approximate letters are declared",
      /approximation/i.test(sign.text) && /M, N, R and T/.test(sign.text),
    );

    // The hand has to move, or a reader has nothing to follow between shapes.
    const moved = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const snap = () => {
        const ctx = canvas.getContext("2d");
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data.join(",");
      };
      const before = snap();
      await new Promise((r) => setTimeout(r, 700));
      return before !== snap();
    });
    record("the hand animates between letters", moved);
    record(
      "fingerspelling ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

    console.log("\nTheme");
    consoleErrors.length = 0;

    // The default has to be light, on a machine whose OS preference is dark.
    // Reading it from a fresh context is the only honest way to check, since
    // by this point the run has already stored a choice.
    const fresh = await browser.createBrowserContext();
    const freshPage = await fresh.newPage();
    await freshPage.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: "dark" },
    ]);
    await freshPage.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    const firstVisit = await freshPage.evaluate(() => ({
      theme: document.documentElement.getAttribute("data-theme"),
      background: getComputedStyle(document.body).backgroundColor,
    }));
    await fresh.close();
    record(
      "a first visit is light, whatever the machine prefers",
      firstVisit.theme === "morning",
      `${firstVisit.theme} · ${firstVisit.background}`,
    );

    const theme = await page.evaluate(async () => {
      const root = document.documentElement;
      const readBackground = () => getComputedStyle(document.body).backgroundColor;
      const first = { theme: root.getAttribute("data-theme"), background: readBackground() };
      const toggle = [...document.querySelectorAll('[role="switch"]')].find((b) =>
        b.getAttribute("aria-label")?.includes("theme"),
      );
      if (!toggle) return null;
      toggle.click();
      await new Promise((r) => setTimeout(r, 300));
      const second = { theme: root.getAttribute("data-theme"), background: readBackground() };
      return { first, second, stored: localStorage.getItem("sanjivani-setu.theme") };
    });
    record("a theme toggle is present", theme !== null);
    record(
      "toggling actually repaints the page",
      theme && theme.first.background !== theme.second.background,
      `${theme?.first.theme} → ${theme?.second.theme}`,
    );
    record("the choice is remembered", theme?.stored === theme?.second.theme);

    await page.reload({ waitUntil: "networkidle0" });
    const persisted = await page.evaluate(() => ({
      applied: document.documentElement.getAttribute("data-theme"),
      // The pre-paint script has to have run before React, or the page shows
      // one frame of the wrong theme — the flash every dark-mode site with a
      // client-side toggle gets wrong.
      beforeReact: document.documentElement.hasAttribute("data-theme"),
    }));
    record("the theme is applied before first paint", persisted.beforeReact);
    record("the theme survives a reload", persisted.applied === theme?.second.theme);
    record(
      "theme ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

    console.log("\nAppointments");
    consoleErrors.length = 0;
    await page.goto(`${BASE}/appointments`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    const booked = await page.evaluate(() => {
      const date = document.querySelector('input[type="date"]');
      const time = document.querySelector('input[type="time"]');
      if (!date || !time) return "no date or time field";

      const setValue = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        ).set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };

      const when = new Date(Date.now() + 3 * 86400000);
      const pad = (n) => String(n).padStart(2, "0");
      setValue(date, `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`);
      setValue(time, "10:30");

      const book = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Book it",
      );
      if (!book) return "no book button";
      book.click();
      return "clicked";
    });
    record("booking form is complete", booked === "clicked", booked);

    await new Promise((r) => setTimeout(r, 600));
    const appointmentsText = await page.evaluate(() => document.body.innerText);
    record(
      "the appointment appears in the list",
      /Add to calendar/.test(appointmentsText) && !/Nothing booked/.test(appointmentsText),
    );
    record(
      "the page is honest that no reminder will be sent",
      /Nobody is expecting you/i.test(appointmentsText),
    );

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem("sanjivani-setu.appointments.v1");
      return raw ? JSON.parse(raw).length : 0;
    });
    record("the appointment persists", stored === 1, `${stored} stored`);

    // Booking a time that has already gone must be refused, not silently
    // accepted into a list of things that will never happen.
    const rejected = await page.evaluate(() => {
      const date = document.querySelector('input[type="date"]');
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(date, "2020-01-01");
      date.dispatchEvent(new Event("input", { bubbles: true }));
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.trim() === "Book it")
        ?.click();
      return true;
    });
    await new Promise((r) => setTimeout(r, 400));
    const afterBad = await page.evaluate(() => document.body.innerText);
    const stillOne = await page.evaluate(() => {
      const raw = window.localStorage.getItem("sanjivani-setu.appointments.v1");
      return raw ? JSON.parse(raw).length : 0;
    });
    record(
      "a past time is refused with a reason",
      rejected && /already passed/i.test(afterBad) && stillOne === 1,
    );
    record(
      "appointments ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

    console.log("\nHistory");
    consoleErrors.length = 0;
    await page.goto(`${BASE}/history`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));
    const emptyHistory = await page.evaluate(() => document.body.innerText);
    record("empty history invites a first reading", /Nothing measured yet/i.test(emptyHistory));

    // Seed a series with one deliberately unusable reading in it, to prove the
    // trend excludes it while the list still shows it.
    await page.evaluate(() => {
      const at = (day) => new Date(Date.UTC(2026, 2, day, 9)).toISOString();
      const reading = (day, hr, quality) => ({
        agentSlug: "vitals",
        agentName: "Contactless Vitals",
        takenAt: at(day),
        durationSeconds: 45,
        quality,
        qualityNote: quality < 0.5 ? "Too much movement" : null,
        metrics: [
          { label: "Heart rate", value: hr, unit: "bpm" },
          { label: "Breathing rate", value: 14, unit: "/min" },
        ],
      });
      window.localStorage.setItem(
        "sanjivani-setu.history.v1",
        JSON.stringify([reading(1, 68, 0.8), reading(2, 210, 0.2), reading(3, 76, 0.9)]),
      );
    });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));

    const historyText = await page.evaluate(() => document.body.innerText);
    const sparklines = await page.evaluate(
      () => document.querySelectorAll('svg[role="img"]').length,
    );
    record("trends are drawn", sparklines >= 1, `${sparklines} sparklines`);
    record("the trend counts only usable readings", /2 usable readings/i.test(historyText));
    record(
      "an unusable reading is still shown, and labelled",
      /too noisy to use/i.test(historyText),
    );
    record(
      "the unusable value is kept out of the trend",
      // Uppercased by CSS, so innerText reads "EVERY READING".
      !/\b210\b/.test(historyText.split(/every reading/i)[0]),
    );
    record(
      "history ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

    console.log("\nBreathing coach");
    consoleErrors.length = 0;
    await page.goto(`${BASE}/agents/vitals`, { waitUntil: "networkidle0" });
    const coach = await page
      .waitForSelector('[data-testid="breathing-coach"]', { timeout: 10000 })
      .catch(() => null);
    record("the coach is on the vitals page", coach !== null);

    // The pacer has to actually pace. A circle that never changes size is the
    // failure this catches, and it is invisible in a screenshot.
    await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="breathing-coach"]');
      [...(panel?.querySelectorAll("button") ?? [])]
        .find((b) => b.textContent?.includes("Start pacer"))
        ?.click();
    });
    const fullness = [];
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 180));
      fullness.push(
        await page.evaluate(() => {
          const svg = document
            .querySelector('[data-testid="breathing-coach"]')
            ?.querySelector("svg[data-fullness]");
          return svg ? Number(svg.dataset.fullness) : null;
        }),
      );
    }
    const measured = fullness.filter((v) => typeof v === "number");
    const swing = measured.length > 0 ? Math.max(...measured) - Math.min(...measured) : 0;
    record(
      "the pacer actually breathes",
      swing > 0.3 && new Set(measured).size > 8,
      `${swing.toFixed(2)} of travel, ${new Set(measured).size} distinct`,
    );

    const paced = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="breathing-coach"]');
      const before = panel?.textContent ?? "";
      [...(panel?.querySelectorAll("button") ?? [])]
        .find((b) => b.textContent?.trim() === "Box, 4-4-4")
        ?.click();
      return { before };
    });
    await new Promise((r) => setTimeout(r, 400));
    const afterPace = await page.evaluate(
      () => document.querySelector('[data-testid="breathing-coach"]')?.textContent ?? "",
    );
    record(
      "changing the pace changes what it asks for",
      /6.0\/min/.test(paced.before) && /5.0\/min/.test(afterPace),
    );
    record(
      "the coach refuses to be a treatment",
      /not a therapy/i.test(afterPace) && /light-headed/i.test(afterPace),
    );
    record(
      "with nobody in frame it claims no coherence",
      /Measuring/.test(afterPace) && !/\b\d{1,3}\/100\b/.test(afterPace.split("Your breathing")[0]),
    );

    console.log("\nCognitive load");
    consoleErrors.length = 0;
    await page.goto(`${BASE}/agents/alertness`, { waitUntil: "networkidle0" });
    const loadPanel = await page
      .waitForSelector('[data-testid="cognitive-load"]', { timeout: 10000 })
      .catch(() => null);
    const loadText = loadPanel
      ? await page.evaluate(
          () => document.querySelector('[data-testid="cognitive-load"]')?.textContent ?? "",
        )
      : "";
    record("cognitive load is on the alertness page", loadPanel !== null);
    record(
      "it names all three eye signals",
      /Pupil size/.test(loadText) && /Blink rate/.test(loadText) && /Gaze scan/.test(loadText),
    );
    record(
      "it says the light moves the pupil more than thinking does",
      /light on your face moves/i.test(loadText),
    );
    record(
      "it says what it is not a measure of",
      /nothing about your ability, mood or health/i.test(loadText),
    );
    record(
      "with nobody in frame it invents no score",
      /—/.test(loadText) && !/\b\d{1,3}\/100\b/.test(loadText.split("Pupil size")[0].replace("/100", "")),
    );

    console.log("\nAnswering with eyes and hands");
    consoleErrors.length = 0;
    await page.goto(`${BASE}/agents/companion`, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const key = "sanjivani-setu.companion-profile.v1";
      const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      window.localStorage.setItem(key, JSON.stringify({ ...stored, accessMode: true }));
    });
    await page.reload({ waitUntil: "networkidle0" });
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.startsWith("Talk to"))
        ?.click();
    });
    const board = await page
      .waitForSelector('[data-testid="switch-board"]', { timeout: 15000 })
      .catch(() => null);
    const boardText = board
      ? await page.evaluate(
          () => document.querySelector('[data-testid="switch-board"]')?.textContent ?? "",
        )
      : "";
    record("the eye switch appears in access mode", board !== null);
    record(
      "it offers answers worth having",
      /Yes/.test(boardText) && /I need help/.test(boardText),
    );
    record(
      "it explains that ordinary blinks will not fire it",
      /ordinary blinks are too short/i.test(boardText),
    );
    record("it offers both ways in", /Scanning/.test(boardText) && /Look and hold/.test(boardText));

    // Fingerspelling in is off until asked for, because it puts a second
    // landmark model in the frame loop.
    const spellHidden = await page.evaluate(
      () => document.querySelector('[data-testid="fingerspell-input"]') === null,
    );
    record("reading the hand is off until asked for", spellHidden);

    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Let me spell to the camera"))
        ?.click();
    });
    const speller = await page
      .waitForSelector('[data-testid="fingerspell-input"]', { timeout: 15000 })
      .catch(() => null);
    const spellText = speller
      ? await page.evaluate(
          () => document.querySelector('[data-testid="fingerspell-input"]')?.textContent ?? "",
        )
      : "";
    record("the hand reader can be switched on", speller !== null);
    record(
      "it does not claim to understand sign language",
      /not understanding signing/i.test(spellText),
    );
    record(
      "it names the letters it will not attempt",
      /J, Z/.test(spellText) && /M, N, S, T/.test(spellText),
    );
    // With no hand in the fake video it must sit and wait, not spell noise.
    await new Promise((r) => setTimeout(r, 3000));
    const spelled = await page.evaluate(
      () => document.querySelector('[data-testid="spelled-text"]')?.textContent ?? "",
    );
    record("it spells nothing from an empty frame", spelled.trim() === "…" || spelled.trim() === "");

    console.log("\nYour week, and your own baseline");
    consoleErrors.length = 0;
    await page.goto(`${BASE}/history`, { waitUntil: "networkidle0" });

    // A fortnight of steady readings and then one clearly outside them. The
    // dates are relative to now because both the journal window and the
    // baseline are time-based.
    await page.evaluate(() => {
      const day = 86_400_000;
      const reading = (daysAgo, hr) => ({
        agentSlug: "vitals",
        agentName: "Contactless Vitals",
        takenAt: new Date(Date.now() - daysAgo * day).toISOString(),
        durationSeconds: 45,
        quality: 0.85,
        qualityNote: null,
        metrics: [
          { label: "Heart rate", value: hr, unit: "bpm" },
          { label: "Breathing rate", value: 14, unit: "/min" },
        ],
      });
      window.localStorage.setItem(
        "sanjivani-setu.history.v1",
        JSON.stringify([
          reading(14, 65),
          reading(12, 67),
          reading(10, 66),
          reading(9, 64),
          reading(8, 66),
          reading(3, 67),
          reading(2, 66),
          reading(1, 92),
        ]),
      );
    });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));

    const journal = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="weekly-journal"]');
      return el
        ? {
            text: el.textContent ?? "",
            speakable: [...el.querySelectorAll("button")].some((b) =>
              /Read it to me/.test(b.textContent ?? ""),
            ),
          }
        : null;
    });
    record("the week is written up", journal !== null);
    record(
      "it counts the readings and the days",
      /3 readings over 3 days/.test(journal?.text ?? ""),
      (journal?.text ?? "").slice(0, 60),
    );
    record("it can be read aloud", journal?.speakable === true);
    record(
      "it says the model did not write it",
      /not by the language model/i.test(journal?.text ?? ""),
    );
    record("it closes on what the numbers are not", /not a diagnosis/i.test(journal?.text ?? ""));

    const drift = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid="drift-card"]')];
      const heart = cards.find((c) => /Heart rate/.test(c.textContent ?? ""));
      return {
        count: cards.length,
        verdict: heart?.dataset.verdict ?? null,
        text: heart?.textContent ?? "",
      };
    });
    record("each metric is placed against the person's own baseline", drift.count >= 1);
    record(
      "a reading well outside that baseline is called unusual",
      drift.verdict === "unusual",
      drift.verdict ?? "no card",
    );
    record("it shows what usual means for this person", /usual 66/.test(drift.text));
    record(
      "it asks for a repeat rather than raising an alarm",
      /Repeat the measurement/i.test(drift.text),
    );
    record(
      "the page says the comparison is not against a population",
      /Not against a population/i.test(await page.evaluate(() => document.body.innerText)),
    );
    record(
      "the journal ran without console errors",
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
      "/appointments",
      "/history",
      "/sign",
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

    console.log("\nAssistant dock");
    consoleErrors.length = 0;

    // It has to be on every page, in the corner, and openable — that is the
    // whole promise of it. Checked on two unrelated routes because being
    // mounted in the root layout is what makes it true everywhere.
    for (const path of ["/", "/history"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
      const launcher = await page
        .waitForSelector('button[aria-label^="Ask "]', { timeout: 10000 })
        .catch(() => null);
      const where = launcher
        ? await page.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return { left: rect.left, bottom: window.innerHeight - rect.bottom };
          }, launcher)
        : null;
      record(
        `the assistant is reachable from ${path}`,
        where !== null && where.left < 60 && where.bottom < 60,
        where ? `${Math.round(where.left)}px from the left edge` : "no launcher",
      );
    }

    await page.click('button[aria-label^="Ask "]');
    const dock = await page
      .waitForSelector('div[role="dialog"][aria-label^="Ask "]', { timeout: 5000 })
      .catch(() => null);
    const parts = dock
      ? await page.evaluate(() => {
          const el = document.querySelector('div[role="dialog"][aria-label^="Ask "]');
          if (!el) return null;
          return {
            typing: !!el.querySelector('input[aria-label="Your question"]'),
            // Speech recognition is missing in some browsers, and the button
            // is hidden rather than shown broken. Headless Chrome has it.
            speaking: !!el.querySelector('button[aria-label*="Speak"]'),
            face: !!el.querySelector("canvas"),
            honest: /not medical advice/i.test(el.textContent ?? ""),
            languages: /any language/i.test(el.textContent ?? ""),
          };
        })
      : null;
    record("it takes a typed question", parts?.typing === true);
    record("it takes a spoken one", parts?.speaking === true);
    record("the companion's face is in it", parts?.face === true);
    record("it says what it is not", parts?.honest === true);
    record("it says it answers in any language", parts?.languages === true);

    /**
     * The companion can be changed from here.
     *
     * It used to be changeable only from inside a measurement session, which
     * meant the face somebody sees on every page could only be replaced from
     * one page — and only after starting a reading they may not have wanted.
     */
    await page.click('button[aria-label="Change avatar"]');
    const dockPicker = await page
      .waitForFunction(
        () => {
          const dialog = document.querySelector('[role="dialog"][aria-label="Companion settings"]');
          return dialog ? /Use my own picture/i.test(dialog.textContent ?? "") : false;
        },
        { timeout: 5000 },
      )
      .then(() => true)
      .catch(() => false);
    record("the companion can be changed from any page", dockPicker);
    record(
      "and a photograph can be uploaded from there",
      (await page.$('[role="dialog"][aria-label="Companion settings"] input[type="file"]')) !== null,
    );
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 300));

    // Escape has to close it. A floating panel you can only dismiss by
    // finding its small close button is a trap for keyboard users.
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 300));
    const closed = await page.evaluate(
      () => document.querySelector('div[role="dialog"][aria-label^="Ask "]') === null,
    );
    record("escape closes it", closed);

    record(
      "the assistant ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

    /**
     * What happens with no keys at all.
     *
     * This is the state almost everybody meets, because the published copy
     * has no server to hold a key in. Until recently it meant a companion
     * that said nothing and a disabled text box, which reads as a broken
     * site rather than as a smaller one. What has to be true now is that a
     * question gets an answer, that the answer admits it came from a list,
     * and that nothing anywhere claims a model is present.
     */
    /**
     * Which of the two modes this build is in.
     *
     * A keyed server and a keyless static export are both supported states
     * and they behave differently on purpose, so the suite asks rather than
     * assumes. A static export has no `/api/services` at all, which is itself
     * the answer.
     */
    // Asked from Node rather than from the page, because on a static export
    // this request is a 404 by design and the page is being watched for
    // exactly those.
    const behind = await fetch(`${BASE}/api/services`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    const keyed = behind?.claude === true;
    // No `/api/services` at all means the static export rather than a server
    // that happens to have no key, and the two need different advice.
    const staticExport = behind === null;

    console.log(keyed ? "\nWith Claude behind it" : "\nWith no keys behind it");
    consoleErrors.length = 0;

    /**
     * Watching the synthesiser rather than listening to it.
     *
     * Headless Chrome ships no installed voices, so nothing can be heard here
     * and a check for audio would fail on a machine where the feature is
     * perfectly fine. What can be established is the part this project is
     * responsible for: that the reply reaches `speechSynthesis.speak` with
     * the right words in it. Whether a voice then exists is the operating
     * system's business.
     */
    await page.evaluateOnNewDocument(() => {
      const spoken = [];
      Object.defineProperty(window, "__spoken", { get: () => spoken });
      const original = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (utterance) => {
        spoken.push(utterance.text);
        // Nothing will ever fire "end" without a voice installed, and the
        // turn loop waits for it, so end the utterance immediately.
        setTimeout(() => utterance.onend?.(new Event("end")), 10);
        try {
          original(utterance);
        } catch {
          // No voices; the call itself is what was being checked.
        }
      };
    });

    // Polly's audio arrives over the network, so the keyed voice is checked
    // by watching for the request rather than by intercepting the browser's
    // synthesiser, which is not the one being used.
    const spokenByPolly = [];
    page.on("response", (res) => {
      if (res.url().includes("/api/speak")) spokenByPolly.push(res.status());
    });

    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    await page.click('button[aria-label^="Ask "]');
    await page.waitForSelector('input[aria-label="Your question"]', { timeout: 5000 });

    const warned = await page.evaluate(() => {
      const el = document.querySelector('div[role="dialog"][aria-label^="Ask "]');
      return /no language model/i.test(el?.textContent ?? "");
    });
    record(
      keyed
        ? "it does not claim to be a guide when a model is present"
        : "it says up front that there is no model behind it",
      keyed ? !warned : warned,
    );

    await page.type(
      'input[aria-label="Your question"]',
      keyed ? "In one short sentence, what is HRV?" : "what is hrv",
    );
    await page.keyboard.press("Enter");

    /**
     * The two modes are recognised by different things, and deliberately not
     * by "some text appeared". The guide has one fixed sentence, so it can be
     * matched exactly. Claude's answer cannot be predicted at all, so what is
     * checked is that a reply arrived, that it is a real answer rather than
     * an error, and that it does not carry the scripted label — a keyed build
     * quietly falling back to the list would otherwise pass unnoticed.
     */
    const answered = await page
      .waitForFunction(
        (guide) => {
          const el = document.querySelector('div[role="dialog"][aria-label^="Ask "]');
          if (!el) return false;
          if (guide) return /variation in the gaps between beats/i.test(el.textContent ?? "");
          // Claude's wording cannot be predicted, so this looks for a reply
          // bubble instead: a paragraph of some length that is neither the
          // question just asked nor the panel's own standing text.
          return [...el.querySelectorAll("p")].some((p) => {
            const text = p.textContent ?? "";
            return (
              text.length > 60 &&
              !/not medical advice/i.test(text) &&
              !/Hello .{0,3} I/i.test(text) &&
              !text.includes("In one short sentence")
            );
          });
        },
        { timeout: 30000 },
        !keyed,
      )
      .then(() => true)
      .catch(() => false);
    record(
      keyed ? "Claude answers a question asked from the dock" : "a question asked with no key still gets an answer",
      answered,
    );

    const labelled = await page.evaluate(() => {
      const el = document.querySelector('div[role="dialog"][aria-label^="Ask "]');
      return /scripted guide/i.test(el?.textContent ?? "");
    });
    record(
      keyed
        ? "the answer is Claude's rather than the fallback list"
        : "the answer says it came from a written list",
      keyed ? !labelled : labelled,
    );

    if (keyed) {
      const heard = await page
        .waitForFunction(() => true, { timeout: 100 })
        .then(async () => {
          for (let i = 0; i < 40 && spokenByPolly.length === 0; i++) {
            await new Promise((r) => setTimeout(r, 500));
          }
          return spokenByPolly[0] ?? null;
        })
        .catch(() => null);
      record(
        "the reply is spoken by Polly",
        heard === 200,
        heard === null ? "no request to /api/speak" : `HTTP ${heard}`,
      );
    } else {
      const said = await page
        .waitForFunction(() => window.__spoken.length > 0, { timeout: 8000 })
        .then(() => page.evaluate(() => window.__spoken[0]))
        .catch(() => null);
      record(
        "the reply is handed to the browser's own voice",
        typeof said === "string" && /variation in the gaps between beats/i.test(said),
        said ? `${said.slice(0, 40)}…` : "nothing was spoken",
      );
      record(
        "the spoken version says it is scripted too",
        typeof said === "string" && /scripted guide/i.test(said),
      );
    }

    await page.keyboard.press("Escape");

    // The companion page is where the disabled input used to be, and where
    // the banner used to say the conversation was simply unavailable.
    await page.goto(`${BASE}/agents/companion`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500));
    const companion = await page.evaluate(() => {
      const input = document.querySelector('form input[type="text"], form input:not([type])');
      const body = document.body.textContent ?? "";
      return {
        typeable: !!input && !input.disabled,
        scripted: /scripted guide/i.test(body),
        measurementsStandUp: /every measurement on the page is real/i.test(body),
        overclaims: /talking back needs claude/i.test(body),
        // On a static copy there is no process to set a variable on and
        // nothing to restart, so this instruction sends somebody to configure
        // a key the page could never reach and then wonder why the message
        // did not change.
        unfollowable: /and restart/i.test(body),
        saysWhy: /static site/i.test(body) && /no server/i.test(body),
      };
    });
    record("the companion can be typed to", companion.typeable);
    record(
      keyed
        ? "no fallback notice is shown when Claude is configured"
        : "it says plainly that it is a scripted guide",
      keyed ? !companion.scripted : companion.scripted,
    );
    if (!keyed) {
      record("it says the measurements are unaffected", companion.measurementsStandUp);
    }
    if (staticExport) {
      record("it explains that a static copy cannot hold a key", companion.saysWhy);
      record(
        "it does not ask for a variable to be set on a machine that has none",
        !companion.unfollowable,
      );
    }
    record("nothing claims the conversation is simply unavailable", !companion.overclaims);

    record(
      keyed ? "the keyed path ran without console errors" : "the keyless path ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

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
