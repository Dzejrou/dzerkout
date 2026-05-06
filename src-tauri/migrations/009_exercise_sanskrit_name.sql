-- Sanskrit name as structured exercise metadata.
-- Nullable; non-yoga exercises remain null. Empty/whitespace input is normalized
-- to NULL in the domain layer. No index: text search uses LIKE '%query%' which
-- a normal index won't accelerate.

ALTER TABLE exercises ADD COLUMN sanskrit_name TEXT;
