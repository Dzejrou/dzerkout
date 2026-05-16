-- Multi-image support for catalog exercises.
--
-- `image_urls_json` stores a JSON-encoded array of image URLs (typically
-- app-relative paths like `catalog/free-exercise-db/<catalog_id>/0.jpg`).
-- NULL when the exercise has no image set, or only has the legacy
-- single-image `image_url` column populated.
--
-- The single `image_url` column is preserved unchanged. The detail-pane
-- renderer prefers `image_urls_json` when present and falls back to
-- `image_url` otherwise, so existing rows keep working with no migration
-- of data needed.
--
-- Validation (every element non-empty string, top-level JSON array) lives
-- in the domain layer alongside `instructions_json`.

ALTER TABLE exercises ADD COLUMN image_urls_json TEXT;
