use sqlx::{Row, SqlitePool};

pub struct SessionSummaryRow {
    pub completed_workouts: i64,
    pub total_workout_duration_sec: i64,
    pub last_completed_at: Option<String>,
}

pub struct ExerciseSummaryRow {
    pub total_sets: i64,
    pub total_exercises: i64,
    pub total_exercise_duration_sec: i64,
    pub skipped_exercises: i64,
}

pub struct TagStatRow {
    pub tag: String,
    pub exercise_count: i64,
    pub duration_sec: i64,
}

pub struct ExerciseStatRow {
    pub exercise_key: String,
    pub display_name: String,
    pub exercise_count: i64,
    pub duration_sec: i64,
    pub skipped_count: i64,
    pub last_performed_at: Option<String>,
}

/// Fetch session-level summary for completed sessions.
/// `cutoff` is an ISO 8601 timestamp lower bound on `ended_at`; None = no lower bound.
pub async fn fetch_session_summary(
    pool: &SqlitePool,
    cutoff: Option<&str>,
) -> Result<SessionSummaryRow, sqlx::Error> {
    let row = sqlx::query(
        "SELECT
           COUNT(*) as completed_workouts,
           COALESCE(SUM(
             CASE WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
             THEN CAST((julianday(ended_at) - julianday(started_at)) * 86400.0 AS INTEGER)
             ELSE 0 END
           ), 0) as total_workout_duration_sec,
           MAX(ended_at) as last_completed_at
         FROM workout_sessions
         WHERE status = 'completed'
           AND (? IS NULL OR ended_at >= ?)",
    )
    .bind(cutoff)
    .bind(cutoff)
    .fetch_one(pool)
    .await?;

    Ok(SessionSummaryRow {
        completed_workouts: row.get::<i64, _>("completed_workouts"),
        total_workout_duration_sec: row.get::<i64, _>("total_workout_duration_sec"),
        last_completed_at: row.get::<Option<String>, _>("last_completed_at"),
    })
}

/// Fetch exercise/set aggregates across completed sessions.
pub async fn fetch_exercise_summary(
    pool: &SqlitePool,
    cutoff: Option<&str>,
) -> Result<ExerciseSummaryRow, sqlx::Error> {
    let row = sqlx::query(
        "SELECT
           COUNT(DISTINCT wss.id) as total_sets,
           COUNT(wse.id) as total_exercises,
           COALESCE(SUM(COALESCE(wse.performed_duration_sec, 0)), 0) as total_exercise_duration_sec,
           COALESCE(SUM(wse.skipped), 0) as skipped_exercises
         FROM workout_session_sets wss
         JOIN workout_sessions ws ON wss.workout_session_id = ws.id
         LEFT JOIN workout_session_exercises wse ON wse.workout_session_set_id = wss.id
         WHERE ws.status = 'completed'
           AND (? IS NULL OR ws.ended_at >= ?)",
    )
    .bind(cutoff)
    .bind(cutoff)
    .fetch_one(pool)
    .await?;

    Ok(ExerciseSummaryRow {
        total_sets: row.get::<i64, _>("total_sets"),
        total_exercises: row.get::<i64, _>("total_exercises"),
        total_exercise_duration_sec: row.get::<i64, _>("total_exercise_duration_sec"),
        skipped_exercises: row.get::<i64, _>("skipped_exercises"),
    })
}

/// Fetch per-tag stats by joining historical exercises to current exercise_tags.
/// Each multi-tag exercise contributes to each of its tags independently.
pub async fn fetch_tag_stats(
    pool: &SqlitePool,
    cutoff: Option<&str>,
) -> Result<Vec<TagStatRow>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT
           et.tag,
           COUNT(*) as exercise_count,
           COALESCE(SUM(COALESCE(wse.performed_duration_sec, 0)), 0) as duration_sec
         FROM workout_session_exercises wse
         JOIN workout_session_sets wss ON wse.workout_session_set_id = wss.id
         JOIN workout_sessions ws ON wss.workout_session_id = ws.id
         JOIN exercise_tags et ON et.exercise_id = wse.exercise_id
         WHERE ws.status = 'completed'
           AND (? IS NULL OR ws.ended_at >= ?)
         GROUP BY et.tag
         ORDER BY duration_sec DESC, exercise_count DESC",
    )
    .bind(cutoff)
    .bind(cutoff)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| TagStatRow {
            tag: r.get::<String, _>("tag"),
            exercise_count: r.get::<i64, _>("exercise_count"),
            duration_sec: r.get::<i64, _>("duration_sec"),
        })
        .collect())
}

/// Fetch top-10 exercise leaderboard by duration across completed sessions.
/// Groups by exercise_id when non-null, else by display_name.
/// Exercises that have been deleted from the library still appear by denormalized name.
pub async fn fetch_exercise_stats(
    pool: &SqlitePool,
    cutoff: Option<&str>,
) -> Result<Vec<ExerciseStatRow>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT
           COALESCE(wse.exercise_id, 'name::' || wse.display_name) as exercise_key,
           MAX(wse.display_name) as display_name,
           COUNT(*) as exercise_count,
           COALESCE(SUM(COALESCE(wse.performed_duration_sec, 0)), 0) as duration_sec,
           COALESCE(SUM(wse.skipped), 0) as skipped_count,
           MAX(ws.ended_at) as last_performed_at
         FROM workout_session_exercises wse
         JOIN workout_session_sets wss ON wse.workout_session_set_id = wss.id
         JOIN workout_sessions ws ON wss.workout_session_id = ws.id
         WHERE ws.status = 'completed'
           AND (? IS NULL OR ws.ended_at >= ?)
         GROUP BY COALESCE(wse.exercise_id, 'name::' || wse.display_name)
         ORDER BY duration_sec DESC, exercise_count DESC, MAX(wse.display_name)
         LIMIT 10",
    )
    .bind(cutoff)
    .bind(cutoff)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| ExerciseStatRow {
            exercise_key: r.get::<String, _>("exercise_key"),
            display_name: r.get::<String, _>("display_name"),
            exercise_count: r.get::<i64, _>("exercise_count"),
            duration_sec: r.get::<i64, _>("duration_sec"),
            skipped_count: r.get::<i64, _>("skipped_count"),
            last_performed_at: r.get::<Option<String>, _>("last_performed_at"),
        })
        .collect())
}
