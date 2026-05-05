#!/usr/bin/env node
/**
 * generate-yoga-poses-library.mjs
 *
 * Converts vendor/yoga/yoga_poses.json into dzerkout library JSON format
 * (schema: "dzerkout.library", version 1).
 *
 * Notes:
 *   - photo_url values point at pocketyoga.com and are intentionally NOT used;
 *     image_url is always null in the output.
 *   - sanskrit_name and pose_type are temporarily folded into the notes field
 *     until the schema gains dedicated columns/tables.
 *
 * Usage:
 *   node scripts/generate-yoga-poses-library.mjs [options]
 *
 * Options:
 *   --max <n>        Limit output to first N exercises (after filtering)
 *   --output <path>  Output file path
 *                    (default: scripts/generated/yoga-poses-library.json)
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

const INPUT_PATH = resolve(ROOT, "vendor/yoga/yoga_poses.json");
const OUTPUT_PATH = resolve(
  ROOT,
  flag("--output") ?? "scripts/generated/yoga-poses-library.json",
);
const MAX = flag("--max") ? parseInt(flag("--max"), 10) : null;

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
const VALID_TAGS = new Set([
  "unspecified", "push", "pull", "legs", "core", "mobility", "yoga",
  "cardio", "isotonic", "isometric", "concentric", "eccentric",
]);

const CATEGORY = "yoga";
const EQUIPMENT = "none";
const TAGS = ["mobility", "yoga"]; // alphabetical, mirrors Rust sort order

// Sanity-check the constants we depend on.
if (!VALID_CATEGORIES.has(CATEGORY)) throw new Error(`category '${CATEGORY}' not in VALID_CATEGORIES`);
if (!VALID_EQUIPMENT.has(EQUIPMENT)) throw new Error(`equipment '${EQUIPMENT}' not in VALID_EQUIPMENT`);
for (const t of TAGS) {
  if (!VALID_TAGS.has(t)) throw new Error(`tag '${t}' not in VALID_TAGS`);
}

// ── UUID v5 (no external deps, uses built-in crypto SHA-1) ───────────────────

const NS_OID = "6ba7b812-9dad-11d1-80b4-00c04fd430c8";

function uuidV5(namespace, name) {
  const nsHex = namespace.replace(/-/g, "");
  const nsBytes = Buffer.from(nsHex, "hex");
  const hash = createHash("sha1").update(nsBytes).update(Buffer.from(name, "utf8")).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.toString("hex");
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join("-");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapLevel(raw) {
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
  switch (v.toLowerCase()) {
    case "beginner": return "beginner";
    case "intermediate": return "intermediate";
    case "advanced": return "expert";
    default: return null;
  }
}

function normalizePoseTypes(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const t of arr) {
    if (typeof t !== "string") continue;
    const trimmed = t.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function buildNotes(sanskritName, poseTypes) {
  const lines = [];
  const sanskrit = (sanskritName ?? "").trim();
  if (sanskrit) lines.push(`Sanskrit: ${sanskrit}`);
  if (poseTypes.length > 0) lines.push(`Pose type: ${poseTypes.join(", ")}`);
  return lines.length === 0 ? null : lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!existsSync(INPUT_PATH)) {
  console.error(`ERROR: Input file not found: ${INPUT_PATH}`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
console.log(`\nSource yoga poses loaded: ${raw.length}`);

const skipped = [];
const exercises = [];
const seenSlugs = new Map();

for (let idx = 0; idx < raw.length; idx++) {
  const src = raw[idx];

  const name = (src?.name ?? "").trim();
  if (!name) {
    skipped.push({ index: idx, name: src?.name ?? "(missing)", reason: "empty name" });
    continue;
  }

  const slug = slugify(name);
  if (!slug) {
    skipped.push({ index: idx, name, reason: "name produced empty slug" });
    continue;
  }

  // The dataset has one corrupt entry whose name normalizes to just "pose"
  // and which carries no other usable metadata. Skip it explicitly.
  if (slug === "pose") {
    skipped.push({ index: idx, name, reason: "corrupt placeholder row" });
    continue;
  }

  if (seenSlugs.has(slug)) {
    skipped.push({
      index: idx,
      name,
      reason: `duplicate slug '${slug}' (collides with '${seenSlugs.get(slug)}')`,
    });
    continue;
  }
  seenSlugs.set(slug, name);

  const level = mapLevel(src?.expertise_level);
  if (level !== null && !VALID_LEVELS.has(level)) {
    skipped.push({ index: idx, name, reason: `invalid mapped level: ${level}` });
    continue;
  }

  const poseTypes = normalizePoseTypes(src?.pose_type);
  const notes = buildNotes(src?.sanskrit_name, poseTypes);

  exercises.push({
    id: uuidV5(NS_OID, `yoga-poses:${slug}`),
    name,
    notes,
    tags: [...TAGS],
    image_url: null,
    catalog_source: "yoga-poses",
    catalog_id: slug,
    is_catalog: true,
    category: CATEGORY,
    equipment: EQUIPMENT,
    level,
    mechanic: null,
    force: null,
    instructions_json: null,
    primary_muscles: [],
    secondary_muscles: [],
    _poseTypes: poseTypes, // stripped before write; used only for reporting
  });
}

const finalExercises = (MAX ? exercises.slice(0, MAX) : exercises).map((e) => {
  const { _poseTypes, ...rest } = e;
  return rest;
});

const reportableExercises = MAX ? exercises.slice(0, MAX) : exercises;

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
console.log(`  Source records:     ${raw.length}`);
console.log(`  Output exercises:   ${finalExercises.length}`);
console.log(`  Excluded/skipped:   ${raw.length - finalExercises.length}`);
if (MAX && exercises.length > MAX) {
  console.log(`  (${exercises.length - MAX} more dropped by --max ${MAX})`);
}
console.log(`  Output path:        ${OUTPUT_PATH}`);
console.log(`  Output size:        ${fileSizeKb} KB`);

console.log("\n  By level:");
for (const [lv, n] of tally(finalExercises, "level")) {
  console.log(`    ${n.toString().padStart(4)}  ${lv}`);
}

console.log("\n  By pose type (normalized):");
for (const [pt, n] of tallyArrayField(reportableExercises, "_poseTypes")) {
  console.log(`    ${n.toString().padStart(4)}  ${pt}`);
}

console.log("\n  Tag counts:");
for (const [t, n] of tallyArrayField(finalExercises, "tags")) {
  console.log(`    ${n.toString().padStart(4)}  ${t}`);
}

if (skipped.length > 0) {
  console.log(`\n  Skipped records (${skipped.length}):`);
  for (const s of skipped) {
    console.log(`    [${s.index}] ${s.name || "(empty)"}: ${s.reason}`);
  }
}

console.log("\n─────────────────────────────────────────────────────────────\n");
