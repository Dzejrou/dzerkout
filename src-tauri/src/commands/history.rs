use sqlx::SqlitePool;
use tauri::State;
use crate::{
    db::history,
    domain::types::{SessionDetail, SessionDetailSet, SessionSummary},
    error::AppError,
};

#[tauri::command]
pub async fn list_session_history(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<SessionSummary>, AppError> {
    history::list_sessions(&pool).await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_session_detail(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<SessionDetail, AppError> {
    let session = history::get_session_row(&pool, &session_id)
        .await?
        .ok_or_else(|| AppError::NotFound(session_id.clone()))?;

    let mut conn = pool.acquire().await?;
    let sets = history::get_session_sets(&mut conn, &session_id).await?;

    let mut detail_sets = Vec::with_capacity(sets.len());
    for s in sets {
        let exercises = history::get_exercises_for_set(&mut conn, &s.id).await?;
        detail_sets.push(SessionDetailSet {
            id: s.id,
            order_index: s.order_index,
            started_at: s.started_at,
            ended_at: s.ended_at,
            paused_total_sec: s.paused_total_sec,
            exercises,
        });
    }

    Ok(SessionDetail {
        id: session.id,
        source_workout_template_name: session.source_workout_template_name,
        status: session.status,
        session_date: session.session_date,
        started_at: session.started_at,
        ended_at: session.ended_at,
        notes: session.notes,
        created_at: session.created_at,
        updated_at: session.updated_at,
        sets: detail_sets,
    })
}
