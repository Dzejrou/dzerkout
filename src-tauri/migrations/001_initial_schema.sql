-- ============================================================
-- Table: exercises
-- ============================================================
CREATE TABLE exercises (
    id          TEXT NOT NULL PRIMARY KEY,
    name        TEXT NOT NULL,
    notes       TEXT,
    image_url   TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX uq_exercises_name ON exercises (name);

-- ============================================================
-- Table: set_templates
-- ============================================================
CREATE TABLE set_templates (
    id          TEXT NOT NULL PRIMARY KEY,
    name        TEXT NOT NULL,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- Table: set_template_cards
-- ============================================================
CREATE TABLE set_template_cards (
    id                  TEXT NOT NULL PRIMARY KEY,
    set_template_id     TEXT NOT NULL
                            REFERENCES set_templates(id) ON DELETE CASCADE,
    card_type           TEXT NOT NULL
                            CHECK (card_type IN ('concrete', 'placeholder')),
    order_index         INTEGER NOT NULL,
    duration_hint_sec   INTEGER,
    notes               TEXT,
    -- concrete fields
    exercise_id         TEXT
                            REFERENCES exercises(id) ON DELETE RESTRICT,
    -- placeholder fields
    placeholder_tag     TEXT
                            CHECK (placeholder_tag IS NULL OR placeholder_tag IN (
                                'unspecified', 'push', 'pull', 'legs', 'core', 'mobility'
                            )),
    placeholder_label   TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CHECK (
        (card_type = 'concrete'
            AND exercise_id IS NOT NULL
            AND placeholder_tag IS NULL
            AND placeholder_label IS NULL)
        OR
        (card_type = 'placeholder'
            AND placeholder_tag IS NOT NULL
            AND exercise_id IS NULL)
    )
);

CREATE UNIQUE INDEX uq_stc_set_order ON set_template_cards (set_template_id, order_index);

-- ============================================================
-- Table: workout_templates
-- ============================================================
CREATE TABLE workout_templates (
    id                              TEXT NOT NULL PRIMARY KEY,
    name                            TEXT NOT NULL,
    notes                           TEXT,
    default_exercise_duration_sec   INTEGER NOT NULL DEFAULT 120
                                        CHECK (default_exercise_duration_sec > 0),
    rest_between_sets_sec           INTEGER
                                        CHECK (rest_between_sets_sec IS NULL
                                            OR rest_between_sets_sec >= 0),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- Table: workout_template_set_refs
-- ============================================================
CREATE TABLE workout_template_set_refs (
    id                  TEXT NOT NULL PRIMARY KEY,
    workout_template_id TEXT NOT NULL
                            REFERENCES workout_templates(id) ON DELETE CASCADE,
    set_template_id     TEXT NOT NULL
                            REFERENCES set_templates(id) ON DELETE RESTRICT,
    order_index         INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX uq_wtsr_workout_order
    ON workout_template_set_refs (workout_template_id, order_index);

-- ============================================================
-- Table: workout_template_card_assignments
-- ============================================================
CREATE TABLE workout_template_card_assignments (
    id                          TEXT NOT NULL PRIMARY KEY,
    workout_template_set_ref_id TEXT NOT NULL
                                    REFERENCES workout_template_set_refs(id)
                                    ON DELETE CASCADE,
    set_template_card_id        TEXT NOT NULL
                                    REFERENCES set_template_cards(id)
                                    ON DELETE CASCADE,
    exercise_id                 TEXT
                                    REFERENCES exercises(id) ON DELETE RESTRICT,
    display_label               TEXT,
    duration_hint_sec           INTEGER,
    notes                       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    UNIQUE (workout_template_set_ref_id, set_template_card_id)
);

-- ============================================================
-- Table: workout_sessions
-- ============================================================
CREATE TABLE workout_sessions (
    id                              TEXT NOT NULL PRIMARY KEY,
    workout_template_id             TEXT
                                        REFERENCES workout_templates(id)
                                        ON DELETE SET NULL,
    source_workout_template_name    TEXT,
    status                          TEXT NOT NULL DEFAULT 'draft'
                                        CHECK (status IN (
                                            'draft', 'in_progress', 'completed', 'abandoned'
                                        )),
    session_date                    TEXT,
    started_at                      TEXT,
    ended_at                        TEXT,
    notes                           TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_ws_status ON workout_sessions (status)
    WHERE status IN ('draft', 'in_progress');

CREATE INDEX idx_ws_history ON workout_sessions (session_date DESC, started_at DESC)
    WHERE status = 'completed';

-- ============================================================
-- Table: workout_session_sets
-- ============================================================
CREATE TABLE workout_session_sets (
    id                      TEXT NOT NULL PRIMARY KEY,
    workout_session_id      TEXT NOT NULL
                                REFERENCES workout_sessions(id) ON DELETE CASCADE,
    source_set_template_id  TEXT
                                REFERENCES set_templates(id) ON DELETE SET NULL,
    order_index             INTEGER NOT NULL,
    started_at              TEXT,
    ended_at                TEXT,
    paused_total_sec        INTEGER NOT NULL DEFAULT 0,
    paused_at               TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX uq_wss_session_order
    ON workout_session_sets (workout_session_id, order_index);

-- ============================================================
-- Table: workout_session_exercises
-- ============================================================
CREATE TABLE workout_session_exercises (
    id                      TEXT NOT NULL PRIMARY KEY,
    workout_session_set_id  TEXT NOT NULL
                                REFERENCES workout_session_sets(id)
                                ON DELETE CASCADE,
    order_index             INTEGER NOT NULL,
    exercise_id             TEXT
                                REFERENCES exercises(id) ON DELETE SET NULL,
    placeholder_tag         TEXT
                                CHECK (placeholder_tag IS NULL OR placeholder_tag IN (
                                    'unspecified', 'push', 'pull', 'legs', 'core', 'mobility'
                                )),
    display_name            TEXT NOT NULL,
    duration_hint_sec       INTEGER,
    status                  TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                    'pending', 'active', 'completed', 'skipped'
                                )),
    skipped                 INTEGER NOT NULL DEFAULT 0
                                CHECK (skipped IN (0, 1)),
    started_at              TEXT,
    ended_at                TEXT,
    notes                   TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CHECK (
        (skipped = 1 AND status = 'skipped')
        OR
        (skipped = 0 AND status != 'skipped')
    )
);

CREATE UNIQUE INDEX uq_wse_set_order
    ON workout_session_exercises (workout_session_set_id, order_index);

CREATE INDEX idx_wse_active
    ON workout_session_exercises (workout_session_set_id, status)
    WHERE status = 'active';

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER trg_exercises_updated_at
AFTER UPDATE ON exercises FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE exercises
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_set_templates_updated_at
AFTER UPDATE ON set_templates FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE set_templates
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_set_template_cards_updated_at
AFTER UPDATE ON set_template_cards FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE set_template_cards
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_workout_templates_updated_at
AFTER UPDATE ON workout_templates FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE workout_templates
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_workout_template_set_refs_updated_at
AFTER UPDATE ON workout_template_set_refs FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE workout_template_set_refs
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_workout_template_card_assignments_updated_at
AFTER UPDATE ON workout_template_card_assignments FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE workout_template_card_assignments
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_workout_sessions_updated_at
AFTER UPDATE ON workout_sessions FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE workout_sessions
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_workout_session_sets_updated_at
AFTER UPDATE ON workout_session_sets FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE workout_session_sets
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_workout_session_exercises_updated_at
AFTER UPDATE ON workout_session_exercises FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE workout_session_exercises
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;
