#!/usr/bin/env node
/**
 * Copy the MediaPipe WASM runtime out of node_modules and download the task
 * models into public/mediapipe.
 *
 * Serving these ourselves rather than from the CDN is what lets the whole app
 * run with no network at all after first load. For a live demonstration that
 * matters more than the disk space: venue wifi failing should not be able to
 * take the measurement offline.
 *
 * Run: npm run fetch-models
 */

import { createWriteStream } from "node:fs";
import { mkdir, copyFile, readdir, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

const ROOT = process.cwd();
const WASM_SRC = path.join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const WASM_DEST = path.join(ROOT, "public", "mediapipe", "wasm");
const MODEL_DEST = path.join(ROOT, "public", "mediapipe", "models");

const MODELS = [
  {
    name: "face_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
  {
    name: "hand_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
  {
    name: "pose_landmarker_lite.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  },
];

function mb(bytes) {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  if (!(await fileExists(WASM_SRC))) {
    console.error(
      "  @mediapipe/tasks-vision is not installed. Run `npm install` first.",
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(WASM_DEST, { recursive: true });
  const entries = await readdir(WASM_SRC);
  let total = 0;
  for (const entry of entries) {
    const src = path.join(WASM_SRC, entry);
    const info = await stat(src);
    if (!info.isFile()) continue;
    await copyFile(src, path.join(WASM_DEST, entry));
    total += info.size;
  }
  console.log(`  runtime      ${entries.length} files, ${mb(total)}`);
}

async function download({ name, url }) {
  const dest = path.join(MODEL_DEST, name);
  if (await fileExists(dest)) {
    const info = await stat(dest);
    console.log(`  ${name.padEnd(28)} cached, ${mb(info.size)}`);
    return;
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`${name}: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const info = await stat(dest);
  console.log(`  ${name.padEnd(28)} downloaded, ${mb(info.size)}`);
}

async function main() {
  console.log("Preparing MediaPipe assets for offline use\n");
  await copyWasm();
  await mkdir(MODEL_DEST, { recursive: true });

  for (const model of MODELS) {
    try {
      await download(model);
    } catch (err) {
      console.error(`  ${model.name}: ${err.message}`);
      console.error("    The app will fall back to the Google CDN for this model.");
    }
  }

  console.log("\nDone. Models are served from /mediapipe and used in preference to the CDN.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
