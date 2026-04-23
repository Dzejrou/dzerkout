use sqlx::SqlitePool;
use tauri::State;
use crate::{
    domain::{
        workout_template,
        types::{
            SetTemplateRow, WorkoutTemplateRow, WorkoutTemplateSummaryRow, WorkoutTemplateDetail,
            WorkoutTemplateSetRefRow, WorkoutTemplateCardAssignmentRow,
        },
    },
    error::AppError,
};

#[tauri::command]
pub async fn list_workout_templates(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<WorkoutTemplateSummaryRow>, AppError> {
    workout_template::list(&pool).await
}

#[tauri::command]
pub async fn get_workout_template(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<WorkoutTemplateDetail, AppError> {
    workout_template::get(&pool, &id).await
}

#[tauri::command]
pub async fn create_workout_template(
    pool: State<'_, SqlitePool>,
    name: String,
    notes: Option<String>,
    default_duration_sec: i64,
    rest_sec: Option<i64>,
) -> Result<WorkoutTemplateRow, AppError> {
    workout_template::create(&pool, &name, notes.as_deref(), default_duration_sec, rest_sec).await
}

#[tauri::command]
pub async fn update_workout_template(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
    notes: Option<String>,
    default_duration_sec: i64,
    rest_sec: Option<i64>,
) -> Result<WorkoutTemplateRow, AppError> {
    workout_template::update(
        &pool,
        &id,
        &name,
        notes.as_deref(),
        default_duration_sec,
        rest_sec,
    )
    .await
}

#[tauri::command]
pub async fn delete_workout_template(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), AppError> {
    workout_template::delete(&pool, &id).await
}

#[tauri::command]
pub async fn add_set_ref(
    pool: State<'_, SqlitePool>,
    workout_id: String,
    set_id: String,
) -> Result<WorkoutTemplateSetRefRow, AppError> {
    workout_template::add_set_ref(&pool, &workout_id, &set_id).await
}

#[tauri::command]
pub async fn remove_set_ref(
    pool: State<'_, SqlitePool>,
    set_ref_id: String,
) -> Result<(), AppError> {
    workout_template::remove_set_ref(&pool, &set_ref_id).await
}

#[tauri::command]
pub async fn reorder_set_refs(
    pool: State<'_, SqlitePool>,
    workout_id: String,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    workout_template::reorder_set_refs(&pool, &workout_id, ordered_ids).await
}

#[tauri::command]
pub async fn clone_set_from_workout(
    pool: State<'_, SqlitePool>,
    set_ref_id: String,
) -> Result<WorkoutTemplateSetRefRow, AppError> {
    workout_template::clone_set_from_workout(&pool, &set_ref_id).await
}

#[tauri::command]
pub async fn upsert_card_assignment(
    pool: State<'_, SqlitePool>,
    set_ref_id: String,
    card_id: String,
    exercise_id: Option<String>,
    display_label: Option<String>,
    duration_hint_sec: Option<i64>,
    notes: Option<String>,
) -> Result<WorkoutTemplateCardAssignmentRow, AppError> {
    workout_template::upsert_card_assignment(
        &pool,
        &set_ref_id,
        &card_id,
        exercise_id.as_deref(),
        display_label.as_deref(),
        duration_hint_sec,
        notes.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn delete_card_assignment(
    pool: State<'_, SqlitePool>,
    assignment_id: String,
) -> Result<(), AppError> {
    workout_template::delete_card_assignment(&pool, &assignment_id).await
}

#[tauri::command]
pub async fn export_forked_set(
    pool: State<'_, SqlitePool>,
    set_id: String,
    new_name: String,
) -> Result<SetTemplateRow, AppError> {
    workout_template::export_forked_set(&pool, &set_id, &new_name).await
}
