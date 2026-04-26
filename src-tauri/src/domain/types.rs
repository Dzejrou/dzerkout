use serde::{Deserialize, Serialize};
use sqlx::Type;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum CardType {
    Concrete,
    Placeholder,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum PlaceholderTag {
    Unspecified,
    Push,
    Pull,
    Legs,
    Core,
    Mobility,
}

impl PlaceholderTag {
    pub fn as_str(&self) -> &'static str {
        match self {
            PlaceholderTag::Unspecified => "unspecified",
            PlaceholderTag::Push => "push",
            PlaceholderTag::Pull => "pull",
            PlaceholderTag::Legs => "legs",
            PlaceholderTag::Core => "core",
            PlaceholderTag::Mobility => "mobility",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum SessionStatus {
    Draft,
    InProgress,
    Completed,
    Abandoned,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum ExerciseStatus {
    Pending,
    Active,
    Completed,
    Skipped,
}

// ── Row types returned from DB queries ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ExerciseRow {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub image_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
