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
