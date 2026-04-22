// Session domain service — runner operations deferred to next slice.
// Provides get_active_session so the app shell can check on startup.
use sqlx::SqlitePool;
use crate::{
    db::sessions,
    domain::types::{ActiveSessionPayload, TimerBase},
    error::AppError,
};

pub async fn get_active_session(
    pool: &SqlitePool,
) -> Result<Option<ActiveSessionPayload>, AppError> {
    let session = match sessions::find_active(pool).await? {
        Some(s) => s,
        None => return Ok(None),
    };

    let mut conn = pool.acquire().await?;
    let sets = sessions::find_sets_for_session(&mut conn, &session.id).await?;
    let exercises = sessions::find_exercises_for_session(&mut conn, &session.id).await?;

    // Clone ids before moving sets/exercises into the payload
    let current_exercise_id = exercises
        .iter()
        .find(|e| e.status == "active")
        .map(|e| e.id.clone());

    let current_set_id = current_exercise_id.as_deref().and_then(|ex_id| {
        exercises
            .iter()
            .find(|e| e.id == ex_id)
            .and_then(|e| sets.iter().find(|s| s.id == e.workout_session_set_id))
            .map(|s| s.id.clone())
    });

    let timer_base = match current_set_id.as_deref().and_then(|sid| sets.iter().find(|s| s.id == sid)) {
        Some(s) => TimerBase {
            set_started_at_ms: s
                .started_at
                .as_deref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.timestamp_millis()),
            paused_total_sec: s.paused_total_sec,
            paused_at_ms: s
                .paused_at
                .as_deref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.timestamp_millis()),
        },
        None => TimerBase {
            set_started_at_ms: None,
            paused_total_sec: 0,
            paused_at_ms: None,
        },
    };

    Ok(Some(ActiveSessionPayload {
        session,
        sets,
        exercises,
        current_exercise_id,
        current_set_id,
        timer_base,
    }))
}
