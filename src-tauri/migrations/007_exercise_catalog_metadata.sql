-- Add catalog metadata columns to exercises.
-- All columns are nullable (or default 0) so existing user-created exercises are unaffected.

ALTER TABLE exercises ADD COLUMN catalog_source TEXT;
ALTER TABLE exercises ADD COLUMN catalog_id     TEXT;
ALTER TABLE exercises ADD COLUMN is_catalog     INTEGER NOT NULL DEFAULT 0
    CHECK (is_catalog IN (0, 1));

ALTER TABLE exercises ADD COLUMN category TEXT
    CHECK (category IS NULL OR category IN (
        'strength', 'stretching', 'cardio', 'plyometrics',
        'powerlifting', 'olympic weightlifting', 'strongman', 'yoga'
    ));

ALTER TABLE exercises ADD COLUMN equipment TEXT
    CHECK (equipment IS NULL OR equipment IN (
        'none', 'body only', 'barbell', 'dumbbell', 'cable', 'machine',
        'kettlebells', 'bands', 'medicine ball', 'exercise ball',
        'foam roll', 'e-z curl bar', 'other'
    ));

ALTER TABLE exercises ADD COLUMN level TEXT
    CHECK (level IS NULL OR level IN ('beginner', 'intermediate', 'expert'));

ALTER TABLE exercises ADD COLUMN mechanic TEXT
    CHECK (mechanic IS NULL OR mechanic IN ('compound', 'isolation'));

ALTER TABLE exercises ADD COLUMN force TEXT
    CHECK (force IS NULL OR force IN ('push', 'pull', 'static'));

-- Stored as a JSON array of strings; validated in the application layer.
ALTER TABLE exercises ADD COLUMN instructions_json TEXT;

-- Enforce (catalog_source, catalog_id) uniqueness only when both are non-null.
CREATE UNIQUE INDEX uq_exercises_catalog
    ON exercises (catalog_source, catalog_id)
    WHERE catalog_source IS NOT NULL AND catalog_id IS NOT NULL;

-- Partial indexes for future filtering queries.
CREATE INDEX idx_exercises_category  ON exercises (category)  WHERE category  IS NOT NULL;
CREATE INDEX idx_exercises_equipment ON exercises (equipment) WHERE equipment IS NOT NULL;
CREATE INDEX idx_exercises_level     ON exercises (level)     WHERE level     IS NOT NULL;
CREATE INDEX idx_exercises_force     ON exercises (force)     WHERE force     IS NOT NULL;

-- ============================================================
-- Table: exercise_muscles
-- ============================================================
CREATE TABLE exercise_muscles (
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    muscle      TEXT NOT NULL CHECK (muscle IN (
        'abdominals', 'abductors', 'adductors', 'biceps', 'calves',
        'chest', 'forearms', 'glutes', 'hamstrings', 'lats',
        'lower back', 'middle back', 'neck', 'quadriceps',
        'shoulders', 'traps', 'triceps'
    )),
    role        TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
    PRIMARY KEY (exercise_id, muscle, role)
);

CREATE INDEX idx_exercise_muscles_by_muscle   ON exercise_muscles (muscle, role);
CREATE INDEX idx_exercise_muscles_by_exercise ON exercise_muscles (exercise_id);
