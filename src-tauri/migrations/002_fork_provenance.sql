-- Add fork provenance tracking to workout_template_set_refs.
-- When a set ref is forked (cloned from within the workout editor via
-- clone_set_from_workout), source_set_template_id records the original
-- set template it was cloned from. NULL = normal (non-forked) set reference.
-- This column is the sole authoritative source for the "Forked" badge in the
-- workout editor; the set template name is NOT used as the distinction.
ALTER TABLE workout_template_set_refs
    ADD COLUMN source_set_template_id TEXT;
