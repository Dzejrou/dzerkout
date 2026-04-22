// History commands — deferred to history slice.
use sqlx::SqlitePool;
use tauri::State;
use crate::{db::history, domain::types::WorkoutSessionRow, error::AppError};

#[tauri::command]
pub async fn list_session_history(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<WorkoutSessionRow>, AppError> {
    history::list_completed(&pool).await.map_err(Into::into)
}
