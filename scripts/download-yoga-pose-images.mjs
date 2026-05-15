#!/usr/bin/env node
/**
 * download-yoga-pose-images.mjs
 *
 * Downloads yoga pose images referenced from vendor/yoga/yoga_poses.json into
 * public/catalog/yoga-poses/<catalog_id>.png so the desktop (mac) build can
 * render local images in the Exercise Library.
 *
 * Local-only:
 *   These images are NOT bundled into Android APKs. See scripts/README.md and
 *   vite.config.ts for the Android exclusion mechanism.
 *
 * Idempotent:
 *   Existing files are skipped by default. Pass --force to re-download.
 *
 * Per-image failures (HTTP errors, network timeouts, missing photo_url) are
 * tolerated — the script continues and reports counts. The script only exits
 * non-zero on structural errors (missing input JSON, unwritable output dir).
 *
 * Usage:
 *   node scripts/download-yoga-pose-images.mjs [--force] [--limit <n>]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

const INPUT_PATH = resolve(ROOT, "vendor/yoga/yoga_poses.json");
const OUTPUT_DIR = resolve(ROOT, "public/catalog/yoga-poses");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  if (i === -1) return null;
  const n = parseInt(args[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

// Mirrors slugify() in generate-yoga-poses-library.mjs. Keep in sync.
function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

if (!existsSync(INPUT_PATH)) {
  console.error(`ERROR: Input file not found: ${INPUT_PATH}`);
  process.exit(1);
}

try {
  mkdirSync(OUTPUT_DIR, { recursive: true });
} catch (e) {
  console.error(`ERROR: Could not create output directory ${OUTPUT_DIR}: ${e.message}`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
console.log(`\nSource yoga poses loaded: ${raw.length}`);
console.log(`Output dir: ${OUTPUT_DIR}`);
if (FORCE) console.log("Mode: --force (re-downloading existing files)");
if (LIMIT) console.log(`Limit: ${LIMIT}`);
console.log("");

let downloaded = 0;
let skipped = 0;
let failed = 0;
let noUrl = 0;

const failures = [];

async function fetchToFile(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error("empty response body");
  }
  writeFileSync(dest, buf);
}

const total = LIMIT ? Math.min(LIMIT, raw.length) : raw.length;
let processed = 0;

for (const src of raw) {
  if (LIMIT && processed >= LIMIT) break;
  processed++;

  const name = (src?.name ?? "").trim();
  if (!name) continue;
  const slug = slugify(name);
  if (!slug || slug === "pose") continue;

  const photoUrl = (src?.photo_url ?? "").trim();
  if (!photoUrl) {
    noUrl++;
    continue;
  }

  const dest = resolve(OUTPUT_DIR, `${slug}.png`);
  if (existsSync(dest) && !FORCE) {
    skipped++;
    continue;
  }

  try {
    await fetchToFile(photoUrl, dest);
    downloaded++;
    if (downloaded % 25 === 0) {
      console.log(`  …downloaded ${downloaded} images (${processed}/${total})`);
    }
  } catch (e) {
    failed++;
    failures.push({ name, slug, url: photoUrl, error: e.message });
  }
}

console.log("\n── Download report ──────────────────────────────────────────");
console.log(`  Source records:   ${raw.length}`);
console.log(`  Considered:       ${processed}`);
console.log(`  Downloaded:       ${downloaded}`);
console.log(`  Skipped (exists): ${skipped}`);
console.log(`  No photo_url:     ${noUrl}`);
console.log(`  Failed:           ${failed}`);

if (failures.length > 0) {
  console.log(`\n  Failures (${failures.length}):`);
  for (const f of failures.slice(0, 20)) {
    console.log(`    "${f.name}" (${f.slug}): ${f.error}`);
  }
  if (failures.length > 20) {
    console.log(`    …and ${failures.length - 20} more`);
  }
}
console.log("─────────────────────────────────────────────────────────────\n");
