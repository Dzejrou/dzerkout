use sqlx::SqlitePool;
use tauri::State;
use crate::{domain::library::{self, ExportScope, ImportResult, ResetResult}, error::AppError};

#[tauri::command]
pub async fn export_library_json(
    pool: State<'_, SqlitePool>,
    scope: Option<String>,
) -> Result<String, AppError> {
    let scope = match scope.as_deref() {
        None | Some("full") => ExportScope::Full,
        Some(s) => ExportScope::parse(s)?,
    };
    library::export_library(&pool, scope).await
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
