use sqlx::SqlitePool;
use tauri::State;
use crate::{
    domain::{exercise, types::{Exercise, ExerciseMeta, ExerciseMuscleInput, ExerciseReferences}},
    error::AppError,
};

#[tauri::command]
pub async fn list_exercises(pool: State<'_, SqlitePool>) -> Result<Vec<Exercise>, AppError> {
    exercise::list(&pool).await
}

#[tauri::command]
pub async fn create_exercise(
    pool: State<'_, SqlitePool>,
    name: String,
    notes: Option<String>,
    tags: Vec<String>,
    meta: Option<ExerciseMeta>,
    muscles: Option<Vec<ExerciseMuscleInput>>,
) -> Result<Exercise, AppError> {
    exercise::create(
        &pool,
        &name,
        notes.as_deref(),
        &tags,
        meta.as_ref(),
        muscles.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn update_exercise(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
    notes: Option<String>,
    tags: Vec<String>,
    muscles: Option<Vec<ExerciseMuscleInput>>,
    meta: Option<ExerciseMeta>,
) -> Result<Exercise, AppError> {
    exercise::update(
        &pool,
        &id,
        &name,
        notes.as_deref(),
        &tags,
        meta.as_ref(),
        muscles.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn get_exercise_references(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<ExerciseReferences, AppError> {
    exercise::get_references(&pool, &id).await
}

#[tauri::command]
pub async fn delete_exercise(
    pool: State<'_, SqlitePool>,
    id: String,
    confirmed: bool,
) -> Result<(), AppError> {
    exercise::delete_with_unlink(&pool, &id, confirmed).await
}
