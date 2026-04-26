-- Normalized tag storage for exercises.
-- Each row represents one tag applied to one exercise.
-- ON DELETE CASCADE ensures tags are removed when the exercise is deleted.

CREATE TABLE exercise_tags (
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    tag         TEXT NOT NULL,
    PRIMARY KEY (exercise_id, tag)
);
