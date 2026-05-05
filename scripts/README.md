# scripts/

Utility scripts for dzerkout development. Generated output lives in `scripts/generated/` (gitignored).

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
2. Go to **Settings → Library → Import**.
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
- `sanskrit_name` and `pose_type` are **temporarily** stored as plain text inside `notes` (e.g. `"Sanskrit: Padangusthasana\nPose type: Standing, Forward Bend"`) until the schema gains dedicated columns / a join table for them.
- `primary_muscles`, `secondary_muscles`, `instructions_json`, `mechanic`, `force` — all empty/null; the dataset doesn't carry that information.
- `catalog_source` = `"yoga-poses"`, `catalog_id` = slugified pose name, `id` = UUID v5 over `"yoga-poses:<slug>"`. Re-imports update existing rows.

### Import for evaluation

1. Open the app.
2. Go to **Settings → Library → Import**.
3. Select the generated JSON file.
