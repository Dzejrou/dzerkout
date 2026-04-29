use sqlx::SqlitePool;
use tauri::State;
use crate::{domain::stats::{self, StatsPayload}, error::AppError};

#[tauri::command]
pub async fn get_stats(
    pool: State<'_, SqlitePool>,
    range: Option<String>,
) -> Result<StatsPayload, AppError> {
    let range_str = range.as_deref().unwrap_or("all");
    stats::get_stats(&pool, range_str).await
}
