# scripts/

Utility scripts for dzerkout development. Generated output lives in `scripts/generated/` (gitignored).

## Catalog identity & duplicate suffixes

Each catalog generator declares a small `CATALOG` config at the top of the file:

```js
const CATALOG = {
  source: "yoga-poses",      // stable cross-catalog identifier — written to catalog_source
  label: "Yoga",             // human-readable, used in logs
  duplicateSuffix: "Yoga",   // appended in parens to the *display name only* on cross-catalog collisions
};
```

The app enforces globally unique exercise names. When a catalog's display name matches a name from another catalog, the generator appends ` (<duplicateSuffix>)` to disambiguate. Today the only real collision is `Child's Pose` (yoga) vs. `Child's Pose` (free-exercise-db) → the yoga generator emits `Child's Pose (Yoga)`.

The suffix is only ever applied to the **display name**. UUID `id` and `catalog_id` are derived from `<source>:<slug>` and never include the suffix, so renaming or extending the suffix wording later does not change row identity. Re-imports remain idempotent.

To add a new catalog generator, define its own `CATALOG` block with a unique `source` and a `duplicateSuffix` that reads naturally in parens after an exercise name.

---

## generate-free-exercise-db-library.mjs

Converts the [free-exercise-db](https://github.com/yuhonas/free-exercise-db) exercise catalog into dzerkout library JSON format for evaluation and manual import.

### Source

- Repo: `vendor/free-exercise-db/` (gitignored)
- License: [Unlicense](https://unlicense.org/) — public domain
- Data file: `vendor/free-exercise-db/dist/exercises.json`

Clone the source if not present:

```sh
git clone https://github.com/yuhonas/free-exercise-db vendor/free-exercise-db
```

### Generate

```sh
npm run generate:free-exercise-db
```

Or with options:

```sh
node scripts/generate-free-exercise-db-library.mjs \
  --exclude-category "strongman,olympic weightlifting" \
  --max 200 \
  --output scripts/generated/subset.json
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--include-category <list>` | (all valid) | Comma-separated categories to include |
| `--exclude-category <list>` | `strongman,olympic weightlifting` | Comma-separated categories to exclude |
| `--max <n>` | (no limit) | Limit output to first N exercises after filtering |
| `--output <path>` | `scripts/generated/free-exercise-db-library.json` | Output file path |

### Output

- `scripts/generated/free-exercise-db-library.json` (gitignored)
- Schema: `dzerkout.library` version 1 — identical to a manual library export from the app

The generated file is **not** automatically used by the app. It is a standalone JSON file for evaluation.

### Import for evaluation

1. Open the app.
2. Go to **Settings → Data → Import**.
3. Select the generated JSON file.
4. The app will import all exercises as catalog entries (`is_catalog: true`).

Generated exercise IDs are deterministic and catalog source IDs stay unique, so re-importing the same generated file is safe and updates existing rows instead of creating duplicates.

---

## generate-yoga-poses-library.mjs

Converts a yoga pose dataset into dzerkout library JSON format for evaluation and manual import.

### Source

- Data file: `vendor/yoga/yoga_poses.json` (gitignored)
- License: **not yet documented** — drop a `LICENSE` / `README.md` into `vendor/yoga/` before shipping anything that depends on this output.
- The dataset's `photo_url` values point at `pocketyoga.com` (a commercial app's CDN). Those URLs are **intentionally not used** by this generator — `image_url` is always `null` in the output.

### Generate

```sh
npm run generate:yoga-poses
```

Or with options:

```sh
node scripts/generate-yoga-poses-library.mjs \
  --max 50 \
  --output scripts/generated/yoga-subset.json
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--max <n>` | (no limit) | Limit output to first N exercises after filtering |
| `--output <path>` | `scripts/generated/yoga-poses-library.json` | Output file path |

### Output

- `scripts/generated/yoga-poses-library.json` (gitignored)
- Schema: `dzerkout.library` version 1 — identical to a manual library export from the app
- The seed file `src-tauri/seeds/default_library.json` is **not** touched by this generator.

### Mapping notes

- `category` = `"yoga"`, `equipment` = `"none"`, `tags` = `["mobility", "yoga"]`.
- `expertise_level` is mapped: `Beginner → beginner`, `Intermediate → intermediate`, `Advanced → expert`. Empty/unknown becomes `null`.
- `image_url` is **always `null`**. Source `photo_url` points at `pocketyoga.com` and is not redistributed.
- `pose_type` is emitted as first-class metadata via the `pose_types` array, normalized to the DB enum (e.g. `"Standing"` → `"standing"`, `"Forward Bend"` → `"forward_bend"`).
- `sanskrit_name` is emitted as a first-class field on the exercise (no longer folded into `notes`). The free-exercise-db generator emits `sanskrit_name: null` so both catalogs share the same shape.
- When a yoga pose name collides with a free-exercise-db exercise name, the display name gets ` (Yoga)` appended (driven by the catalog's `duplicateSuffix`). The `id` and `catalog_id` are unaffected.
- `primary_muscles`, `secondary_muscles`, `instructions_json`, `mechanic`, `force` — all empty/null; the dataset doesn't carry that information.
- `catalog_source` = `"yoga-poses"`, `catalog_id` = slugified pose name, `id` = UUID v5 over `"yoga-poses:<slug>"`. Re-imports update existing rows.

### Import for evaluation

1. Open the app.
2. Go to **Settings → Data → Import**.
3. Select the generated JSON file.

---

## Bundling both catalogs into the default library

`src-tauri/seeds/default_library.json` ships inside the app binary via
`include_str!` and is the seed applied on first run. Generated catalog files in
`scripts/generated/` are **not committed** and are not the seed directly. To
rebuild the bundled default library with both catalogs included:

1. `npm run generate:free-exercise-db`
2. `npm run generate:yoga-poses`
3. In a clean app instance, **Clear local data** (Settings → Data → Clear).
   This is important: the export step below includes session history if any
   exists, and the seed should be catalog-only.
4. Import both generated JSON files via Settings → Data → Import.
5. **Export** the app data via Settings → Data → Export.
6. Replace `src-tauri/seeds/default_library.json` with the exported JSON.
7. Rebuild the app / APK.

The bundled defaults remain catalog-filterable in the Exercise Library because
`catalog_source`, `catalog_id`, and `is_catalog` are preserved end-to-end
through export and import.
