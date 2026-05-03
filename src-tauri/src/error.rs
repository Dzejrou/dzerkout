use serde::Serialize;

/// Application error type. Implements `Serialize` so Tauri v2 can return it
/// from commands as the error arm of `Result<T, AppError>`.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Validation: {0}")]
    Validation(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Database error: {0}")]
    Database(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match &e {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                AppError::Conflict(db.message().to_string())
            }
            _ => AppError::Database(e.to_string()),
        }
    }
}
