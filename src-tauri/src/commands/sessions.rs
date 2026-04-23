use sqlx::SqlitePool;
use tauri::State;
use crate::{
    domain::{session, types::{ActiveSessionPayload, WorkoutSessionRow}},
    error::AppError,
};

#[tauri::command]
pub async fn get_active_session(
    pool: State<'_, SqlitePool>,
) -> Result<Option<ActiveSessionPayload>, AppError> {
    session::get_active_session(&pool).await
}

#[tauri::command]
pub async fn create_session_draft(
    pool: State<'_, SqlitePool>,
    workout_template_id: String,
) -> Result<ActiveSessionPayload, AppError> {
    session::create_session_draft(&pool, &workout_template_id).await
}

#[tauri::command]
pub async fn start_session(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<ActiveSessionPayload, AppError> {
    session::start_session(&pool, &session_id).await
}

#[tauri::command]
pub async fn pause_session(
    pool: State<'_, SqlitePool>,
    session_id: String,
    set_id: String,
) -> Result<ActiveSessionPayload, AppError> {
    session::pause_session(&pool, &session_id, &set_id).await
}

#[tauri::command]
pub async fn resume_session(
    pool: State<'_, SqlitePool>,
    session_id: String,
    set_id: String,
) -> Result<ActiveSessionPayload, AppError> {
    session::resume_session(&pool, &session_id, &set_id).await
}

#[tauri::command]
pub async fn advance_exercise(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<ActiveSessionPayload, AppError> {
    session::advance_exercise(&pool, &session_id).await
}

#[tauri::command]
pub async fn retreat_exercise(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<ActiveSessionPayload, AppError> {
    session::retreat_exercise(&pool, &session_id).await
}

#[tauri::command]
pub async fn skip_exercise(
    pool: State<'_, SqlitePool>,
    session_id: String,
    exercise_id: String,
) -> Result<ActiveSessionPayload, AppError> {
    session::skip_exercise(&pool, &session_id, &exercise_id).await
}

#[tauri::command]
pub async fn finish_session(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<WorkoutSessionRow, AppError> {
    session::finish_session(&pool, &session_id).await
}

#[tauri::command]
pub async fn abandon_session(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<(), AppError> {
    session::abandon_session(&pool, &session_id).await
}

#[tauri::command]
pub async fn discard_session(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<(), AppError> {
    session::discard_session(&pool, &session_id).await
}
