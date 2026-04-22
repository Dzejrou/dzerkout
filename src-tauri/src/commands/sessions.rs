// Runner session commands — deferred to next slice.
// get_active_session is implemented so the recovery gate works.
use sqlx::SqlitePool;
use tauri::State;
use crate::{
    domain::{session, types::ActiveSessionPayload},
    error::AppError,
};

#[tauri::command]
pub async fn get_active_session(
    pool: State<'_, SqlitePool>,
) -> Result<Option<ActiveSessionPayload>, AppError> {
    session::get_active_session(&pool).await
}
