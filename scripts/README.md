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
- `image_url` and `image_urls_json` are populated from local files under `public/catalog/free-exercise-db/<catalog_id>/` when present; both stay `null` when no local images exist. See [Local free-exercise-db images](#local-free-exercise-db-images-mac--dev-only) below for the copy workflow.

The generated file is **not** automatically used by the app. It is a standalone JSON file for evaluation.

### Workflow with local images (mac/dev only)

```sh
npm run copy:free-exercise-db-images   # populates public/catalog/free-exercise-db/
npm run generate:free-exercise-db      # emits JSON with image_url + image_urls_json set
# then import scripts/generated/free-exercise-db-library.json via Settings → Data → Import
```

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
- The dataset's `photo_url` values point at `pocketyoga.com` (a commercial app's CDN). The generator does **not** embed those URLs into `image_url`. Instead it checks for a locally-downloaded copy at `public/catalog/yoga-poses/<catalog_id>.png` and emits `image_url: "catalog/yoga-poses/<catalog_id>.png"` (app-relative, **no leading slash**) only if that file exists. If the file is missing, `image_url` stays `null`. Run `npm run download:yoga-images` first to populate the local images (mac/dev only — see [Local yoga pose images](#local-yoga-pose-images-mac--dev-only) below).

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
- `image_url` is `"catalog/yoga-poses/<catalog_id>.png"` (app-relative, **no leading slash** — see note below) when a local image exists at `public/catalog/yoga-poses/<catalog_id>.png`, otherwise `null`. Source `photo_url` points at `pocketyoga.com` and is **not** redistributed via the generated JSON.
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

## Local yoga pose images (mac / dev only)

`scripts/download-yoga-pose-images.mjs` downloads each pose's `photo_url` from `vendor/yoga/yoga_poses.json` into `public/catalog/yoga-poses/<catalog_id>.png`. The yoga generator then references those local files via `image_url`, and the Exercise Library detail pane renders them.

> ⚠️ **Mac / dev only.** `public/catalog/` is gitignored, never committed, and stripped from Android APKs at build time (see "Android exclusion" below). Do not redistribute the downloaded images — they come from `pocketyoga.com` and are stored locally as a development convenience only.

### Workflow

```sh
npm run download:yoga-images   # populates public/catalog/yoga-poses/
npm run generate:yoga-poses    # emits scripts/generated/yoga-poses-library.json with image_url set
# then import scripts/generated/yoga-poses-library.json via Settings → Data → Import
```

The downloader is **idempotent**: existing files are skipped by default. Pass `--force` to re-download, or `--limit <n>` to fetch only the first N poses (useful for smoke-testing).

### Why `image_url` is app-relative (no leading slash)

Generated `image_url` values look like `catalog/yoga-poses/big-toe-pose.png`, **not** `/catalog/yoga-poses/big-toe-pose.png`. Tauri serves the bundled web app from a non-root base URL on mac, so absolute `/catalog/...` paths fail to resolve in the webview and the image silently 404s. App-relative paths resolve correctly against the served document base in both `vite dev` and the packaged Tauri bundle.

Per-image failures (HTTP errors, missing `photo_url`, network timeouts) are tolerated — the script logs counts and continues. A pose without a downloaded image still imports normally; the detail pane simply omits the image. The script exits non-zero only on structural errors (missing input JSON, unwritable output dir).

### Android exclusion

Vite copies everything under `public/` into the build output, which Tauri then bundles into both desktop binaries and Android APKs. To keep these images out of the APK:

- `vite.config.ts` registers a small `closeBundle` plugin that detects `TAURI_ENV_PLATFORM=android` (set automatically by `tauri android build/dev`) and removes `dist/catalog/` after the bundle is written.
- The plugin is a no-op for desktop / `vite dev` builds, so mac and dev workflows keep the images.
- If you ever rename `public/catalog/`, update the path in `vite.config.ts` to match — otherwise the images will leak into the APK.

There is no per-file allowlist; everything under `public/catalog/` is treated as local-dev-only catalog assets.

---

## Local free-exercise-db images (mac / dev only)

`scripts/copy-free-exercise-db-images.mjs` copies each exercise's image files from the gitignored vendor checkout (`vendor/free-exercise-db/exercises/<src.id>/<basename>`) into `public/catalog/free-exercise-db/<catalog_id>/<basename>`. The free-exercise-db generator then references those local files via `image_url` (first image) and `image_urls_json` (full ordered array of locally-present images), and the Exercise Library detail pane renders them as a vertical stack.

> ⚠️ **Mac / dev only.** `public/catalog/` is gitignored, never committed, and stripped from Android APKs at build time (see Android exclusion below). The free-exercise-db source itself is Unlicense / public domain, but we still don't ship the images inside Android binaries — keep parity with the yoga images and avoid bloating the APK.

### Workflow

```sh
npm run copy:free-exercise-db-images   # populates public/catalog/free-exercise-db/
npm run generate:free-exercise-db      # emits JSON with image_url + image_urls_json set
# then import scripts/generated/free-exercise-db-library.json via Settings → Data → Import
```

The copier is **idempotent**: existing destination files are skipped by default. Pass `--force` to overwrite, or `--limit <n>` to copy only the first N exercises' images (useful for smoke-testing).

### Multi-image support: `image_urls_json`

Free-exercise-db ships **two images per exercise** (`0.jpg`, `1.jpg`). The generator emits both into a JSON-stringified array stored in `image_urls_json`, e.g. `'["catalog/free-exercise-db/3_4_Sit-Up/0.jpg","catalog/free-exercise-db/3_4_Sit-Up/1.jpg"]'`. The detail pane parses this and renders each image one below the other; if a single image fails to load, only that image is hidden, not the whole stack. The single-image `image_url` column is still set to the first image so older code paths and exports remain valid.

### Android exclusion

The same `closeBundle` plugin in `vite.config.ts` that strips `dist/catalog/yoga-poses/` also strips `dist/catalog/free-exercise-db/`. No additional configuration needed — the plugin removes all of `dist/catalog/` for Android builds.

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
