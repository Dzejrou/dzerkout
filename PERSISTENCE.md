# dzerkout — Persistence Design

**Version**: 1.1
**Date**: 2026-05-05
**Inputs**: [SPEC.md](SPEC.md) · [ARCH.md](ARCH.md)  
**Stack**: SQLite · Rust · sqlx (direct SQL, no ORM)

---

## 1. Schema Overview

### Relational model

```mermaid
erDiagram
    exercises ||--o{ exercise_tags              : "has"
    exercises ||--o{ exercise_muscles           : "has"
    exercises ||--o{ exercise_pose_types        : "has"
    exercises ||--o{ set_template_cards         : "referenced by"
    set_templates ||--|{ set_template_cards      : "owns"
    set_templates ||--o{ workout_template_set_refs : "referenced by"
    workout_templates ||--|{ workout_template_set_refs : "owns"
    workout_template_set_refs ||--o{ workout_template_card_assignments : "owns"
    set_template_cards ||--o{ workout_template_card_assignments : "overridden by"
    exercises ||--o{ workout_template_card_assignments : "resolved by"
    workout_templates ||--o{ workout_sessions   : "source of"
    workout_sessions ||--|{ workout_session_sets : "owns"
    set_templates ||--o{ workout_session_sets   : "provenance"
    workout_session_sets ||--|{ workout_session_exercises : "owns"
    exercises ||--o{ workout_session_exercises  : "provenance"
```

### Two-layer split

**Template layer** (`exercises`, `exercise_tags`, `exercise_muscles`,
`exercise_pose_types`,
`set_templates`, `set_template_cards`,
`workout_templates`, `workout_template_set_refs`,
`workout_template_card_assignments`) — reusable, mutable, never directly
executed. Changes here do not affect sessions already snapshotted.

**Session layer** (`workout_sessions`, `workout_session_sets`,
`workout_session_exercises`) — immutable historical record of what was actually
performed. Created atomically at snapshot time; the only mutations are status
transitions and corrective Prev rewrites.

### Where denormalization occurs and why

| Denormalized column | Location | Reason |
|---|---|---|
| `display_name` | `workout_session_exercises` | Exercise may be renamed or deleted; history must be stable |
| `source_workout_template_name` | `workout_sessions` | Template may be renamed; history must show original name |
| `duration_hint_sec` | `workout_session_exercises` | Records the value actually used, after assignment override resolution |
| `notes` | `workout_session_exercises` | Records the notes from assignment or card at snapshot time |
| `placeholder_tag` | `workout_session_exercises` | Preserved for future analytics; the template card may change |
| `paused_offset_sec` | `workout_session_exercises` | Set's `paused_total_sec` at the moment this exercise became active; used to derive per-exercise paused time |
| `performed_duration_sec` | `workout_session_exercises` | Active wall-time seconds for this exercise; NULL until exercise leaves active state; cleared by corrective Prev |

### How workout-specific overrides fit

`workout_template_card_assignments` sits between the template layer and the
session layer. It holds per-workout-per-card overrides (resolved exercise,
label, duration hint, notes). During snapshot creation the service applies the
assignment fallback chain to produce the denormalized session values. The
assignment rows themselves remain in the template layer and are never copied
into sessions.

---

## 2. Representation Choices

### UUIDs — `TEXT`, lowercase, hyphenated

Store as `TEXT` in the form `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

**Rationale:** Readable in any SQLite browser; sqlx maps directly to/from
`uuid::Uuid` via `sqlx::types::Uuid` with the `uuid` feature; no byte-order
ambiguity; negligible size difference for a single-user local app.

In Rust, generate all UUIDs with `uuid::Uuid::new_v4().to_string()` in the
domain/service layer before inserting.

### Timestamps — `TEXT`, ISO 8601 UTC

Store as `TEXT` in the form `YYYY-MM-DDTHH:MM:SS.SSSZ`
(e.g. `2026-04-22T14:30:00.000Z`).

SQLite default expression: `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`

**Rationale:** Compatible with SQLite's built-in `unixepoch()`, `datetime()`,
and `strftime()` functions, which are used in the pause/resume UPDATE. Maps to
`chrono::DateTime<Utc>` in sqlx. Readable in DB browsers.

### Dates — `TEXT`, `YYYY-MM-DD`

Used for `workout_sessions.session_date`. SQLite default expression:
`strftime('%Y-%m-%d', 'now')`.

Maps to `chrono::NaiveDate` in sqlx.

### Enum-like fields — `TEXT` + `CHECK`

Use `TEXT NOT NULL` with `CHECK` constraints. This gives DB-level enforcement
for a small fixed vocabulary without a lookup table, while remaining relaxable
in a future migration.

---

## 3. Final Table Definitions

### 3.1 `exercises`

Stores all exercises available to the user — both user-created and catalog-imported.

```sql
CREATE TABLE exercises (
    id          TEXT NOT NULL PRIMARY KEY,
    name        TEXT NOT NULL,
    sanskrit_name TEXT,                 -- migration 009; nullable; null for non-yoga exercises
    notes       TEXT,
    image_url   TEXT,                   -- reserved; not surfaced in v1 UI
    -- Catalog metadata (migration 007); all nullable so user-created rows are unaffected
    catalog_source TEXT,               -- source identifier, e.g. "free-exercise-db"
    catalog_id     TEXT,               -- ID within that source
    is_catalog     INTEGER NOT NULL DEFAULT 0
                       CHECK (is_catalog IN (0, 1)),
    category    TEXT
                    CHECK (category IS NULL OR category IN (
                        'strength', 'stretching', 'cardio', 'plyometrics',
                        'powerlifting', 'olympic weightlifting', 'strongman', 'yoga'
                    )),
    equipment   TEXT
                    CHECK (equipment IS NULL OR equipment IN (
                        'none', 'body only', 'barbell', 'dumbbell', 'cable', 'machine',
                        'kettlebells', 'bands', 'medicine ball', 'exercise ball',
                        'foam roll', 'e-z curl bar', 'other'
                    )),
    level       TEXT
                    CHECK (level IS NULL OR level IN (
                        'beginner', 'intermediate', 'expert'
                    )),
    mechanic    TEXT
                    CHECK (mechanic IS NULL OR mechanic IN ('compound', 'isolation')),
    force       TEXT
                    CHECK (force IS NULL OR force IN ('push', 'pull', 'static')),
    instructions_json TEXT,            -- validated as JSON array of strings in domain layer
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX uq_exercises_name ON exercises (name);

-- Prevents importing the same catalog exercise twice (migration 007)
CREATE UNIQUE INDEX uq_exercises_catalog
    ON exercises (catalog_source, catalog_id)
    WHERE catalog_source IS NOT NULL AND catalog_id IS NOT NULL;

-- Partial indexes for catalog filter queries (migration 007)
CREATE INDEX idx_exercises_category  ON exercises (category)  WHERE category  IS NOT NULL;
CREATE INDEX idx_exercises_equipment ON exercises (equipment) WHERE equipment IS NOT NULL;
CREATE INDEX idx_exercises_level     ON exercises (level)     WHERE level     IS NOT NULL;
CREATE INDEX idx_exercises_force     ON exercises (force)     WHERE force     IS NOT NULL;
```

**Catalog vs user distinction:**
- `is_catalog = 0` (default): user-created exercise.
- `is_catalog = 1`: imported from an external catalog source (`catalog_source` / `catalog_id`).
- Catalog exercises can be edited by the user; `is_catalog` is informational only.

**Constraints:** `name` uniqueness enforced by `uq_exercises_name`. Catalog
uniqueness enforced by `uq_exercises_catalog` partial index on the non-null pair.
No FK dependencies.

**`sanskrit_name` semantics (migration 009):**
- Optional. `NULL` for non-yoga exercises and yoga exercises without a recorded Sanskrit name.
- Empty / whitespace-only input is normalized to `NULL` in the domain layer.
- Used as a **search-match target** alongside `name` (see §11 query catalog) and surfaced
  in the Exercise Library detail pane as secondary text.
- No index. Search uses `LIKE '%query%'`, which a normal index cannot accelerate; the
  table is small enough at v1 scale (low thousands of rows) that a sequential scan is fine.

---

### 3.2 `exercise_tags`

Normalized tag storage. One row per tag per exercise. Added in migration 006.

```sql
CREATE TABLE exercise_tags (
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    tag         TEXT NOT NULL,
    PRIMARY KEY (exercise_id, tag)
);
```

**Constraints:** `ON DELETE CASCADE` — tags are automatically removed when the
exercise is deleted. No `CHECK` constraint on `tag`; validation is domain-layer
only (against `VALID_EXERCISE_TAGS`).

**Valid tag values** (enforced in Rust `VALID_EXERCISE_TAGS`):
`unspecified`, `push`, `pull`, `legs`, `core`, `mobility`, `yoga`, `cardio`,
`isotonic`, `isometric`, `concentric`, `eccentric`.

Note: `placeholder_tag` in `set_template_cards` uses the same first 6 values
(`unspecified`, `push`, `pull`, `legs`, `core`, `mobility`) enforced at DB level
by `CHECK` constraint. The extra 6 tag values are exercise-only and have no DB
CHECK — domain layer is the enforcement boundary.

---

### 3.3 `exercise_muscles`

Tracks primary and secondary muscle targets per exercise. Added in migration 007.

```sql
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
```

**FK notes:**
- `exercise_id CASCADE`: muscle rows are owned by the exercise; deletion of the
  exercise automatically removes all its muscle rows (no domain-layer step needed).

---

### 3.3a `exercise_pose_types`

Tracks yoga-style pose types per exercise. Added in migration 008.

```sql
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
```

**Semantics:**
- An exercise may have zero or more pose types. Each pose type appears at most once per exercise.
- Validated at the DB layer via `CHECK`; the domain layer mirrors the same vocabulary for
  early error reporting.
- Searched via JOIN (`idx_exercise_pose_types_by_type`) when the user filters by pose type;
  loaded by `idx_exercise_pose_types_by_exercise` for detail-pane display.

**FK notes:**
- `exercise_id CASCADE`: pose-type rows are owned by the exercise; deletion of the
  exercise automatically removes all its pose-type rows (no domain-layer step needed).

---

### 3.4 `set_templates`

Reusable named sets. Owns cards via `set_template_cards`.

```sql
CREATE TABLE set_templates (
    id          TEXT NOT NULL PRIMARY KEY,
    name        TEXT NOT NULL,
    notes       TEXT,
    owning_workout_template_id TEXT
                    REFERENCES workout_templates(id) ON DELETE CASCADE, -- migration 003
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

**`owning_workout_template_id` semantics (migration 003):**
- `NULL` = global/reusable set; appears in the Sets library, can be added to any workout.
- non-`NULL` = workout-local set; hidden from the Sets library; created when the user
  forks a set from within the workout editor (`clone_set_from_workout`).
- `ON DELETE CASCADE`: deleting a workout template automatically deletes all its
  locally owned sets.

Workout-local sets can be promoted to global via `export_forked_set`, which
creates an independent copy with a new ID and `owning_workout_template_id = NULL`.
The original local fork is not removed by this operation.

---

### 3.5 `set_template_cards`

Ordered cards within a set template. Each card is either `concrete`
(references an exercise) or `placeholder` (carries a tag).

```sql
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
                            CHECK (placeholder_tag IN (
                                'unspecified','push','pull','legs','core','mobility'
                            )),
    placeholder_label   TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- enforce card type invariants
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
```

**FK notes:**
- `set_template_id CASCADE`: cards are owned by their set; deleting a set
  deletes all its cards.
- `exercise_id RESTRICT`: prevents exercise deletion while card references
  exist. The service converts all referencing cards to placeholders within the
  deletion transaction before the DELETE fires (see §9.3).

---

### 3.6 `workout_templates`

Named reusable workouts. Owns set references and per-card assignments.

```sql
CREATE TABLE workout_templates (
    id                          TEXT NOT NULL PRIMARY KEY,
    name                        TEXT NOT NULL,
    notes                       TEXT,
    default_exercise_duration_sec INTEGER NOT NULL DEFAULT 120
                                    CHECK (default_exercise_duration_sec > 0),
    rest_between_sets_sec       INTEGER
                                    CHECK (rest_between_sets_sec IS NULL
                                        OR rest_between_sets_sec >= 0),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

---

### 3.7 `workout_template_set_refs`

Ordered references from a workout template to set templates. The same set
template may appear multiple times.

```sql
CREATE TABLE workout_template_set_refs (
    id                  TEXT NOT NULL PRIMARY KEY,
    workout_template_id TEXT NOT NULL
                            REFERENCES workout_templates(id) ON DELETE CASCADE,
    set_template_id     TEXT NOT NULL
                            REFERENCES set_templates(id) ON DELETE RESTRICT,
    order_index         INTEGER NOT NULL,
    source_set_template_id TEXT,   -- migration 002; see note below
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX uq_wtsr_workout_order
    ON workout_template_set_refs (workout_template_id, order_index);
```

**`source_set_template_id` semantics (migration 002):**
- `NULL` = normal set reference (not forked).
- non-`NULL` = records the original set template ID from which this ref was forked via
  `clone_set_from_workout`. Used solely to drive the "Forked" badge in the workout editor.
- **No FK constraint** on this column: if the original set template is later deleted,
  the value becomes stale but causes no integrity error. The badge display falls back
  gracefully.

**FK notes:**
- `workout_template_id CASCADE`: set refs owned by the workout template.
- `set_template_id RESTRICT`: prevents deleting a set template that is
  still referenced. Service must warn the user and obtain confirmation before
  removing refs and then deleting.

---

### 3.8 `workout_template_card_assignments`

Workout-specific overrides for individual cards within a set reference.
At most one row per `(workout_template_set_ref_id, set_template_card_id)`.

```sql
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
```

The `UNIQUE` constraint on `(workout_template_set_ref_id, set_template_card_id)`
is the backing index for uniqueness enforcement and assignment lookup;
no separate `CREATE INDEX` is needed.

**FK notes:**
- Both parent FKs use `CASCADE`: if the set ref or the source card is
  removed, the assignment is gone.
- `exercise_id RESTRICT`: service handles nulling before exercise delete.
- **Cross-set integrity (service layer):** SQLite cannot enforce with a simple
  FK that the referenced `set_template_card_id` belongs to the `set_template_id`
  that `workout_template_set_ref_id` points to. The service validates this
  explicitly before every insert/upsert (see §9.9).

---

### 3.9 `workout_sessions`

One row per workout attempt. Lifecycle: `draft` → `in_progress` →
`completed | abandoned`.

```sql
CREATE TABLE workout_sessions (
    id                          TEXT NOT NULL PRIMARY KEY,
    workout_template_id         TEXT
                                    REFERENCES workout_templates(id)
                                    ON DELETE SET NULL,
    source_workout_template_name TEXT,   -- denormalized at snapshot time
    status                      TEXT NOT NULL DEFAULT 'draft'
                                    CHECK (status IN (
                                        'draft','in_progress','completed','abandoned'
                                    )),
    session_date                TEXT,    -- YYYY-MM-DD; null until Start pressed
    started_at                  TEXT,    -- null until Start pressed
    ended_at                    TEXT,    -- null until completed or abandoned
    notes                       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- fast lookup for active-session check on app launch
CREATE INDEX idx_ws_status ON workout_sessions (status)
    WHERE status IN ('draft', 'in_progress');

-- reverse-chronological history listing
CREATE INDEX idx_ws_history ON workout_sessions (session_date DESC, started_at DESC)
    WHERE status = 'completed';
```

**FK notes:**
- `workout_template_id SET NULL`: sessions are historical records. If the
  source template is deleted, the session remains with a null FK but retains
  `source_workout_template_name`.

---

### 3.10 `workout_session_sets`

Snapshot of one set as performed. One row per non-empty set reference in the
snapshot. Owns the set timer state and rest-phase state.

```sql
CREATE TABLE workout_session_sets (
    id                      TEXT NOT NULL PRIMARY KEY,
    workout_session_id      TEXT NOT NULL
                                REFERENCES workout_sessions(id) ON DELETE CASCADE,
    source_set_template_id  TEXT
                                REFERENCES set_templates(id) ON DELETE SET NULL,
    order_index             INTEGER NOT NULL,
    started_at              TEXT,       -- set at Phase 2 start or corrective Prev reset
    ended_at                TEXT,
    paused_total_sec        INTEGER NOT NULL DEFAULT 0,  -- accumulated paused seconds
    paused_at               TEXT,       -- non-null while currently paused
    -- Rest-phase columns (migration 005)
    rest_duration_sec       INTEGER,    -- configured rest duration; NULL = not in rest
    rest_started_at         TEXT,       -- wall-clock start of rest; NULL = not in rest
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX uq_wss_session_order
    ON workout_session_sets (workout_session_id, order_index);
```

**Set lifecycle states (derived from columns):**
- **In rest**: `rest_started_at IS NOT NULL AND started_at IS NULL`
- **Active**: `started_at IS NOT NULL AND ended_at IS NULL`
- **Ended**: `ended_at IS NOT NULL`

**FK notes:**
- `workout_session_id CASCADE`: sets are owned by their session.
- `source_set_template_id SET NULL`: provenance only; must not block template
  deletion.

---

### 3.11 `workout_session_exercises`

One row per card as performed or skipped within a session set. The completed
historical record.

```sql
CREATE TABLE workout_session_exercises (
    id                      TEXT NOT NULL PRIMARY KEY,
    workout_session_set_id  TEXT NOT NULL
                                REFERENCES workout_session_sets(id)
                                ON DELETE CASCADE,
    order_index             INTEGER NOT NULL,
    exercise_id             TEXT
                                REFERENCES exercises(id) ON DELETE SET NULL,
    placeholder_tag         TEXT
                                CHECK (placeholder_tag IS NULL
                                    OR placeholder_tag IN (
                                        'unspecified','push','pull','legs',
                                        'core','mobility'
                                    )),
    display_name            TEXT NOT NULL,
    duration_hint_sec       INTEGER,
    status                  TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                    'pending','active','completed','skipped'
                                )),
    skipped                 INTEGER NOT NULL DEFAULT 0  -- SQLite boolean
                                CHECK (skipped IN (0, 1)),
    started_at              TEXT,
    ended_at                TEXT,
    notes                   TEXT,
    -- Per-exercise timing (migration 004)
    paused_offset_sec       INTEGER NOT NULL DEFAULT 0,  -- set.paused_total_sec at activation
    performed_duration_sec  INTEGER,    -- active wall-time seconds; NULL until exercise ends
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- skipped and status must agree
    CHECK (
        (skipped = 1 AND status = 'skipped')
        OR
        (skipped = 0 AND status != 'skipped')
    )
);

CREATE UNIQUE INDEX uq_wse_set_order
    ON workout_session_exercises (workout_session_set_id, order_index);

-- fast active-exercise lookup during runner operations
CREATE INDEX idx_wse_active
    ON workout_session_exercises (workout_session_set_id, status)
    WHERE status = 'active';
```

**Per-exercise paused time derivation:**
```
per_exercise_paused_sec = (set.paused_total_sec at exercise end) - paused_offset_sec
```

`performed_duration_sec` is computed at exercise completion and cleared back to
`NULL` by corrective Prev.

**FK notes:**
- `workout_session_set_id CASCADE`: exercises are owned by their set.
- `exercise_id SET NULL`: when an exercise is deleted, `exercise_id` is
  automatically nulled out by SQLite. `display_name` remains intact as the
  historical record.

---

## 4. `updated_at` Triggers

One trigger per table with an `updated_at` column. Example pattern:

```sql
CREATE TRIGGER trg_exercises_updated_at
AFTER UPDATE ON exercises FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at   -- only fire if not explicitly set
BEGIN
    UPDATE exercises
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;
```

Create equivalent triggers for: `set_templates`, `set_template_cards`,
`workout_templates`, `workout_template_set_refs`,
`workout_template_card_assignments`, `workout_sessions`,
`workout_session_sets`, `workout_session_exercises`.

`exercise_tags` and `exercise_muscles` have no `updated_at` column and require
no trigger.

The `WHEN NEW.updated_at = OLD.updated_at` guard prevents infinite recursion
and allows callers to supply an explicit `updated_at` (useful for future sync
import).

---

## 5. Foreign Key Behavior Reference

| Column | References | ON DELETE | Rationale |
|---|---|---|---|
| `exercise_tags.exercise_id` | `exercises(id)` | CASCADE | Tags owned by exercise |
| `exercise_muscles.exercise_id` | `exercises(id)` | CASCADE | Muscles owned by exercise |
| `exercise_pose_types.exercise_id` | `exercises(id)` | CASCADE | Pose types owned by exercise |
| `set_template_cards.set_template_id` | `set_templates(id)` | CASCADE | Cards owned by set |
| `set_template_cards.exercise_id` | `exercises(id)` | RESTRICT | Service converts card before delete |
| `set_templates.owning_workout_template_id` | `workout_templates(id)` | CASCADE | Local set owned by workout; deleted with it |
| `workout_template_set_refs.workout_template_id` | `workout_templates(id)` | CASCADE | Refs owned by workout |
| `workout_template_set_refs.set_template_id` | `set_templates(id)` | RESTRICT | User warned; service removes refs first |
| `workout_template_card_assignments.workout_template_set_ref_id` | `workout_template_set_refs(id)` | CASCADE | Assignment meaningless without its ref |
| `workout_template_card_assignments.set_template_card_id` | `set_template_cards(id)` | CASCADE | Assignment meaningless without its card |
| `workout_template_card_assignments.exercise_id` | `exercises(id)` | RESTRICT | Service nulls before delete |
| `workout_sessions.workout_template_id` | `workout_templates(id)` | SET NULL | Session is historical; name denormalized |
| `workout_session_sets.workout_session_id` | `workout_sessions(id)` | CASCADE | Sets owned by session |
| `workout_session_sets.source_set_template_id` | `set_templates(id)` | SET NULL | Provenance only |
| `workout_session_exercises.workout_session_set_id` | `workout_session_sets(id)` | CASCADE | Exercises owned by set |
| `workout_session_exercises.exercise_id` | `exercises(id)` | SET NULL | FK nulled; display_name preserved |

`workout_template_set_refs.source_set_template_id` has **no FK constraint** —
it is a plain TEXT field recording the forked-from set ID for badge display.
Staleness after the original set is deleted is acceptable.

### Exercise deletion/unlink — safe sequence

The service executes the following steps in a **single transaction**:

```sql
-- 1. Read exercise name for fallback labels
SELECT name FROM exercises WHERE id = ?;

-- 2. Convert referencing concrete cards to placeholders
UPDATE set_template_cards
SET card_type        = 'placeholder',
    exercise_id      = NULL,
    placeholder_tag  = 'unspecified',
    placeholder_label = :exercise_name,
    updated_at       = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE exercise_id = :id;

-- 3. Null exercise_id on assignments; preserve or set display_label
UPDATE workout_template_card_assignments
SET exercise_id   = NULL,
    display_label = COALESCE(display_label, :exercise_name),
    updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE exercise_id = :id;

-- 4. Delete the exercise.
--    SQLite automatically:
--      SET NULL on workout_session_exercises.exercise_id (via ON DELETE SET NULL FK)
--      CASCADE DELETE on exercise_tags, exercise_muscles, and exercise_pose_types rows
--    Steps 2 & 3 have already removed all RESTRICT-guarded references,
--    so this DELETE succeeds.
DELETE FROM exercises WHERE id = :id;
```

After step 2, `set_template_cards` has no remaining `exercise_id = :id` rows,
so the RESTRICT FK is satisfied at step 4. Step 4 triggers SQLite's built-in
SET NULL cascade on `workout_session_exercises`, preserving `display_name`, and
CASCADE DELETE on `exercise_tags`, `exercise_muscles`, and `exercise_pose_types`.

---

## 6. Index Plan

| Index | Columns | Purpose |
|---|---|---|
| `uq_exercises_name` | `exercises(name)` UNIQUE | Name uniqueness + search |
| `uq_exercises_catalog` | `exercises(catalog_source, catalog_id)` UNIQUE partial WHERE both non-null | Catalog dedup — prevents importing the same catalog exercise twice |
| `idx_exercises_category` | `exercises(category)` partial WHERE non-null | Catalog filter queries |
| `idx_exercises_equipment` | `exercises(equipment)` partial WHERE non-null | Catalog filter queries |
| `idx_exercises_level` | `exercises(level)` partial WHERE non-null | Catalog filter queries |
| `idx_exercises_force` | `exercises(force)` partial WHERE non-null | Catalog filter queries |
| `idx_exercise_muscles_by_muscle` | `exercise_muscles(muscle, role)` | Filter exercises by muscle + role |
| `idx_exercise_muscles_by_exercise` | `exercise_muscles(exercise_id)` | Load muscles for a given exercise |
| `idx_exercise_pose_types_by_type` | `exercise_pose_types(pose_type)` | Filter exercises by pose type |
| `idx_exercise_pose_types_by_exercise` | `exercise_pose_types(exercise_id)` | Load pose types for a given exercise |
| `uq_stc_set_order` | `set_template_cards(set_template_id, order_index)` UNIQUE | Ordered card retrieval; prevents duplicate positions within a set |
| `uq_wtsr_workout_order` | `workout_template_set_refs(workout_template_id, order_index)` UNIQUE | Ordered set ref retrieval; prevents duplicate positions within a workout |
| *(implicit)* | `workout_template_card_assignments(workout_template_set_ref_id, set_template_card_id)` UNIQUE | Backed by the inline `UNIQUE` constraint; no separate index needed |
| `idx_ws_status` | `workout_sessions(status)` partial `WHERE status IN ('draft','in_progress')` | Active-session check at app launch |
| `idx_ws_history` | `workout_sessions(session_date DESC, started_at DESC)` partial `WHERE status = 'completed'` | Reverse-chronological history list |
| `uq_wss_session_order` | `workout_session_sets(workout_session_id, order_index)` UNIQUE | Ordered set retrieval in runner; prevents duplicate positions within a session |
| `uq_wse_set_order` | `workout_session_exercises(workout_session_set_id, order_index)` UNIQUE | Ordered exercise retrieval; prevents duplicate positions within a set |
| `idx_wse_active` | `workout_session_exercises(workout_session_set_id, status)` partial `WHERE status = 'active'` | Current-exercise lookup during runner mutations |

SQLite partial indexes (`WHERE` clause) are supported from SQLite 3.8.9, which
is bundled with Tauri v2. All partial indexes above dramatically shrink the
working set for the most frequent runtime lookups.

Note: no index exists for `mechanic` — the column is present but not indexed.

---

## 7. Migration Plan

Use `sqlx::migrate!("migrations/")` at app startup with numbered migration
files.

### `migrations/001_initial_schema.sql`

Creates all base tables, indexes, and `updated_at` triggers in dependency order:

```
exercises
set_templates
set_template_cards
workout_templates
workout_template_set_refs
workout_template_card_assignments
workout_sessions
workout_session_sets
workout_session_exercises
[all indexes]
[all updated_at triggers]
[WAL and FK pragmas via pool setup, not in migration]
```

### `migrations/002_fork_provenance.sql`

Adds `source_set_template_id TEXT` to `workout_template_set_refs`.
Records the original set template when a ref is forked via `clone_set_from_workout`.
No FK constraint — provenance only.

### `migrations/003_workout_local_sets.sql`

Adds `owning_workout_template_id TEXT REFERENCES workout_templates(id) ON DELETE CASCADE`
to `set_templates`.
Marks a set as workout-local (non-null) vs. global library (null).

### `migrations/004_exercise_performed_duration.sql`

Adds to `workout_session_exercises`:
- `paused_offset_sec INTEGER NOT NULL DEFAULT 0`
- `performed_duration_sec INTEGER`

Enables per-exercise active-time tracking.

### `migrations/005_rest_between_sets.sql`

Adds to `workout_session_sets`:
- `rest_duration_sec INTEGER`
- `rest_started_at TEXT`

Enables the between-set rest phase in the runner.

### `migrations/006_exercise_tags.sql`

Creates the `exercise_tags` table (see §3.2).

### `migrations/007_exercise_catalog_metadata.sql`

Adds catalog columns to `exercises` (`catalog_source`, `catalog_id`,
`is_catalog`, `category`, `equipment`, `level`, `mechanic`, `force`,
`instructions_json`) and creates the `exercise_muscles` table (see §3.3).
Also creates `uq_exercises_catalog` and the four catalog partial indexes.

### `migrations/008_exercise_pose_types.sql`

Creates the `exercise_pose_types` table (see §3.3a) and its two indexes
(`idx_exercise_pose_types_by_type`, `idx_exercise_pose_types_by_exercise`).
The CHECK constraint enforces the pose-type vocabulary at the DB layer.

### `migrations/009_exercise_sanskrit_name.sql`

Adds `sanskrit_name TEXT` (nullable) to `exercises`. No index — search uses
`LIKE '%query%'` which a normal index cannot accelerate. Empty/whitespace
input is normalized to `NULL` in the domain layer.

### Startup seed

At app startup, `seed_if_empty(pool, seed_json)` is called with
`src-tauri/seeds/default_library.json`. Seeding is applied **only** when
`exercises`, `set_templates`, and `workout_templates` are all empty.
Once any of those tables has at least one row the seed is never re-applied.
Session/history tables are not consulted for the emptiness check.

### Future migration naming

`010_add_column.sql`, etc. All v1 migrations are additive. SQLite does not
support `ALTER COLUMN` or `DROP CONSTRAINT`; constraint changes require
`CREATE TABLE … AS SELECT … DROP … RENAME` (the standard SQLite table-rebuild
pattern, handled in the migration file).

---

## 8. Rust Persistence Layer Structure

### Module layout

```
src-tauri/src/
├── db/
│   ├── mod.rs                # pool init, pragma setup, migration runner
│   ├── exercises.rs          # repository functions: SELECT/INSERT/UPDATE/DELETE,
│   │                         #   tags, muscles, pose types, catalog search,
│   │                         #   list_catalog_sources
│   ├── set_templates.rs
│   ├── workout_templates.rs  # includes set_refs and assignments
│   ├── sessions.rs           # all session + set + exercise row operations
│   ├── history.rs            # read-only history queries
│   └── stats.rs              # read-only stats aggregation queries
├── domain/
│   ├── mod.rs
│   ├── types.rs              # all row types, payload types, enum constant arrays
│   ├── exercise.rs           # service: create, update, delete-with-unlink, search
│   ├── set_template.rs       # service: CRUD, clone, reorder, fork export
│   ├── workout_template.rs   # service: CRUD, assignment upsert, clone_set_from_workout
│   ├── session.rs            # service: snapshot, all transitions, start_next_set
│   ├── library.rs            # service: export, import, clear, reset, seed
│   └── stats.rs              # service: get_stats with range filtering
└── tests/
    ├── mod.rs                # integration tests (sqlx::test — fresh in-memory DB each)
    ├── exercise_catalog.rs   # catalog-specific tests
    └── exercise_search.rs    # search filter tests
```

### Repository vs service boundary

**Repository functions** (`db/*.rs`) are plain async functions that take either
`&mut SqliteConnection` (for use inside a transaction) or `&SqlitePool` (for
standalone reads). They contain exactly one SQL statement each and do no
business logic.

```rust
// db/exercises.rs — example signatures
pub async fn find_all(pool: &SqlitePool) -> Result<Vec<ExerciseRow>, sqlx::Error>;
pub async fn find_by_id(conn: &mut SqliteConnection, id: &str) -> Result<Option<ExerciseRow>, sqlx::Error>;
pub async fn insert(conn: &mut SqliteConnection, id: &str, name: &str, notes: Option<&str>, meta: &ExerciseMeta) -> Result<ExerciseRow, sqlx::Error>;
pub async fn update(conn: &mut SqliteConnection, id: &str, name: &str, notes: Option<&str>) -> Result<ExerciseRow, sqlx::Error>;
pub async fn delete(conn: &mut SqliteConnection, id: &str) -> Result<(), sqlx::Error>;
pub async fn find_referencing_cards(conn: &mut SqliteConnection, exercise_id: &str) -> Result<Vec<ExerciseCardRef>, sqlx::Error>;
pub async fn set_tags(conn: &mut SqliteConnection, id: &str, tags: &[String]) -> Result<(), sqlx::Error>;
pub async fn set_muscles(conn: &mut SqliteConnection, id: &str, muscles: &[ExerciseMuscleInput]) -> Result<(), sqlx::Error>;
pub async fn set_pose_types(conn: &mut SqliteConnection, id: &str, pose_types: &[String]) -> Result<(), sqlx::Error>;
pub async fn search(pool: &SqlitePool, filters: &ExerciseSearchFilters, limit: i64, offset: i64) -> Result<(Vec<ExerciseRow>, i64), sqlx::Error>;
pub async fn list_catalog_sources(pool: &SqlitePool) -> Result<Vec<CatalogSourceSummary>, sqlx::Error>;
```

**Service functions** (`domain/*.rs`) open transactions and compose repository
calls. They own business rules and invariant enforcement.

```rust
// domain/exercise.rs — example signatures
pub async fn create(pool: &SqlitePool, name: &str, notes: Option<&str>, tags: &[String], meta: Option<&ExerciseMeta>, muscles: Option<&[ExerciseMuscleInput]>) -> Result<Exercise, AppError>;
pub async fn delete_with_unlink(pool: &SqlitePool, id: &str, confirmed: bool) -> Result<(), AppError>;
pub async fn search(pool: &SqlitePool, filters: &ExerciseSearchFilters) -> Result<ExerciseSearchResult, AppError>;
```

### Connection pooling

In `db/mod.rs`:

```rust
pub async fn init_pool(app_data_dir: &Path) -> Result<SqlitePool, sqlx::Error> {
    let db_path = app_data_dir.join("dzerkout.db");
    let url = format!("sqlite://{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .after_connect(|conn, _| Box::pin(async move {
            sqlx::query("PRAGMA foreign_keys = ON").execute(conn).await?;
            sqlx::query("PRAGMA journal_mode = WAL").execute(conn).await?;
            sqlx::query("PRAGMA synchronous = NORMAL").execute(conn).await?;
            Ok(())
        }))
        .connect(&url)
        .await?;

    sqlx::migrate!("migrations/").run(&pool).await?;
    Ok(pool)
}
```

Register the pool in `lib.rs` via `app.manage(pool)`. Retrieve in command
handlers via `tauri::State<SqlitePool>`.

The `after_connect` hook ensures FK enforcement and WAL mode apply to every
connection, not just the first.

### sqlx query style

Use `sqlx::query_as!` macros for compile-time query verification. Run
`cargo sqlx prepare` once to generate the `.sqlx/` offline-mode cache, commit
it, and set `SQLX_OFFLINE=true` in CI. This avoids requiring a running DB
during CI builds.

---

## 9. Transaction Design

### 9.1 Create exercise

```
Inputs:    name: &str, notes: Option<&str>, tags: &[String],
           meta: Option<&ExerciseMeta>, muscles: Option<&[ExerciseMuscleInput]>
Reads:     none
Writes (single transaction):
  INSERT exercises (new UUID generated in Rust)
  DELETE + INSERT exercise_tags (set_tags replaces wholesale)
  DELETE + INSERT exercise_muscles (set_muscles replaces wholesale)
Invariant: name uniqueness — sqlx surfaces UNIQUE constraint violation as
           AppError::Conflict.
           Catalog uniqueness — (catalog_source, catalog_id) must not already exist.
Rollback:  automatic on constraint violation
```

### 9.2 Update exercise

```
Inputs:    id, name, notes, tags, meta?, muscles?
Reads:     none (UPDATE returns rows affected)
Writes (single transaction):
  UPDATE exercises SET name=?, notes=?, updated_at=? WHERE id=?
  If meta provided: UPDATE exercises catalog columns
  DELETE + INSERT exercise_tags (replace wholesale)
  If muscles provided: DELETE + INSERT exercise_muscles (replace wholesale)
Invariant: UNIQUE on name — AppError::Conflict if duplicate
Rollback:  automatic
```

### 9.3 Delete/unlink exercise

```
Inputs:    id, confirmed: bool (must be true)
Reads:     exercises.name (for fallback labels)
Writes (single transaction):
  1. UPDATE set_template_cards → convert to placeholder
  2. UPDATE workout_template_card_assignments → null exercise_id, set display_label
  3. DELETE exercises WHERE id=?
     (SQLite automatically:
       SET NULL on workout_session_exercises.exercise_id
       CASCADE DELETE on exercise_tags and exercise_muscles)
Invariant: After steps 1–2 no RESTRICT FK references remain; step 3 succeeds.
           workout_session_exercises rows are untouched except the FK null.
Rollback:  Full rollback if any step fails.
```

### 9.4 Create/update set template

```
Reads:     none
Writes:    INSERT or UPDATE set_templates
           (card operations are separate commands / transactions)
Rollback:  automatic
```

### 9.5 Clone set template

```
Inputs:    source_id
Reads:     set_template + all its cards
Writes (single transaction):
  INSERT set_templates (new UUID, name = "<original> (copy)",
                        owning_workout_template_id = NULL — always global)
  For each card: INSERT set_template_cards (new UUID, same field values)
Invariant: Either all cards are inserted or none.
Rollback:  Full rollback.
```

### 9.6 Reorder cards / set refs

Applies to: `set_template_cards` (parent = `set_template_id`),
`workout_template_set_refs` (parent = `workout_template_id`), and any other
ordered child collection with a unique `(parent_id, order_index)` index.

Because SQLite evaluates unique constraints per statement (not deferred to
commit), a naive single-pass reorder fails whenever the target slot is still
occupied by another sibling row at the time of the UPDATE. The fix is a
two-phase reorder inside one transaction.

```
Inputs:    parent_id, ordered_ids: Vec<String>
           (ordered_ids is the full new desired order, 0-indexed)
Reads:     none
Writes (single transaction):
  Phase 1 — assign temporary offsets to avoid constraint collisions:
    For i, id in ordered_ids:
      UPDATE <table> SET order_index = 1000 + i WHERE id = ? AND parent_col = parent_id

  Phase 2 — assign final 0-based contiguous values:
    For i, id in ordered_ids:
      UPDATE <table> SET order_index = i WHERE id = ? AND parent_col = parent_id

Invariant: order_index values are 0-based contiguous after commit.
           The 1000-offset in phase 1 must exceed the maximum realistic
           collection size; 1000 is safe for v1 (no collection approaches
           that size). If a future migration allows larger collections,
           raise the offset or use negative temporaries instead.
Rollback:  Full rollback if any UPDATE misses a row (rows-affected check per UPDATE).
```

### 9.7 Delete set template

```
Inputs:    id
Reads:     COUNT of workout_template_set_refs referencing this id
Writes:    DELETE set_templates WHERE id=?
           (CASCADE removes all set_template_cards and any workout_template_card_assignments
            that reference those cards)
Invariant: RESTRICT on workout_template_set_refs.set_template_id prevents delete
           if any workout template still references it. Service checks first and
           returns AppError::Conflict with the referencing workout names.
Rollback:  automatic on RESTRICT violation.
```

### 9.8 Create/update workout template

```
Reads:     none
Writes:    INSERT or UPDATE workout_templates
Rollback:  automatic
```

### 9.9 Upsert card assignment

```
Inputs:    set_ref_id, card_id, exercise_id?, display_label?, duration_hint_sec?, notes?
Validation (service layer, before transaction):
  SELECT set_template_id FROM workout_template_set_refs WHERE id = :set_ref_id
  SELECT set_template_id FROM set_template_cards     WHERE id = :card_id
  Assert both rows exist AND the card's set_template_id matches the ref's
  set_template_id. If either row is missing or IDs differ →
  AppError::Validation("card does not belong to this set reference").
Reads:     none (mutation tx only; validation reads happen before tx opens)
Writes:
  INSERT INTO workout_template_card_assignments (...) VALUES (...)
  ON CONFLICT (workout_template_set_ref_id, set_template_card_id)
  DO UPDATE SET
    exercise_id       = excluded.exercise_id,
    display_label     = excluded.display_label,
    duration_hint_sec = excluded.duration_hint_sec,
    notes             = excluded.notes,
    updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
Rollback:  automatic
```

### 9.10 Create session snapshot (Phase 1 — draft)

```
Inputs:    workout_template_id
Reads:
  workout_templates (name, default_exercise_duration_sec)
  workout_template_set_refs ORDER BY order_index
  For each ref:
    set_templates (to check card count ≥ 1)
    set_template_cards ORDER BY order_index
    workout_template_card_assignments for this ref
    exercises (to resolve display names for concrete cards)

Writes (single transaction):
  INSERT workout_sessions (status='draft', started_at=NULL, session_date=NULL,
                           source_workout_template_name=template.name)
  For each set_ref WHERE COUNT(cards) > 0:
    INSERT workout_session_sets (order_index, source_set_template_id)
    For each card in order:
      resolved = {
        exercise_id:      assignment.exercise_id ?? card.exercise_id
        display_name:     assignment.display_label
                          ?? exercise.name
                          ?? card.placeholder_label
                          ?? card.placeholder_tag
        duration_hint_sec: assignment.duration_hint_sec
                           ?? card.duration_hint_sec
                           ?? template.default_exercise_duration_sec
        notes:            assignment.notes ?? card.notes ?? NULL
        placeholder_tag:  card.placeholder_tag  (preserved, NULL for concrete)
        status:           'pending'
        skipped:          0
        paused_offset_sec: 0
        performed_duration_sec: NULL
      }
      INSERT workout_session_exercises (resolved fields)

Returns: full ActiveSessionPayload
Invariant: Either complete session is created or nothing. Partial sessions
           cannot exist.
Rollback: Full rollback on any failure.
```

**Startability pre-check (in service, before transaction):**
```sql
SELECT COUNT(*) FROM workout_template_set_refs wtsr
JOIN set_template_cards stc ON stc.set_template_id = wtsr.set_template_id
WHERE wtsr.workout_template_id = ?
```
If count = 0 → `AppError::Validation("no cards")` before transaction opens.

### 9.11 Start session (Phase 2)

```
Inputs:    session_id
Reads:
  workout_sessions WHERE id=? AND status='draft'
  workout_session_sets WHERE workout_session_id=? ORDER BY order_index LIMIT 1
  workout_session_exercises WHERE workout_session_set_id=first_set_id
                              ORDER BY order_index LIMIT 1

Writes (single transaction):
  UPDATE workout_sessions
    SET status='in_progress',
        started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        session_date = strftime('%Y-%m-%d', 'now')
    WHERE id=?

  UPDATE workout_session_sets
    SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = first_set_id

  UPDATE workout_session_exercises
    SET status='active',
        started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = first_exercise_id

Returns: full ActiveSessionPayload
Invariant: Only one exercise is 'active'. Status must be 'draft' before; 'in_progress' after.
```

### 9.12 Pause session

```
Inputs:    session_id, set_id
Reads:     workout_session_sets (verify paused_at IS NULL, started_at IS NOT NULL)
Writes:
  UPDATE workout_session_sets
    SET paused_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = set_id
      AND paused_at IS NULL        -- idempotency guard
Returns: full ActiveSessionPayload
Invariant: Set must be active (started_at non-null) and not already paused.
```

### 9.13 Resume session

```
Inputs:    session_id, set_id
Reads:     workout_session_sets (verify paused_at IS NOT NULL)
Writes (single statement — atomically accumulates paused time):
  UPDATE workout_session_sets
    SET paused_total_sec = paused_total_sec
                         + (unixepoch('now') - unixepoch(paused_at)),
        paused_at = NULL
    WHERE id = set_id
      AND paused_at IS NOT NULL    -- idempotency guard
Returns: full ActiveSessionPayload
Invariant: paused_at is read and cleared atomically in one UPDATE; no race.
```

### 9.14 Advance exercise (Next)

```
Inputs:    session_id
Reads:
  current active exercise + its set (JOIN on status='active')
  next exercise: same set, order_index = current.order_index + 1
                 if none: first exercise in next set (order_index + 1)

Pre-condition: if current set has paused_at IS NOT NULL → inline resume (9.13)

Writes (single transaction, same-set case):
  UPDATE wse SET status='completed', ended_at=now,
                 performed_duration_sec=computed WHERE id=current_exercise_id
  UPDATE wse SET status='active', started_at=now,
                 paused_offset_sec=current_set.paused_total_sec
    WHERE id=next_exercise_id

Writes (single transaction, cross-set case — no rest configured):
  UPDATE wse SET status='completed', ended_at=now, performed_duration_sec=computed
    WHERE id=current_exercise_id
  UPDATE wss SET ended_at=now WHERE id=current_set_id
  UPDATE wss SET started_at=now, paused_total_sec=0, paused_at=NULL
    WHERE id=next_set_id
  UPDATE wse SET status='active', started_at=now, paused_offset_sec=0
    WHERE id=next_exercise_id

Writes (single transaction, cross-set case — rest configured):
  UPDATE wse SET status='completed', ended_at=now, performed_duration_sec=computed
    WHERE id=current_exercise_id
  UPDATE wss SET ended_at=now WHERE id=current_set_id
  UPDATE wss SET rest_duration_sec=rest_sec, rest_started_at=now
    WHERE id=next_set_id
  -- next set is NOT started; no exercise is activated yet

Returns: full ActiveSessionPayload
  When rest is entered: rest_phase IS NOT NULL, current_exercise_id IS NULL.
  Frontend shows rest countdown and calls start_next_set (§9.21) when ready.

Invariant: Exactly one 'active' exercise after commit (same-set or no-rest cross-set).
           During rest phase, no exercise is active; rest_phase field signals the state.
Edge: If next_exercise is NULL (last exercise was current) →
      service returns AppError::Validation("no next exercise — call finish_session").
```

### 9.15 Retreat exercise (Prev)

```
Inputs:    session_id
Reads:
  current active exercise + its set (or rest-phase set if no active exercise)
  previous exercise: same set, order_index = current.order_index - 1
                     if none: last exercise in prev set

Case A — normal (active exercise exists, same-set):
Writes (single transaction):
  UPDATE wse SET started_at=NULL, ended_at=NULL, status='pending',
                 performed_duration_sec=NULL WHERE id=current_exercise_id
  UPDATE wse SET ended_at=NULL, started_at=now, status='active'
    WHERE id=prev_exercise_id
  -- set timing unchanged; paused state carries over

Case B — normal (active exercise exists, cross-set):
Writes (single transaction):
  UPDATE wse SET started_at=NULL, ended_at=NULL, status='pending',
                 performed_duration_sec=NULL WHERE id=current_exercise_id
  UPDATE wss SET started_at=NULL, ended_at=NULL, paused_at=NULL, paused_total_sec=0
    WHERE id=current_set_id
  UPDATE wss SET ended_at=NULL, started_at=now, paused_at=NULL, paused_total_sec=0
    WHERE id=prev_set_id
  UPDATE wse SET ended_at=NULL, started_at=now, status='active'
    WHERE id=prev_last_exercise_id

Case C — rest phase (no active exercise; a set has rest_started_at IS NOT NULL):
Reads:  set in rest (rest_started_at IS NOT NULL AND started_at IS NULL)
        previous set (order_index < rest_set.order_index)
Writes (single transaction):
  UPDATE wss SET rest_duration_sec=NULL, rest_started_at=NULL WHERE id=rest_set_id
  UPDATE wss SET ended_at=NULL, started_at=now, paused_at=NULL, paused_total_sec=0
    WHERE id=prev_set_id
  UPDATE wse SET ended_at=NULL, started_at=now, status='active'
    WHERE id=prev_last_exercise_id

Returns: full ActiveSessionPayload
Invariant: All time information for affected rows is fully reset; no residue
           from the cancelled forward move.
Edge: If current exercise is the first exercise of the first set, or rest phase
      has no previous set → AppError::Validation("already at first exercise").
```

### 9.16 Skip exercise

```
Inputs:    session_id, exercise_id
Pre-condition: if current set paused → inline resume (9.13)
Writes: Inline resume if needed, then:
  UPDATE wse SET skipped=1, status='skipped', ended_at=now,
                 performed_duration_sec=computed WHERE id=exercise_id
  Then same advance logic as 9.14 (find next exercise, write transitions)
  EXCEPTION: skip always bypasses rest — even when rest_between_sets_sec > 0,
             skip uses start_fresh_set directly (no rest phase entered).
Returns: full ActiveSessionPayload
Invariant: skipped=1 and status='skipped' always set together; record never deleted.
```

### 9.17 Finish session

```
Inputs:    session_id
Pre-condition: if current set paused → inline resume (9.13)
Reads:     current active exercise and its set (may be None if last was skipped)
Writes (single transaction):
  UPDATE wse SET ended_at=now WHERE id=current_exercise_id AND ended_at IS NULL
  UPDATE wss SET ended_at=now WHERE id=current_set_id AND ended_at IS NULL
  UPDATE workout_sessions SET status='completed', ended_at=now WHERE id=session_id
Returns: WorkoutSession row
Side effect: frontend invalidates ['session-history'] TanStack Query cache.
```

### 9.18 Abandon session

```
Inputs:    session_id
Writes:
  UPDATE workout_sessions
    SET status='abandoned', ended_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id=session_id
Notes: Child rows are NOT deleted; the session is soft-excluded from history
       by its status. No cascade needed.
Returns: ()
```

### 9.19 Discard session

```
Inputs:    session_id
Writes:
  DELETE FROM workout_sessions WHERE id=session_id
  -- CASCADE removes all workout_session_sets and workout_session_exercises
Returns: ()
Use case: User discards a draft or in-progress session at recovery prompt.
```

### 9.20 Resume/recover session on app launch

```
Reads:
  SELECT * FROM workout_sessions WHERE status IN ('draft','in_progress') LIMIT 1
  If found: full session load (same as load_active_session)
Returns: Option<ActiveSessionPayload>
No writes; the caller decides to continue/discard based on user choice.
```

### 9.21 Start next set (end rest → begin next set)

```
Inputs:    session_id
Reads:     set in rest (rest_started_at IS NOT NULL AND started_at IS NULL)
           first exercise in that set

Writes (single transaction):
  UPDATE wss SET rest_duration_sec=NULL, rest_started_at=NULL WHERE id=rest_set_id
  UPDATE wss SET started_at=now, paused_total_sec=0, paused_at=NULL
    WHERE id=rest_set_id
  UPDATE wse SET status='active', started_at=now, paused_offset_sec=0
    WHERE id=first_exercise_id

Returns: full ActiveSessionPayload (rest_phase IS NULL, exercise now active)
Error:   AppError::Validation if no rest phase is currently active.
Use case: User manually ends the rest countdown and starts the next set.
```

---

## 10. `ActiveSessionPayload` Contract

```rust
/// Returned by every session mutation command that keeps the runner active
/// (create_draft, start, pause, resume, advance, retreat, skip, start_next_set).
/// Terminal operations (finish, abandon, discard) do not return this type;
/// see §9.17–9.19 for their respective return shapes.
/// Contains full authoritative state for Zustand to load.
#[derive(Debug, serde::Serialize)]
pub struct ActiveSessionPayload {
    pub session:             WorkoutSessionRow,
    pub sets:                Vec<WorkoutSessionSetRow>,
    pub exercises:           Vec<WorkoutSessionExerciseRow>,
    /// Id of the currently active exercise (status = 'active'), if any.
    /// None during a rest phase or after the last exercise is skipped.
    pub current_exercise_id: Option<String>,
    /// Id of the set that contains the current exercise.
    pub current_set_id:      Option<String>,
    /// Timer base values extracted from the current set,
    /// ready for direct use by the Zustand timer.
    pub timer_base:          TimerBase,
    /// Non-null when the runner is in a between-set rest phase
    /// (rest_started_at IS NOT NULL AND started_at IS NULL on a set).
    /// While non-null, current_exercise_id is None.
    pub rest_phase:          Option<RestPhaseInfo>,
    /// Configured rest-between-sets duration from the workout template.
    /// None when the session has no template or the template has no rest configured.
    /// Used by the runner to preview upcoming rest in the exercise queue.
    pub rest_between_sets_sec: Option<i64>,
}

/// Extracted from the current WorkoutSessionSet.
/// All values are PERSISTED fields; the frontend derives
/// displayed elapsed time from them + Date.now().
#[derive(Debug, serde::Serialize)]
pub struct TimerBase {
    /// Unix ms from the set's started_at TEXT field.
    /// None for draft sessions (set not yet started).
    pub set_started_at_ms:  Option<i64>,
    /// Accumulated paused seconds for this set.
    pub paused_total_sec:   i64,
    /// Unix ms from paused_at; Some = currently paused, None = running.
    pub paused_at_ms:       Option<i64>,
}

/// Present in ActiveSessionPayload when the runner is in a between-set rest phase.
#[derive(Debug, serde::Serialize)]
pub struct RestPhaseInfo {
    /// workout_session_sets.id of the set waiting to start.
    pub next_set_id:        String,
    /// Configured rest duration in seconds (copied from template at set-end).
    pub rest_duration_sec:  i64,
    /// Unix timestamp (milliseconds) of when rest began.
    pub rest_started_at_ms: i64,
}
```

**Frontend derivation (from Zustand):**
```typescript
// While active:
elapsed_ms = Date.now() - timer_base.set_started_at_ms
           - timer_base.paused_total_sec * 1000

// While paused:
elapsed_ms = timer_base.paused_at_ms - timer_base.set_started_at_ms
           - timer_base.paused_total_sec * 1000
```

All three `TimerBase` fields are **persisted** in `workout_session_sets`. The
frontend never accumulates time independently; it always re-derives from the
DB-sourced base values loaded into Zustand.

Auto-advance settings (whether to auto-advance to the next exercise when a
timer expires) are **frontend/local settings**, not persisted in the DB.

---

## 11. Query Catalog

### Exercises

```sql
-- list
SELECT id, name, sanskrit_name, notes, image_url,
       catalog_source, catalog_id, is_catalog,
       category, equipment, level, mechanic, force, instructions_json,
       created_at, updated_at
FROM exercises ORDER BY name;

-- get by id
SELECT id, name, sanskrit_name, notes, image_url,
       catalog_source, catalog_id, is_catalog,
       category, equipment, level, mechanic, force, instructions_json,
       created_at, updated_at
FROM exercises WHERE id = ?;

-- search (dynamic WHERE clauses built in Rust)
-- Notes:
--  * Free-text query matches name OR sanskrit_name.
--  * :source is the broad library filter ('all' | 'user' | 'catalog'); 'all' = no clause.
--  * :catalog_source is the specific catalog source (e.g. 'free-exercise-db', 'yoga-poses').
--    Combining :source = 'user' with a non-null :catalog_source is rejected by the service.
--  * :pose_type filters via JOIN on exercise_pose_types.
--  * Pagination is required (limit + offset). Total count is returned alongside.
SELECT e.*, COUNT(*) OVER() AS total_count
FROM exercises e
WHERE (:query IS NULL
       OR e.name          LIKE '%' || :query || '%'
       OR e.sanskrit_name LIKE '%' || :query || '%')
  AND (:source = 'catalog' AND e.is_catalog = 1
       OR :source = 'user' AND e.is_catalog = 0
       OR :source IS NULL)
  AND (:catalog_source IS NULL OR e.catalog_source = :catalog_source)
  AND (:category   IS NULL OR e.category   = :category)
  AND (:equipment  IS NULL OR e.equipment  = :equipment)
  AND (:level      IS NULL OR e.level      = :level)
  AND (:force      IS NULL OR e.force      = :force)
  AND (:pose_type IS NULL OR EXISTS (
         SELECT 1 FROM exercise_pose_types ept
         WHERE ept.exercise_id = e.id AND ept.pose_type = :pose_type))
  -- additional filters: primary_muscle (via JOIN exercise_muscles), tag (via JOIN exercise_tags)
ORDER BY e.name
LIMIT :limit OFFSET :offset;

-- list distinct catalog sources with row counts (drives the Source filter)
SELECT catalog_source AS source, COUNT(*) AS count
FROM exercises
WHERE catalog_source IS NOT NULL
GROUP BY catalog_source
ORDER BY catalog_source;

-- check name availability
SELECT id FROM exercises WHERE name = ? AND id != ?;

-- find cards referencing exercise (for deletion warning)
SELECT stc.id, st.name AS set_name
FROM set_template_cards stc
JOIN set_templates st ON st.id = stc.set_template_id
WHERE stc.exercise_id = ?;

-- insert
INSERT INTO exercises (id, name, sanskrit_name, notes, image_url,
                       catalog_source, catalog_id, is_catalog,
                       category, equipment, level, mechanic, force, instructions_json,
                       created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- update
UPDATE exercises SET name=?, sanskrit_name=?, notes=?, updated_at=? WHERE id=?;

-- replace pose types for an exercise (DELETE + INSERT inside a transaction)
DELETE FROM exercise_pose_types WHERE exercise_id = ?;
INSERT INTO exercise_pose_types (exercise_id, pose_type) VALUES (?, ?);  -- per pose type

-- delete (see §5 for safe transaction sequence)
DELETE FROM exercises WHERE id=?;
```

### Set Templates

```sql
-- list with card count
SELECT st.id, st.name, st.notes, st.owning_workout_template_id,
       st.created_at, st.updated_at,
       COUNT(stc.id) AS card_count
FROM set_templates st
LEFT JOIN set_template_cards stc ON stc.set_template_id = st.id
GROUP BY st.id ORDER BY st.name;

-- get cards for a set
SELECT id, set_template_id, card_type, order_index, duration_hint_sec,
       notes, exercise_id, placeholder_tag, placeholder_label
FROM set_template_cards
WHERE set_template_id = ?
ORDER BY order_index;

-- reorder cards (executed per card in a transaction)
UPDATE set_template_cards SET order_index=?, updated_at=? WHERE id=?;

-- check if set is referenced by any workout template
SELECT COUNT(*) FROM workout_template_set_refs WHERE set_template_id = ?;
```

### Workout Templates

```sql
-- list with set count and estimated duration
SELECT wt.id, wt.name, wt.notes,
       wt.default_exercise_duration_sec, wt.rest_between_sets_sec,
       COUNT(DISTINCT wtsr.id) AS set_count,
       -- estimated duration (computed in Rust, not SQL)
       wt.created_at, wt.updated_at
FROM workout_templates wt
LEFT JOIN workout_template_set_refs wtsr ON wtsr.workout_template_id = wt.id
GROUP BY wt.id ORDER BY wt.name;

-- full workout template load (for editor)
SELECT wt.*, wtsr.id AS ref_id, wtsr.set_template_id, wtsr.order_index AS ref_order,
       wtsr.source_set_template_id,
       st.name AS set_name
FROM workout_templates wt
LEFT JOIN workout_template_set_refs wtsr ON wtsr.workout_template_id = wt.id
LEFT JOIN set_templates st ON st.id = wtsr.set_template_id
WHERE wt.id = ?
ORDER BY wtsr.order_index;

-- count total cards for startability check
SELECT COUNT(stc.id)
FROM workout_template_set_refs wtsr
JOIN set_template_cards stc ON stc.set_template_id = wtsr.set_template_id
WHERE wtsr.workout_template_id = ?;
```

### Assignments

```sql
-- load all assignments for a workout template (for snapshot + display)
SELECT wtca.*
FROM workout_template_card_assignments wtca
JOIN workout_template_set_refs wtsr ON wtsr.id = wtca.workout_template_set_ref_id
WHERE wtsr.workout_template_id = ?;

-- upsert (see §9.9)
INSERT INTO workout_template_card_assignments
    (id, workout_template_set_ref_id, set_template_card_id,
     exercise_id, display_label, duration_hint_sec, notes, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (workout_template_set_ref_id, set_template_card_id)
DO UPDATE SET exercise_id=excluded.exercise_id,
             display_label=excluded.display_label,
             duration_hint_sec=excluded.duration_hint_sec,
             notes=excluded.notes,
             updated_at=excluded.updated_at;
```

### Active Session

```sql
-- check for existing session on app launch
SELECT id, status FROM workout_sessions
WHERE status IN ('draft', 'in_progress')
LIMIT 1;

-- load full session (session + sets + exercises)
SELECT s.*, ss.id AS set_id, ss.order_index AS set_order,
       ss.started_at AS set_started_at, ss.ended_at AS set_ended_at,
       ss.paused_total_sec, ss.paused_at,
       ss.source_set_template_id,
       ss.rest_duration_sec, ss.rest_started_at,
       se.id AS ex_id, se.order_index AS ex_order, se.display_name,
       se.status AS ex_status, se.skipped,
       se.exercise_id, se.placeholder_tag, se.duration_hint_sec,
       se.started_at AS ex_started_at, se.ended_at AS ex_ended_at,
       se.notes AS ex_notes,
       se.paused_offset_sec, se.performed_duration_sec
FROM workout_sessions s
JOIN workout_session_sets ss ON ss.workout_session_id = s.id
JOIN workout_session_exercises se ON se.workout_session_set_id = ss.id
WHERE s.id = ?
ORDER BY ss.order_index, se.order_index;

-- find current active exercise
SELECT se.id, se.workout_session_set_id, se.order_index
FROM workout_session_exercises se
JOIN workout_session_sets ss ON ss.id = se.workout_session_set_id
WHERE ss.workout_session_id = ? AND se.status = 'active'
LIMIT 1;

-- find set in rest phase
SELECT id, order_index, rest_duration_sec, rest_started_at
FROM workout_session_sets
WHERE workout_session_id = ?
  AND rest_started_at IS NOT NULL
  AND started_at IS NULL
LIMIT 1;

-- find next exercise (same set)
SELECT id FROM workout_session_exercises
WHERE workout_session_set_id = ? AND order_index > ?
ORDER BY order_index LIMIT 1;

-- find next set
SELECT id FROM workout_session_sets
WHERE workout_session_id = ? AND order_index > ?
ORDER BY order_index LIMIT 1;

-- pause / resume (see §9.12, §9.13)
UPDATE workout_session_sets SET paused_at=? WHERE id=? AND paused_at IS NULL;

UPDATE workout_session_sets
SET paused_total_sec = paused_total_sec + (unixepoch('now') - unixepoch(paused_at)),
    paused_at = NULL
WHERE id=? AND paused_at IS NOT NULL;
```

### History

```sql
-- list (completed sessions only, most recent first)
SELECT id, source_workout_template_name, session_date,
       started_at, ended_at, notes,
       -- totals computed in Rust from child row counts
       (SELECT COUNT(*) FROM workout_session_sets WHERE workout_session_id = ws.id)
           AS set_count,
       (SELECT COUNT(*) FROM workout_session_exercises wse
        JOIN workout_session_sets wss ON wss.id = wse.workout_session_set_id
        WHERE wss.workout_session_id = ws.id) AS exercise_count
FROM workout_sessions ws
WHERE status = 'completed'
ORDER BY session_date DESC, started_at DESC;

-- detail (same join as active session load, above)
-- add skipped filter for summary if needed:
SELECT * FROM workout_session_exercises wse
JOIN workout_session_sets wss ON wss.id = wse.workout_session_set_id
WHERE wss.workout_session_id = ?
ORDER BY wss.order_index, wse.order_index;
```

### Stats

Stats are derived from completed sessions. Two important behavioral notes:

**Tag stats use current exercise_tags, not historical.**
`fetch_tag_stats` JOINs `exercise_tags et ON et.exercise_id = wse.exercise_id`.
If an exercise's tags are changed after a session, historical tag-stat breakdowns
change retroactively. Exercises that were never retagged are unaffected.

**Deleted exercises still appear in exercise stats.**
`fetch_exercise_stats` groups by `COALESCE(wse.exercise_id, 'name::' || wse.display_name)`.
Deleted exercises (where `wse.exercise_id IS NULL`) are bucketed by their
denormalized `display_name`, preserving their leaderboard entry.

---

## 12. Testing Plan

### Migration tests

```rust
#[sqlx::test(migrations = "migrations")]
async fn test_schema_applies_cleanly(pool: SqlitePool) {
    // verify all tables exist and FK pragmas are applied
    let count: (i32,) = sqlx::query_as("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
        .fetch_one(&pool).await.unwrap();
    assert!(count.0 >= 12);  // 9 core tables + exercise_tags + exercise_muscles + exercise_pose_types
}
```

### Highest-risk transactions — test first

**1. Session snapshot with mixed empty/non-empty sets**
```
Setup:  workout template with 3 set refs: empty set, 2-card set, 3-card set
Assert: only 2 WorkoutSessionSets created (5 exercises total)
        display_name follows fallback chain correctly for all card types
```

**2. Snapshot fallback chain — all combinations**
```
Cases:
  - concrete card, no assignment → exercise.name
  - concrete card, assignment with display_label → assignment.display_label
  - placeholder card, no assignment → card.placeholder_label ?? card.placeholder_tag
  - placeholder card, assignment with exercise_id → exercise.name
  - placeholder card, assignment with display_label + exercise_id → assignment.display_label
  - duration_hint_sec: assignment overrides card, card overrides template default
  - notes: assignment overrides card, card may be null
```

**3. Corrective Prev — within-set**
```
Setup:  session in_progress, advance to exercise 2 in set 1
Action: retreat_exercise
Assert: exercise 1 has started_at = ~now, ended_at = NULL, status='active'
        exercise 2 has started_at = NULL, ended_at = NULL, status='pending'
        set 1 started_at UNCHANGED, paused_at UNCHANGED
```

**4. Corrective Prev — cross-set boundary**
```
Setup:  session in_progress, advance through all of set 1 into set 2
Action: retreat_exercise (from first exercise of set 2)
Assert: set 2 has started_at=NULL, ended_at=NULL, paused_at=NULL, paused_total_sec=0
        set 1 has ended_at=NULL, started_at=~now, paused_at=NULL, paused_total_sec=0
        last exercise of set 1 is active with fresh started_at
```

**5. Pause / resume round-trip with accumulated paused_total_sec**
```
Setup:  start session, let ~1s pass, pause
        mock unixepoch values or use real sleep
        let 5s pass while paused, resume
        let ~1s pass, pause again, resume
Assert: paused_total_sec ≈ 5 (first pause only)
        elapsed_display formula produces correct active-time value
```

**6. Pause then Prev (cross-set) — paused state cleared**
```
Setup:  start session, advance to set 2, pause set 2
Action: retreat_exercise (cross-set)
Assert: set 2 paused_at=NULL, paused_total_sec=0
        set 1 paused_at=NULL, paused_total_sec=0, started_at=~now
```

**7. Exercise deletion — all three reference types**
```
Setup:  exercise E
        set template card (concrete) referencing E
        workout template assignment referencing E (with and without display_label)
        completed session exercise referencing E
Action: delete_with_unlink(E.id, confirmed=true)
Assert: set_template_cards: card_type='placeholder', exercise_id=NULL,
        placeholder_tag='unspecified', placeholder_label=E.name
        workout_template_card_assignments: exercise_id=NULL,
        display_label = existing label OR E.name if was null
        workout_session_exercises: exercise_id=NULL, display_name UNCHANGED
        exercise_tags: all rows for E deleted (CASCADE)
        exercise_muscles: all rows for E deleted (CASCADE)
        exercises table: E deleted
```

**8. Placeholder-only workout startability**
```
Setup:  workout template with one set ref containing only placeholder cards
Action: create_session_draft
Assert: succeeds (count ≥ 1 placeholder cards passes gate)
        WorkoutSessionExercise created with exercise_id=NULL, placeholder_tag set
```

**9. Skip persistence**
```
Action: skip_exercise during in_progress session
Assert: exercise row has skipped=1, status='skipped', ended_at IS NOT NULL
        exercise row still exists (never deleted)
        next exercise becomes active
        no rest phase entered (skip always bypasses rest)
```

**10. Finish session closes all open rows**
```
Action: finish_session
Assert: WorkoutSession.status='completed', ended_at IS NOT NULL
        Current WorkoutSessionSet.ended_at IS NOT NULL
        Current WorkoutSessionExercise.ended_at IS NOT NULL
```

**11. Exercise deletion with SET NULL on session exercises**
```
Verify ON DELETE SET NULL is active:
  PRAGMA foreign_key_list('workout_session_exercises')
  → action = 'SET NULL' for exercise_id FK
```

**12. UNIQUE constraint on workout_template_card_assignments**
```
Assert: second upsert for same (set_ref_id, card_id) updates the row, not inserts
```

**13. Reorder does not violate unique order index mid-transaction**
```
Setup:  set template with 3 cards at order_index 0, 1, 2
Action: reorder_cards([card_2_id, card_0_id, card_1_id])
        (new desired order: 2→0, 0→1, 1→2 — every row shifts; maximum collision risk)
Assert: transaction commits without UNIQUE constraint error
        resulting order_index values are 0, 1, 2 for the new sequence
        no partial update (all three rows updated or none)
```

**14. Rest phase — advance enters rest, start_next_set exits it**
```
Setup:  workout template with rest_between_sets_sec = 30, two sets with 1 card each
Action: start session, advance through first exercise
Assert: payload.rest_phase IS NOT NULL
        payload.current_exercise_id IS NULL
        next set has rest_started_at IS NOT NULL, started_at IS NULL
Action: start_next_set
Assert: payload.rest_phase IS NULL
        payload.current_exercise_id IS NOT NULL (first exercise of set 2)
        next set has started_at IS NOT NULL, rest_started_at IS NULL
```

**15. Retreat from rest phase**
```
Setup:  advance into rest phase as in test 14
Action: retreat_exercise
Assert: rest set has rest_duration_sec=NULL, rest_started_at=NULL
        prev set has ended_at=NULL, started_at IS NOT NULL
        last exercise of prev set is active
```

---

## 13. Risks and Edge Cases

| Risk | Severity | Resolution |
|---|---|---|
| `PRAGMA foreign_keys = ON` forgotten on a connection | High | Enforced in `after_connect` pool hook, not just at startup |
| Partial session snapshot (INSERT fails mid-transaction) | High | Entire create_session_draft in one `sqlx::Transaction`; no partial rows |
| Pause accumulation race (two Resumes for same paused_at) | Low | `WHERE paused_at IS NOT NULL` guard; second Resume is a no-op |
| CHECK constraint blocking exercise-to-placeholder conversion mid-transaction | Medium | Conversion UPDATE runs in same tx before DELETE; FK check evaluates after the UPDATE, which already satisfies the CHECK |
| SQLite `ON DELETE SET NULL` inactive if FK pragma not on | High | Pool `after_connect` + startup assertion: `PRAGMA foreign_keys` returns 1 |
| `order_index` gaps after card deletion | Low | Reorder is explicit (separate command); gaps are valid; contiguous re-index happens only on explicit reorder |
| `session_date` null in a draft exposed to history | Low | History query filters `WHERE status = 'completed'`; draft sessions never appear |
| Very large session load payload for workouts with many exercises | Negligible | Single-user SQLite; 100-exercise session ≈ 10 KB |
| `unixepoch()` resolution is 1 second in SQLite | Low | Pause arithmetic in seconds matches `paused_total_sec` type; sub-second timer precision comes from `Date.now()` on the frontend |
| `sqlx::query!` offline mode cache out of date in CI | Low | Commit `.sqlx/` directory; CI uses `SQLX_OFFLINE=true` |
| `source_set_template_id` on set_ref becomes stale if original set deleted | Low | No FK constraint; field is badge-display only; stale value causes no integrity error |
| Tag stats retroactively change when exercise is retagged | Low | Documented behavior; tag join uses current `exercise_tags` by design |
| Startup seed re-applied after clear_local_data + restart | None | `seed_if_empty` gates on all three template tables being empty; seed fires correctly after a clear |

---

## 14. Library Management (Import / Export / Clear / Reset / Seed)

### Export

`export_full_library` serialises the entire DB into a single JSON document:

```json
{
  "schema": "dzerkout.library",
  "version": 1,
  "exported_at": "...",
  "exercises": [...],       // includes tags, muscles, pose_types, sanskrit_name, catalog metadata
  "set_templates": [...],   // includes owning_workout_template_id and cards
  "workout_templates": [...],// includes rest_between_sets_sec, set_refs with
                             //   source_set_template_id and assignments
  "sessions": [...],
  "session_sets": [...],    // includes rest_duration_sec, rest_started_at
  "session_exercises": [...] // includes paused_offset_sec, performed_duration_sec
}
```

Export is exposed as the `export_library_json` Tauri command and returns the
JSON string to the frontend (for clipboard/file save). No scope filtering —
there is no per-entity export; the export always includes everything.

### Import

`import_library_json` is **upsert-based and idempotent**:
- Re-importing the same export produces the same result.
- Exercises, sets, and workouts are upserted by `id` (`ON CONFLICT(id) DO UPDATE`).
- Tags, muscles, and pose types are replaced wholesale (DELETE then INSERT) per exercise.
- `sanskrit_name` is upserted as part of the exercise row.
- Cards and set_refs use the two-phase upsert to avoid transient UNIQUE violations.
- Sessions are upserted by `id`; session_sets and session_exercises follow.
- All writes happen in a single transaction; failure rolls back completely.

**Validation before write (in-memory + DB-side):**
- Exercise tags, pose types, catalog metadata enum values, instructions_json format.
- Card type invariants (`concrete` requires `exercise_id`, `placeholder` requires `placeholder_tag`).
- Assignment cross-set integrity (card must belong to the set the ref points to).
- FK references: concrete card `exercise_id` must exist in import payload or DB;
  set_ref `set_template_id` must exist in import payload or DB.

Import is exposed as the `import_library_json` Tauri command.

**Write order (FK-safe):**
```
exercises → workout template headers → set templates
→ set template cards (two-phase) → set refs (two-phase) → assignments
→ sessions → session_sets → session_exercises
```

### Clear

`clear_local_data` deletes all domain data in FK-safe order within a single
transaction, leaving the DB **empty**. It does not re-seed.

```
session_exercises → session_sets → sessions
→ assignments → set_refs → set_template_cards → set_templates
→ exercise_pose_types → exercise_muscles → exercise_tags
→ exercises → workout_templates
```

Note: the `exercise_*` child tables all have `ON DELETE CASCADE` from
`exercises`, so deleting the parent rows alone is sufficient. The explicit
deletes above are listed for clarity in import-test fixtures and to make the
order easy to audit.

Exposed as the `clear_local_data` Tauri command.

### Reset

`reset_local_data_with_seed` calls `clear_local_data` then immediately
`seed_if_empty`. Because the DB is now empty, the seed always fires.
Exposed as the `reset_local_data` Tauri command.

### Startup seed

At every app launch, `seed_if_empty(pool, seed_json)` is called with
`include_str!("../seeds/default_library.json")`.

Seed is applied **only if** `exercises`, `set_templates`, and `workout_templates`
are all empty (checked with `SELECT id … LIMIT 1` on each table). Session/history
tables are not consulted.

Once any template table has a row, seeding is permanently skipped until the next
`clear_local_data`. The seed file is baked into the binary at compile time via
`include_str!`.

---

## 15. Generated Catalog Tooling

Two Node.js scripts convert vendor datasets into `dzerkout.library` JSON for
manual review and optional import:

### `scripts/generate-free-exercise-db-library.mjs`

- **Source:** `vendor/free-exercise-db/dist/exercises.json`
- **Output:** `scripts/generated/free-exercise-db-library.json` (default)
- Converts free-exercise-db entries to `ExportedExercise` format with catalog
  metadata (`catalog_source = "free-exercise-db"`, `is_catalog = true`),
  muscles, and derived tags.
- Supports `--include-category`, `--exclude-category`, `--max`, `--output` flags.
- Excludes `strongman` and `olympic weightlifting` by default.

### `scripts/generate-yoga-poses-library.mjs`

- **Source:** `vendor/yoga/yoga_poses.json`
- **Output:** `scripts/generated/yoga-poses-library.json` (default)
- Converts yoga poses to `ExportedExercise` format with `catalog_source = "yoga-poses"`,
  `is_catalog = true`, `category = "yoga"`.
- `image_url` is always `null` (photo URLs point at third-party CDN).
- Emits `sanskrit_name` as a structured field (no longer folded into `notes`).
- Emits `pose_types` as a structured array of normalized DB enum values
  (e.g. `"Standing"` → `"standing"`, `"Forward Bend"` → `"forward_bend"`).
- The free-exercise-db generator emits `sanskrit_name: null` and `pose_types: []`
  so both catalogs share the same export shape.
- Supports `--max` and `--output` flags.

### Key constraints

- The `scripts/generated/` directory is **not committed** to the repository.
- Generated files are **not automatically seeded** — a developer must manually
  import them via the `import_library_json` command or merge them into
  `seeds/default_library.json`.
- IDs are deterministic UUID v5 values derived from `(catalog_source, catalog_id)`,
  ensuring re-running the generator produces the same IDs (import is idempotent).
- Each generator declares its own `CATALOG = { source, label, duplicateSuffix }`
  config block. `duplicateSuffix` is appended in parens to the **display name only**
  on cross-catalog name collisions (current real collision: `Child's Pose` →
  `Child's Pose (Yoga)`). UUID `id` and `catalog_id` are derived from
  `<source>:<slug>` and never include the suffix, so renaming the suffix later
  does not change row identity.

### Default library bundling workflow

The bundled default library at `src-tauri/seeds/default_library.json` is **not**
written by the generators directly. To rebuild it with both catalogs included:

1. `npm run generate:free-exercise-db`
2. `npm run generate:yoga-poses`
3. In a clean app instance, **Clear local data** (so session history does not leak
   into the seed).
4. Import both generated JSON files via Settings → Data → Import.
5. **Export** the app data via Settings → Data → Export.
6. Replace `src-tauri/seeds/default_library.json` with the exported JSON.
7. Rebuild the app / APK.

The bundled defaults remain catalog-filterable because `catalog_source`,
`catalog_id`, and `is_catalog` are preserved through both export and import.
**Warning:** the export includes session history if any exists — clear local data
first if the seed should be catalog-only.
