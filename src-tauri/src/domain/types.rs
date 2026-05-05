use serde::{Deserialize, Serialize};

// ── Exercise tags ─────────────────────────────────────────────────────────────

/// Every tag value accepted by the exercise tag system.
/// Validation in the domain layer rejects any value not in this list.
pub const VALID_EXERCISE_TAGS: &[&str] = &[
    "unspecified",
    "push",
    "pull",
    "legs",
    "core",
    "mobility",
    "yoga",
    "cardio",
    "isotonic",
    "isometric",
    "concentric",
    "eccentric",
];

// ── Exercise catalog metadata constants ───────────────────────────────────────

pub const VALID_EXERCISE_CATEGORIES: &[&str] = &[
    "strength",
    "stretching",
    "cardio",
    "plyometrics",
    "powerlifting",
    "olympic weightlifting",
    "strongman",
    "yoga",
];

pub const VALID_EXERCISE_EQUIPMENT: &[&str] = &[
    "none",
    "body only",
    "barbell",
    "dumbbell",
    "cable",
    "machine",
    "kettlebells",
    "bands",
    "medicine ball",
    "exercise ball",
    "foam roll",
    "e-z curl bar",
    "other",
];

pub const VALID_EXERCISE_LEVELS: &[&str] = &["beginner", "intermediate", "expert"];
pub const VALID_EXERCISE_MECHANICS: &[&str] = &["compound", "isolation"];
pub const VALID_EXERCISE_FORCES: &[&str] = &["push", "pull", "static"];

pub const VALID_EXERCISE_MUSCLES: &[&str] = &[
    "abdominals",
    "abductors",
    "adductors",
    "biceps",
    "calves",
    "chest",
    "forearms",
    "glutes",
    "hamstrings",
    "lats",
    "lower back",
    "middle back",
    "neck",
    "quadriceps",
    "shoulders",
    "traps",
    "triceps",
];

// ── Exercise catalog input types ──────────────────────────────────────────────

/// Optional catalog metadata for create/update.
/// All fields default to None / false so existing callers that omit it are unaffected.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExerciseMeta {
    #[serde(default)]
    pub catalog_source: Option<String>,
    #[serde(default)]
    pub catalog_id: Option<String>,
    #[serde(default)]
    pub is_catalog: bool,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub equipment: Option<String>,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub mechanic: Option<String>,
    #[serde(default)]
    pub force: Option<String>,
    /// JSON array of instruction strings, e.g. `["Step 1", "Step 2"]`.
    /// Validated in the domain layer before writing.
    #[serde(default)]
    pub instructions_json: Option<String>,
}

/// One muscle assignment for an exercise.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseMuscleInput {
    pub muscle: String,
    pub role: String,
}

// ── Row types returned from DB queries ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ExerciseRow {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub image_url: Option<String>,
    pub catalog_source: Option<String>,
    pub catalog_id: Option<String>,
    pub is_catalog: i64,
    pub category: Option<String>,
    pub equipment: Option<String>,
    pub level: Option<String>,
    pub mechanic: Option<String>,
    pub force: Option<String>,
    pub instructions_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Enriched exercise returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exercise {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub image_url: Option<String>,
    pub tags: Vec<String>,
    pub catalog_source: Option<String>,
    pub catalog_id: Option<String>,
    pub is_catalog: bool,
    pub category: Option<String>,
    pub equipment: Option<String>,
    pub level: Option<String>,
    pub mechanic: Option<String>,
    pub force: Option<String>,
    pub instructions_json: Option<String>,
    pub primary_muscles: Vec<String>,
    pub secondary_muscles: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Exercise {
    pub fn from_parts(
        row: ExerciseRow,
        tags: Vec<String>,
        primary_muscles: Vec<String>,
        secondary_muscles: Vec<String>,
    ) -> Self {
        Self {
            id: row.id,
            name: row.name,
            notes: row.notes,
            image_url: row.image_url,
            tags,
            catalog_source: row.catalog_source,
            catalog_id: row.catalog_id,
            is_catalog: row.is_catalog != 0,
            category: row.category,
            equipment: row.equipment,
            level: row.level,
            mechanic: row.mechanic,
            force: row.force,
            instructions_json: row.instructions_json,
            primary_muscles,
            secondary_muscles,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ExerciseCardRef {
    pub card_id: String,
    pub set_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseReferences {
    pub cards: Vec<ExerciseCardRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExerciseSearchFilters {
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub equipment: Option<String>,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub primary_muscle: Option<String>,
    #[serde(default)]
    pub force: Option<String>,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseSearchResult {
    pub exercises: Vec<Exercise>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SetTemplateRow {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub owning_workout_template_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SetTemplateSummaryRow {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub owning_workout_template_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub card_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SetTemplateCardRow {
    pub id: String,
    pub set_template_id: String,
    pub card_type: String,
    pub order_index: i64,
    pub duration_hint_sec: Option<i64>,
    pub notes: Option<String>,
    pub exercise_id: Option<String>,
    pub placeholder_tag: Option<String>,
    pub placeholder_label: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetTemplateDetail {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub owning_workout_template_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub cards: Vec<SetTemplateCardRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkoutTemplateRow {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub default_exercise_duration_sec: i64,
    pub rest_between_sets_sec: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkoutTemplateSummaryRow {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub default_exercise_duration_sec: i64,
    pub rest_between_sets_sec: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub set_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkoutTemplateSetRefRow {
    pub id: String,
    pub workout_template_id: String,
    pub set_template_id: String,
    pub order_index: i64,
    pub set_name: String,
    /// Set when this ref was forked (clone_set_from_workout). Records the
    /// original set template ID. NULL = normal non-forked reference.
    pub source_set_template_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkoutTemplateCardAssignmentRow {
    pub id: String,
    pub workout_template_set_ref_id: String,
    pub set_template_card_id: String,
    pub exercise_id: Option<String>,
    pub display_label: Option<String>,
    pub duration_hint_sec: Option<i64>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkoutTemplateDetail {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub default_exercise_duration_sec: i64,
    pub rest_between_sets_sec: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub set_refs: Vec<WorkoutTemplateSetRefRow>,
    pub assignments: Vec<WorkoutTemplateCardAssignmentRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkoutSessionRow {
    pub id: String,
    pub workout_template_id: Option<String>,
    pub source_workout_template_name: Option<String>,
    pub status: String,
    pub session_date: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkoutSessionSetRow {
    pub id: String,
    pub workout_session_id: String,
    pub source_set_template_id: Option<String>,
    pub order_index: i64,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub paused_total_sec: i64,
    pub paused_at: Option<String>,
    /// Set when this set is in the "rest" phase (rest_started_at IS NOT NULL AND started_at IS NULL).
    pub rest_duration_sec: Option<i64>,
    pub rest_started_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkoutSessionExerciseRow {
    pub id: String,
    pub workout_session_set_id: String,
    pub order_index: i64,
    pub exercise_id: Option<String>,
    pub placeholder_tag: Option<String>,
    pub display_name: String,
    pub duration_hint_sec: Option<i64>,
    pub status: String,
    pub skipped: i64,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub notes: Option<String>,
    /// paused_total_sec of the parent set at the moment this exercise became active.
    /// Per-exercise paused time = (set.paused_total_sec when ended) - paused_offset_sec.
    pub paused_offset_sec: i64,
    /// Active wall-time seconds for this exercise. NULL until the exercise ends.
    /// Cleared back to NULL by corrective Prev.
    pub performed_duration_sec: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerBase {
    pub set_started_at_ms: Option<i64>,
    pub paused_total_sec: i64,
    pub paused_at_ms: Option<i64>,
}

/// Present in ActiveSessionPayload when the runner is in a between-set rest phase.
/// The next set has been identified and cued but not yet started.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestPhaseInfo {
    /// The workout_session_sets.id of the set that is waiting to start.
    pub next_set_id: String,
    /// Configured rest duration in seconds (from the workout template).
    pub rest_duration_sec: i64,
    /// Unix timestamp (milliseconds) of when rest began.
    pub rest_started_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SessionSummary {
    pub id: String,
    pub source_workout_template_name: Option<String>,
    pub status: String,
    pub session_date: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub notes: Option<String>,
    pub set_count: i64,
    pub exercise_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDetailSet {
    pub id: String,
    pub order_index: i64,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub paused_total_sec: i64,
    pub exercises: Vec<WorkoutSessionExerciseRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDetail {
    pub id: String,
    pub source_workout_template_name: Option<String>,
    pub status: String,
    pub session_date: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub sets: Vec<SessionDetailSet>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSessionPayload {
    pub session: WorkoutSessionRow,
    pub sets: Vec<WorkoutSessionSetRow>,
    pub exercises: Vec<WorkoutSessionExerciseRow>,
    pub current_exercise_id: Option<String>,
    pub current_set_id: Option<String>,
    pub timer_base: TimerBase,
    /// Non-null when the runner is in a between-set rest phase (no active exercise).
    pub rest_phase: Option<RestPhaseInfo>,
    /// Configured rest-between-sets duration from the workout template.
    /// None when the session has no template or the template has no rest configured.
    /// Used by the runner to preview upcoming rest in the exercise queue.
    pub rest_between_sets_sec: Option<i64>,
}
