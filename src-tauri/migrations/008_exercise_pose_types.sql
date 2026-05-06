-- Yoga pose types as first-class exercise metadata.
-- Normalized join table; an exercise can have multiple pose types.

CREATE TABLE exercise_pose_types (
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    pose_type   TEXT NOT NULL CHECK (pose_type IN (
        'standing', 'forward_bend', 'seated', 'arm_leg_support',
        'back_bend', 'balancing', 'arm_balance', 'supine', 'prone',
        'inversion', 'twist', 'lateral_bend'
    )),
    PRIMARY KEY (exercise_id, pose_type)
);

CREATE INDEX idx_exercise_pose_types_by_type
    ON exercise_pose_types (pose_type);
CREATE INDEX idx_exercise_pose_types_by_exercise
    ON exercise_pose_types (exercise_id);
