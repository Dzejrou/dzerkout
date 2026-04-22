// History DB repository — deferred to history slice.
use sqlx::SqlitePool;
use crate::domain::types::WorkoutSessionRow;

pub async fn list_completed(pool: &SqlitePool) -> Result<Vec<WorkoutSessionRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionRow,
        "SELECT id, workout_template_id, source_workout_template_name, status,
                session_date, started_at, ended_at, notes, created_at, updated_at
         FROM workout_sessions
         WHERE status = 'completed'
         ORDER BY session_date DESC, started_at DESC"
    )
    .fetch_all(pool)
    .await
}
