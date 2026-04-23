-- Marks a set_template as "owned by" a specific workout template.
-- NULL  = global/reusable set (shown in Sets library, can be added to any workout)
-- non-NULL = workout-local set (hidden from Sets library, created by Fork)
ALTER TABLE set_templates
    ADD COLUMN owning_workout_template_id TEXT
        REFERENCES workout_templates(id) ON DELETE CASCADE;
