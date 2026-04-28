use sqlx::SqlitePool;
use tauri::State;
use crate::{domain::library::{self, ImportResult}, error::AppError};

#[tauri::command]
pub async fn export_library_json(pool: State<'_, SqlitePool>) -> Result<String, AppError> {
    library::export_full_library(&pool).await
}

#[tauri::command]
pub async fn import_library_json(
    pool: State<'_, SqlitePool>,
    json: String,
) -> Result<ImportResult, AppError> {
    library::import_library_json(&pool, &json).await
}
