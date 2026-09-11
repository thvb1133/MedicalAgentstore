#!/usr/bin/env node
/**
 * Build the keyless, serverless copy of the site.
 *
 * `output: "export"` refuses to build while there are route handlers in the
 * tree, and rightly: a POST handler cannot be a file. So the API directory is
 * moved out of the way for the duration of the build. The rename is to a
 * leading underscore because the App Router treats such folders as private
 * and excludes them from routing, which means the move is understood by the
 * framework rather than merely hidden from it — and it is restored in a
 * `finally`, including on Ctrl-C, so an interrupted build cannot leave the
 * working tree without its API.
 *
 * Usage:
 *   node scripts/build-static.mjs                 → site at the domain root
 *   BASE_PATH=/MedicalAgentstore node ...         → site under a subpath
 */

import { execFileSync } from "node:child_process";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const api = join(root, "src", "app", "api");
const parked = join(root, "src", "app", "_api");
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

if (existsSync(parked) && existsSync(api)) {
  console.error("Both src/app/api and src/app/_api exist. Resolve that by hand.");
  process.exit(1);
}

let moved = false;
const restore = () => {
  if (moved && existsSync(parked)) {
    renameSync(parked, api);
    moved = false;
  }
};

// A signal kills the child build first; without these the parked directory
// would survive the interrupt.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

try {
  if (existsSync(api)) {
    renameSync(api, parked);
    moved = true;
  }

  execFileSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_STATIC_BUILD: "1",
      NEXT_PUBLIC_BASE_PATH: basePath,
    },
  });

  // GitHub Pages runs Jekyll over whatever it is given, and Jekyll drops
  // every path beginning with an underscore — which is all of `_next`, so
  // without this the site deploys with no JavaScript and no styles at all.
  writeFileSync(join(root, "out", ".nojekyll"), "");

  console.log(`\nStatic site in out/${basePath ? `, served under ${basePath}` : ""}`);
} finally {
  restore();
}
