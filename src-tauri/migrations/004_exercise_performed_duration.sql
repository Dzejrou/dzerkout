-- Track actual performed duration per exercise.
--
-- paused_offset_sec: the parent set's paused_total_sec at the moment this
--   exercise became active. Per-exercise paused time =
--   (set.paused_total_sec at end) - paused_offset_sec.
--
-- performed_duration_sec: active wall-time seconds for this exercise.
--   NULL until the exercise leaves the 'active' state.
--   Cleared back to NULL if corrective Prev resets the exercise.

ALTER TABLE workout_session_exercises
    ADD COLUMN paused_offset_sec INTEGER NOT NULL DEFAULT 0;

ALTER TABLE workout_session_exercises
    ADD COLUMN performed_duration_sec INTEGER;
