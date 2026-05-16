#!/usr/bin/env node
/**
 * copy-free-exercise-db-images.mjs
 *
 * Copies free-exercise-db pose images from the gitignored vendor checkout into
 * `public/catalog/free-exercise-db/<catalog_id>/<basename>` so the desktop
 * (mac/dev) build can render local images in the Exercise Library.
 *
 * Local-only:
 *   These images are NOT bundled into Android APKs. See scripts/README.md and
 *   vite.config.ts for the Android exclusion mechanism.
 *
 * Idempotent:
 *   Existing destination files are skipped by default. Pass --force to overwrite.
 *
 * Per-image failures (missing source file, permission errors) are tolerated —
 * the script continues and reports counts. The script exits non-zero only on
 * structural errors (missing input JSON, unwritable output dir).
 *
 * Usage:
 *   node scripts/copy-free-exercise-db-images.mjs [--force] [--limit <n>]
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

const INPUT_PATH = resolve(ROOT, "vendor/free-exercise-db/dist/exercises.json");
const VENDOR_IMAGES_DIR = resolve(ROOT, "vendor/free-exercise-db/exercises");
const OUTPUT_DIR = resolve(ROOT, "public/catalog/free-exercise-db");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  if (i === -1) return null;
  const n = parseInt(args[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

if (!existsSync(INPUT_PATH)) {
  console.error(`ERROR: Input file not found: ${INPUT_PATH}`);
  console.error("Clone the source repo: git clone https://github.com/yuhonas/free-exercise-db vendor/free-exercise-db");
  process.exit(1);
}

try {
  mkdirSync(OUTPUT_DIR, { recursive: true });
} catch (e) {
  console.error(`ERROR: Could not create output directory ${OUTPUT_DIR}: ${e.message}`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
console.log(`\nSource exercises loaded: ${raw.length}`);
console.log(`Output dir: ${OUTPUT_DIR}`);
if (FORCE) console.log("Mode: --force (overwriting existing destination files)");
if (LIMIT) console.log(`Limit: ${LIMIT}`);
console.log("");

let copied = 0;
let skipped = 0;
let missingSource = 0;
let failed = 0;
let exercisesWithImages = 0;
let exercisesNoImages = 0;

const failures = [];

let processedExercises = 0;
for (const src of raw) {
  if (LIMIT && processedExercises >= LIMIT) break;
  processedExercises++;

  const catalogId = (src?.id ?? "").trim();
  if (!catalogId) continue;

  const images = Array.isArray(src.images) ? src.images : [];
  if (images.length === 0) {
    exercisesNoImages++;
    continue;
  }
  exercisesWithImages++;

  const destDir = resolve(OUTPUT_DIR, catalogId);
  let destDirReady = false;

  for (const relPath of images) {
    if (typeof relPath !== "string" || relPath.trim() === "") continue;
    const sourcePath = resolve(VENDOR_IMAGES_DIR, relPath);
    const basename = relPath.split("/").pop();
    if (!basename) continue;
    const destPath = resolve(destDir, basename);

    if (!existsSync(sourcePath)) {
      missingSource++;
      failures.push({ catalogId, sourcePath, error: "source file missing" });
      continue;
    }

    if (existsSync(destPath) && !FORCE) {
      skipped++;
      continue;
    }

    if (!destDirReady) {
      try {
        mkdirSync(destDir, { recursive: true });
        destDirReady = true;
      } catch (e) {
        failed++;
        failures.push({ catalogId, sourcePath, error: `mkdir failed: ${e.message}` });
        continue;
      }
    }

    try {
      copyFileSync(sourcePath, destPath);
      copied++;
      if (copied % 200 === 0) {
        console.log(`  …copied ${copied} images (${processedExercises}/${LIMIT ?? raw.length} exercises)`);
      }
    } catch (e) {
      failed++;
      failures.push({ catalogId, sourcePath, error: e.message });
    }
  }
}

console.log("\n── Copy report ──────────────────────────────────────────────");
console.log(`  Source records:           ${raw.length}`);
console.log(`  Considered:               ${processedExercises}`);
console.log(`  Exercises with images:    ${exercisesWithImages}`);
console.log(`  Exercises with no images: ${exercisesNoImages}`);
console.log(`  Files copied:             ${copied}`);
console.log(`  Files skipped (exist):    ${skipped}`);
console.log(`  Source files missing:     ${missingSource}`);
console.log(`  Failed:                   ${failed}`);

if (failures.length > 0) {
  console.log(`\n  Failures (${failures.length}):`);
  for (const f of failures.slice(0, 20)) {
    console.log(`    ${f.catalogId} ← ${f.sourcePath}: ${f.error}`);
  }
  if (failures.length > 20) {
    console.log(`    …and ${failures.length - 20} more`);
  }
}
console.log("─────────────────────────────────────────────────────────────\n");
