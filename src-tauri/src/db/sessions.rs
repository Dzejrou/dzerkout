// Session DB repository — runner operations deferred to next slice.
// Stubs are present so the module compiles and domain/session.rs can reference them.
use sqlx::{SqliteConnection, SqlitePool};
use crate::domain::types::{WorkoutSessionRow, WorkoutSessionSetRow, WorkoutSessionExerciseRow};

pub async fn find_active(pool: &SqlitePool) -> Result<Option<WorkoutSessionRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionRow,
        "SELECT id, workout_template_id, source_workout_template_name, status,
                session_date, started_at, ended_at, notes, created_at, updated_at
         FROM workout_sessions
         WHERE status IN ('draft', 'in_progress')
         LIMIT 1"
    )
    .fetch_optional(pool)
    .await
}

pub async fn find_session_by_id(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<WorkoutSessionRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionRow,
        "SELECT id, workout_template_id, source_workout_template_name, status,
                session_date, started_at, ended_at, notes, created_at, updated_at
         FROM workout_sessions WHERE id = ?",
        id
    )
    .fetch_optional(conn)
    .await
}

pub async fn find_sets_for_session(
    conn: &mut SqliteConnection,
    session_id: &str,
) -> Result<Vec<WorkoutSessionSetRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionSetRow,
        "SELECT id, workout_session_id, source_set_template_id, order_index,
                started_at, ended_at, paused_total_sec, paused_at,
                created_at, updated_at
         FROM workout_session_sets
         WHERE workout_session_id = ?
         ORDER BY order_index",
        session_id
    )
    .fetch_all(conn)
    .await
}

pub async fn find_exercises_for_session(
    conn: &mut SqliteConnection,
    session_id: &str,
) -> Result<Vec<WorkoutSessionExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionExerciseRow,
        "SELECT wse.id, wse.workout_session_set_id, wse.order_index,
                wse.exercise_id, wse.placeholder_tag, wse.display_name,
                wse.duration_hint_sec, wse.status, wse.skipped,
                wse.started_at, wse.ended_at, wse.notes,
                wse.created_at, wse.updated_at
         FROM workout_session_exercises wse
         JOIN workout_session_sets wss ON wss.id = wse.workout_session_set_id
         WHERE wss.workout_session_id = ?
         ORDER BY wss.order_index, wse.order_index",
        session_id
    )
    .fetch_all(conn)
    .await
}
