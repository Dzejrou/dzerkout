use sqlx::SqlitePool;
use tauri::State;
use crate::{domain::library::{self, ClearResult, ImportResult, ResetResult}, error::AppError};

#[tauri::command]
pub async fn export_library_json(
    pool: State<'_, SqlitePool>,
) -> Result<String, AppError> {
    library::export_full_library(&pool).await
}

#[tauri::command]
pub async fn import_library_json(
    pool: State<'_, SqlitePool>,
    json: String,
) -> Result<ImportResult, AppError> {
    library::import_library_json(&pool, &json).await
}

#[tauri::command]
pub async fn reset_local_data(
    pool: State<'_, SqlitePool>,
) -> Result<ResetResult, AppError> {
    library::reset_local_data_with_seed(
        &pool,
        include_str!("../../seeds/default_library.json"),
    )
    .await
}

#[tauri::command]
pub async fn clear_local_data(
    pool: State<'_, SqlitePool>,
) -> Result<ClearResult, AppError> {
    library::clear_local_data(&pool).await?;
    Ok(ClearResult { cleared: true })
}
