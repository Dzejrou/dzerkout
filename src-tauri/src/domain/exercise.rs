use sqlx::SqlitePool;
use uuid::Uuid;
use crate::{
    db::exercises,
    domain::types::{ExerciseRow, ExerciseReferences},
    error::AppError,
};

pub async fn list(pool: &SqlitePool) -> Result<Vec<ExerciseRow>, AppError> {
    exercises::find_all(pool).await.map_err(Into::into)
}

pub async fn create(
    pool: &SqlitePool,
    name: &str,
    notes: Option<&str>,
) -> Result<ExerciseRow, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    let id = Uuid::new_v4().to_string();
    let mut conn = pool.acquire().await?;
    exercises::insert(&mut conn, &id, name, notes)
        .await
        .map_err(|e| match &e {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                AppError::Conflict(format!("Exercise '{}' already exists", name))
            }
            _ => e.into(),
        })
}

pub async fn update(
    pool: &SqlitePool,
    id: &str,
    name: &str,
    notes: Option<&str>,
) -> Result<ExerciseRow, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    let mut conn = pool.acquire().await?;
    exercises::update(&mut conn, id, name, notes)
        .await
        .map_err(|e| match &e {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                AppError::Conflict(format!("Exercise '{}' already exists", name))
            }
            sqlx::Error::RowNotFound => AppError::NotFound(id.to_string()),
            _ => e.into(),
        })
}

pub async fn get_references(
    pool: &SqlitePool,
    id: &str,
) -> Result<ExerciseReferences, AppError> {
    let mut conn = pool.acquire().await?;
    let cards = exercises::find_referencing_cards(&mut conn, id)
        .await
        .map_err(AppError::from)?;
    Ok(ExerciseReferences { cards })
}

pub async fn delete_with_unlink(
    pool: &SqlitePool,
    id: &str,
    confirmed: bool,
) -> Result<(), AppError> {
    if !confirmed {
        return Err(AppError::Validation(
            "deletion requires explicit confirmation".into(),
        ));
    }

    let mut tx = pool.begin().await?;

    // 1. Get exercise name for fallback labels
    let exercise = exercises::find_by_id(&mut tx, id)
        .await?
        .ok_or_else(|| AppError::NotFound(id.to_string()))?;

    // 2. Convert referencing concrete cards to placeholders
    exercises::convert_cards_to_placeholder(&mut tx, id, &exercise.name).await?;

    // 3. Null exercise_id on assignments; preserve or set display_label
    exercises::null_assignment_exercise_ids(&mut tx, id, &exercise.name).await?;

    // 4. Delete exercise — SQLite SET NULL cascades to workout_session_exercises
    exercises::delete(&mut tx, id).await?;

    tx.commit().await?;
    Ok(())
}
