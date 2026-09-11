#!/usr/bin/env node
/**
 * Precompute a face rig for each photoreal portrait.
 *
 * The talking presenter warps a still photograph, and to warp it you need to
 * know where the mouth and the eyes are. Finding that out costs a 3.8 MB
 * model download and about a second of WASM startup, which is a strange price
 * to pay on every page load for an answer that can never change: the
 * portraits ship with the app and their faces are not going to move.
 *
 * So the landmarks are found once, here, and committed as JSON. At run time
 * the presenter reads a few hundred numbers and starts animating on the first
 * frame. It also means the presenter has no dependency on MediaPipe at all —
 * someone who never runs `npm run fetch-models` still gets a talking face.
 *
 * The detector runs in a real Chrome because that is the only place the
 * MediaPipe vision tasks run; there is no Node build of them.
 *
 * Run: npm run build-face-rigs   (needs the models fetched first)
 */

import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

import { PHOTO_RIG_IDS } from "./face-rig-ids.mjs";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const BUNDLE = path.join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "vision_bundle.mjs");
const OUT = path.join(ROOT, "src", "lib", "avatar", "rigs.json");

const CHROME =
  process.env.CHROME_PATH ??
  [
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find(existsSync);

const TYPES = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".task": "application/octet-stream",
  ".html": "text/html",
};

const PAGE = `<!doctype html><meta charset="utf-8"><title>rig</title>
<script type="module">
import { FilesetResolver, FaceLandmarker } from "/vision_bundle.mjs";

window.detectAll = async (sources) => {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/mediapipe/models/face_landmarker.task" },
    runningMode: "IMAGE",
    numFaces: 1,
    // The iris points are what let the presenter keep the eyes still while
    // the lids move, so the refinement is not optional here.
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });

  const out = {};
  for (const src of sources) {
    const image = new Image();
    image.src = src.url;
    await image.decode();
    const bitmap = await createImageBitmap(image);
    const result = landmarker.detect(bitmap);
    bitmap.close();
    const face = result.faceLandmarks?.[0];
    if (!face) { out[src.id] = null; continue; }
    out[src.id] = {
      width: image.naturalWidth,
      height: image.naturalHeight,
      // Normalised coordinates, rounded. Five decimals on a 960 px image is
      // a hundredth of a pixel, which is far below anything the warp can
      // express, and it keeps the committed JSON readable.
      points: face.map((p) => [round(p.x), round(p.y)]),
    };
  }
  return out;
};
const round = (v) => Math.round(v * 1e5) / 1e5;
window.ready = true;
</script>`;

function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(PAGE);
      }
      const file =
        url.pathname === "/vision_bundle.mjs"
          ? BUNDLE
          : path.join(PUBLIC, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
        // The WASM loader insists on this before it will use the threaded build.
        "cross-origin-embedder-policy": "require-corp",
        "cross-origin-opener-policy": "same-origin",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  if (!CHROME) throw new Error("No Chrome binary found. Set CHROME_PATH.");
  if (!existsSync(path.join(PUBLIC, "mediapipe", "models", "face_landmarker.task"))) {
    throw new Error("Face landmarker model missing. Run `npm run fetch-models` first.");
  }

  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") console.error("  browser:", m.text());
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.ready === true", { timeout: 30_000 });

    const sources = PHOTO_RIG_IDS.map((id) => ({ id, url: `/portraits/${id}.photo.webp` }));
    const rigs = await page.evaluate((s) => window.detectAll(s), sources);

    const missing = Object.entries(rigs).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error(`No face found in: ${missing.join(", ")}`);

    for (const [id, rig] of Object.entries(rigs)) {
      if (rig.points.length < 478) {
        throw new Error(`${id}: expected 478 refined landmarks, got ${rig.points.length}`);
      }
      console.log(`  ${id}: ${rig.points.length} landmarks on ${rig.width}x${rig.height}`);
    }

    await writeFile(OUT, `${JSON.stringify(rigs, null, 1)}\n`);
    console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
