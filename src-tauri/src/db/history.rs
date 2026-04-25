use sqlx::{SqlitePool, SqliteConnection};
use crate::domain::types::{SessionSummary, WorkoutSessionRow, WorkoutSessionSetRow, WorkoutSessionExerciseRow};

pub async fn list_sessions(pool: &SqlitePool) -> Result<Vec<SessionSummary>, sqlx::Error> {
    sqlx::query_as!(
        SessionSummary,
        r#"SELECT
            ws.id,
            ws.source_workout_template_name,
            ws.status,
            ws.session_date,
            ws.started_at,
            ws.ended_at,
            ws.notes,
            ws.created_at,
            ws.updated_at,
            (SELECT COUNT(*) FROM workout_session_sets WHERE workout_session_id = ws.id) as "set_count!: i64",
            (SELECT COUNT(*) FROM workout_session_exercises wse
             JOIN workout_session_sets wss ON wse.workout_session_set_id = wss.id
             WHERE wss.workout_session_id = ws.id) as "exercise_count!: i64"
         FROM workout_sessions ws
         WHERE ws.status IN ('completed', 'in_progress')
         ORDER BY ws.session_date DESC, ws.started_at DESC"#
    )
    .fetch_all(pool)
    .await
}

pub async fn get_session_row(pool: &SqlitePool, session_id: &str) -> Result<Option<WorkoutSessionRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionRow,
        "SELECT id, workout_template_id, source_workout_template_name, status,
                session_date, started_at, ended_at, notes, created_at, updated_at
         FROM workout_sessions WHERE id = ?",
        session_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn get_session_sets(conn: &mut SqliteConnection, session_id: &str) -> Result<Vec<WorkoutSessionSetRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionSetRow,
        "SELECT id, workout_session_id, source_set_template_id, order_index,
                started_at, ended_at, paused_total_sec, paused_at,
                rest_duration_sec, rest_started_at,
                created_at, updated_at
         FROM workout_session_sets
         WHERE workout_session_id = ?
         ORDER BY order_index",
        session_id
    )
    .fetch_all(conn)
    .await
}

pub async fn get_exercises_for_set(conn: &mut SqliteConnection, set_id: &str) -> Result<Vec<WorkoutSessionExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionExerciseRow,
        "SELECT id, workout_session_set_id, order_index, exercise_id, placeholder_tag,
                display_name, duration_hint_sec, status, skipped, started_at, ended_at,
                notes, paused_offset_sec, performed_duration_sec, created_at, updated_at
         FROM workout_session_exercises
         WHERE workout_session_set_id = ?
         ORDER BY order_index",
        set_id
    )
    .fetch_all(conn)
    .await
}
