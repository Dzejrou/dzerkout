#!/usr/bin/env node
/**
 * generate-free-exercise-db-library.mjs
 *
 * Converts vendor/free-exercise-db/dist/exercises.json into dzerkout library
 * JSON format (schema: "dzerkout.library", version 1).
 *
 * Usage:
 *   node scripts/generate-free-exercise-db-library.mjs [options]
 *
 * Options:
 *   --include-category <list>   Comma-separated categories to include (default: all valid)
 *   --exclude-category <list>   Comma-separated categories to exclude
 *                               (default: strongman,"olympic weightlifting")
 *   --max <n>                   Limit output to first N exercises (after filtering)
 *   --output <path>             Output file path
 *                               (default: scripts/generated/free-exercise-db-library.json)
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const INPUT_PATH = resolve(ROOT, "vendor/free-exercise-db/dist/exercises.json");
const OUTPUT_PATH = resolve(ROOT, flag("--output") ?? "scripts/generated/free-exercise-db-library.json");
const MAX = flag("--max") ? parseInt(flag("--max"), 10) : null;

const DEFAULT_EXCLUDE = ["strongman", "olympic weightlifting"];
const excludeRaw = flag("--exclude-category");
const includeRaw = flag("--include-category");
const EXCLUDE_CATS = excludeRaw ? excludeRaw.split(",").map((s) => s.trim()) : DEFAULT_EXCLUDE;
const INCLUDE_CATS = includeRaw ? new Set(includeRaw.split(",").map((s) => s.trim())) : null;

// ── Catalog identity ──────────────────────────────────────────────────────────
//
// Each catalog generator owns its identity in one place:
//   source            stored in catalog_source on every output row, also used
//                     in the UUID v5 namespace key. Must not change once
//                     released — it's the stable cross-catalog identifier.
//   label             human-readable name; used in logs.
//   duplicateSuffix   appended in parens to the *display name only* when this
//                     catalog's name collides with another catalog's. Not
//                     currently applied (free-exercise-db is the base catalog),
//                     but defined here for symmetry and future cross-catalog
//                     disambiguation passes.
const CATALOG = {
  source: "free-exercise-db",
  label: "Free Exercise DB",
  duplicateSuffix: "Exercise",
};

// ── Valid enum sets (mirrors Rust domain/types.rs) ────────────────────────────

const VALID_CATEGORIES = new Set([
  "strength", "stretching", "cardio", "plyometrics",
  "powerlifting", "olympic weightlifting", "strongman", "yoga",
]);
const VALID_EQUIPMENT = new Set([
  "none", "body only", "barbell", "dumbbell", "cable", "machine",
  "kettlebells", "bands", "medicine ball", "exercise ball",
  "foam roll", "e-z curl bar", "other",
]);
const VALID_LEVELS = new Set(["beginner", "intermediate", "expert"]);
const VALID_MECHANICS = new Set(["compound", "isolation"]);
const VALID_FORCES = new Set(["push", "pull", "static"]);
const VALID_MUSCLES = new Set([
  "abdominals", "abductors", "adductors", "biceps", "calves", "chest",
  "forearms", "glutes", "hamstrings", "lats", "lower back", "middle back",
  "neck", "quadriceps", "shoulders", "traps", "triceps",
]);

// ── UUID v5 (no external deps, uses built-in crypto SHA-1) ───────────────────

const NS_OID = "6ba7b812-9dad-11d1-80b4-00c04fd430c8"; // UUID namespace OID

function uuidV5(namespace, name) {
  const nsHex = namespace.replace(/-/g, "");
  const nsBytes = Buffer.from(nsHex, "hex");
  const hash = createHash("sha1").update(nsBytes).update(Buffer.from(name, "utf8")).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant RFC4122
  const h = hash.toString("hex");
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join("-");
}

function catalogId(sourceId) {
  return uuidV5(NS_OID, `${CATALOG.source}:${sourceId}`);
}

// ── Tag derivation ────────────────────────────────────────────────────────────

const LEG_MUSCLES = new Set([
  "glutes", "calves", "quadriceps", "hamstrings", "adductors", "abductors",
]);

function deriveTags(src) {
  const tags = new Set();
  if (src.force === "push") tags.add("push");
  if (src.force === "pull") tags.add("pull");
  if (src.category === "cardio") tags.add("cardio");
  if (src.category === "stretching") tags.add("mobility");
  for (const m of src.primaryMuscles ?? []) {
    if (m === "abdominals") tags.add("core");
    if (LEG_MUSCLES.has(m)) tags.add("legs");
  }
  return [...tags].sort();
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!existsSync(INPUT_PATH)) {
  console.error(`ERROR: Input file not found: ${INPUT_PATH}`);
  console.error("Clone the source repo: git clone https://github.com/yuhonas/free-exercise-db vendor/free-exercise-db");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
console.log(`\nSource exercises loaded: ${raw.length}`);

// ── Filter & validate ─────────────────────────────────────────────────────────

const skipped = [];
const exercises = [];

for (const src of raw) {
  // Category filter
  if (INCLUDE_CATS && !INCLUDE_CATS.has(src.category)) {
    skipped.push({ id: src.id, reason: `category excluded (${src.category})` });
    continue;
  }
  if (EXCLUDE_CATS.includes(src.category)) {
    skipped.push({ id: src.id, reason: `category excluded (${src.category})` });
    continue;
  }

  // Validate enum fields — skip with warning if invalid
  if (src.category && !VALID_CATEGORIES.has(src.category)) {
    skipped.push({ id: src.id, reason: `invalid category: ${src.category}` });
    continue;
  }

  const rawEquipment = src.equipment ?? null;
  const equipment = rawEquipment === null ? "none" : rawEquipment;
  if (!VALID_EQUIPMENT.has(equipment)) {
    skipped.push({ id: src.id, reason: `invalid equipment: ${equipment}` });
    continue;
  }
  if (src.level && !VALID_LEVELS.has(src.level)) {
    skipped.push({ id: src.id, reason: `invalid level: ${src.level}` });
    continue;
  }
  if (src.mechanic && !VALID_MECHANICS.has(src.mechanic)) {
    skipped.push({ id: src.id, reason: `invalid mechanic: ${src.mechanic}` });
    continue;
  }
  if (src.force && !VALID_FORCES.has(src.force)) {
    skipped.push({ id: src.id, reason: `invalid force: ${src.force}` });
    continue;
  }

  const invalidPrimaryMuscle = (src.primaryMuscles ?? []).find((m) => !VALID_MUSCLES.has(m));
  if (invalidPrimaryMuscle) {
    skipped.push({ id: src.id, reason: `invalid primary muscle: ${invalidPrimaryMuscle}` });
    continue;
  }

  const invalidSecondaryMuscle = (src.secondaryMuscles ?? []).find((m) => !VALID_MUSCLES.has(m));
  if (invalidSecondaryMuscle) {
    skipped.push({ id: src.id, reason: `invalid secondary muscle: ${invalidSecondaryMuscle}` });
    continue;
  }

  const primaryMuscles = src.primaryMuscles ?? [];
  const secondaryMuscles = src.secondaryMuscles ?? [];

  const instructions = src.instructions ?? [];
  const instructionsJson =
    instructions.length > 0 ? JSON.stringify(instructions) : null;

  exercises.push({
    id: catalogId(src.id),
    name: src.name,
    notes: null,
    tags: deriveTags(src),
    image_url: null,
    catalog_source: CATALOG.source,
    catalog_id: src.id,
    is_catalog: true,
    category: src.category ?? null,
    equipment,
    level: src.level ?? null,
    mechanic: src.mechanic ?? null,
    force: src.force ?? null,
    instructions_json: instructionsJson,
    primary_muscles: primaryMuscles,
    secondary_muscles: secondaryMuscles,
    pose_types: [],
  });
}

// Apply --max
const finalExercises = MAX ? exercises.slice(0, MAX) : exercises;

// ── Build output ──────────────────────────────────────────────────────────────

const output = {
  schema: "dzerkout.library",
  version: 1,
  exported_at: new Date().toISOString(),
  exercises: finalExercises,
  set_templates: [],
  workout_templates: [],
  sessions: [],
  session_sets: [],
  session_exercises: [],
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
const json = JSON.stringify(output, null, 2);
writeFileSync(OUTPUT_PATH, json, "utf8");

// ── Reporting ─────────────────────────────────────────────────────────────────

function tally(items, key) {
  const counts = {};
  for (const item of items) {
    const v = item[key] ?? "(null)";
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function tallyArrayField(items, key) {
  const counts = {};
  for (const item of items) {
    for (const v of item[key] ?? []) {
      counts[v] = (counts[v] ?? 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

const fileSizeKb = Math.round(Buffer.byteLength(json, "utf8") / 1024);

console.log("\n── Generation report ────────────────────────────────────────");
console.log(`  Source exercises:   ${raw.length}`);
console.log(`  Output exercises:   ${finalExercises.length}`);
console.log(`  Excluded/skipped:   ${raw.length - finalExercises.length}`);
if (MAX && exercises.length > MAX) {
  console.log(`  (${exercises.length - MAX} more dropped by --max ${MAX})`);
}
console.log(`  Output path:        ${OUTPUT_PATH}`);
console.log(`  Output size:        ${fileSizeKb} KB`);

console.log("\n  By category:");
for (const [cat, n] of tally(finalExercises, "category")) {
  console.log(`    ${n.toString().padStart(4)}  ${cat}`);
}

console.log("\n  By equipment:");
for (const [eq, n] of tally(finalExercises, "equipment")) {
  console.log(`    ${n.toString().padStart(4)}  ${eq}`);
}

console.log("\n  By level:");
for (const [lv, n] of tally(finalExercises, "level")) {
  console.log(`    ${n.toString().padStart(4)}  ${lv}`);
}

console.log("\n  Top primary muscles:");
for (const [m, n] of tallyArrayField(finalExercises, "primary_muscles").slice(0, 10)) {
  console.log(`    ${n.toString().padStart(4)}  ${m}`);
}

console.log("\n  Tag counts:");
for (const [t, n] of tallyArrayField(finalExercises, "tags")) {
  console.log(`    ${n.toString().padStart(4)}  ${t}`);
}

if (skipped.length > 0) {
  console.log(`\n  Skipped records (${skipped.length}):`);
  for (const s of skipped) {
    console.log(`    ${s.id}: ${s.reason}`);
  }
}

// ── Post-generation validation ────────────────────────────────────────────────
{
  const ids = new Set();
  const catalogPairs = new Set();
  const names = new Set();
  let validationErrors = 0;

  for (const ex of finalExercises) {
    if (!ex.name) {
      console.error(`  VALIDATION ERROR: empty name for id ${ex.id}`);
      validationErrors++;
    }
    if (ids.has(ex.id)) {
      console.error(`  VALIDATION ERROR: duplicate id: ${ex.id}`);
      validationErrors++;
    }
    ids.add(ex.id);

    const pair = `${ex.catalog_source}:${ex.catalog_id}`;
    if (catalogPairs.has(pair)) {
      console.error(`  VALIDATION ERROR: duplicate catalog pair: ${pair}`);
      validationErrors++;
    }
    catalogPairs.add(pair);

    if (names.has(ex.name)) {
      console.error(`  VALIDATION ERROR: duplicate name within ${CATALOG.label} catalog: "${ex.name}"`);
      validationErrors++;
    }
    names.add(ex.name);

    if (ex.catalog_source !== CATALOG.source) {
      console.error(`  VALIDATION ERROR: catalog_source "${ex.catalog_source}" does not match expected "${CATALOG.source}" on "${ex.name}"`);
      validationErrors++;
    }
  }

  if (validationErrors > 0) {
    console.error(`\n  VALIDATION FAILED: ${validationErrors} error(s) — fix before importing.\n`);
    process.exit(1);
  }
  console.log("\n  Post-generation validation: OK");
}

console.log("\n─────────────────────────────────────────────────────────────\n");
