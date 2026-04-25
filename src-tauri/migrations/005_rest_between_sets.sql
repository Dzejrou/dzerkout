-- Migration 005: add rest-phase columns to workout_session_sets
--
-- rest_duration_sec  — the configured rest duration (copied from the template at
--                      the moment the previous set ends). NULL = not in rest.
-- rest_started_at    — wall-clock timestamp of when rest began. NULL = not in rest.
--
-- A set is "in rest" when:  rest_started_at IS NOT NULL AND started_at IS NULL
-- A set is "active"  when:  started_at IS NOT NULL AND ended_at IS NULL
-- A set is "ended"   when:  ended_at IS NOT NULL

ALTER TABLE workout_session_sets ADD COLUMN rest_duration_sec INTEGER;
ALTER TABLE workout_session_sets ADD COLUMN rest_started_at   TEXT;
