use sqlx::{SqliteConnection, SqlitePool};
use crate::domain::types::{WorkoutSessionRow, WorkoutSessionSetRow, WorkoutSessionExerciseRow};

// ── Read queries ─────────────────────────────────────────────────────────────

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
                wse.paused_offset_sec, wse.performed_duration_sec,
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

pub async fn find_first_set(
    conn: &mut SqliteConnection,
    session_id: &str,
) -> Result<Option<WorkoutSessionSetRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionSetRow,
        "SELECT id, workout_session_id, source_set_template_id, order_index,
                started_at, ended_at, paused_total_sec, paused_at,
                created_at, updated_at
         FROM workout_session_sets
         WHERE workout_session_id = ?
         ORDER BY order_index
         LIMIT 1",
        session_id
    )
    .fetch_optional(conn)
    .await
}

pub async fn find_first_exercise(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<Option<WorkoutSessionExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionExerciseRow,
        "SELECT id, workout_session_set_id, order_index,
                exercise_id, placeholder_tag, display_name,
                duration_hint_sec, status, skipped,
                started_at, ended_at, notes,
                paused_offset_sec, performed_duration_sec,
                created_at, updated_at
         FROM workout_session_exercises
         WHERE workout_session_set_id = ?
         ORDER BY order_index
         LIMIT 1",
        set_id
    )
    .fetch_optional(conn)
    .await
}

/// Find the currently active exercise within a session (status = 'active').
pub async fn find_active_exercise(
    conn: &mut SqliteConnection,
    session_id: &str,
) -> Result<Option<WorkoutSessionExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionExerciseRow,
        "SELECT wse.id, wse.workout_session_set_id, wse.order_index,
                wse.exercise_id, wse.placeholder_tag, wse.display_name,
                wse.duration_hint_sec, wse.status, wse.skipped,
                wse.started_at, wse.ended_at, wse.notes,
                wse.paused_offset_sec, wse.performed_duration_sec,
                wse.created_at, wse.updated_at
         FROM workout_session_exercises wse
         JOIN workout_session_sets wss ON wss.id = wse.workout_session_set_id
         WHERE wss.workout_session_id = ? AND wse.status = 'active'
         LIMIT 1",
        session_id
    )
    .fetch_optional(conn)
    .await
}

pub async fn find_set_by_id(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<Option<WorkoutSessionSetRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionSetRow,
        "SELECT id, workout_session_id, source_set_template_id, order_index,
                started_at, ended_at, paused_total_sec, paused_at,
                created_at, updated_at
         FROM workout_session_sets WHERE id = ?",
        set_id
    )
    .fetch_optional(conn)
    .await
}

pub async fn find_next_exercise_in_set(
    conn: &mut SqliteConnection,
    set_id: &str,
    after_order_index: i64,
) -> Result<Option<WorkoutSessionExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionExerciseRow,
        "SELECT id, workout_session_set_id, order_index,
                exercise_id, placeholder_tag, display_name,
                duration_hint_sec, status, skipped,
                started_at, ended_at, notes,
                paused_offset_sec, performed_duration_sec,
                created_at, updated_at
         FROM workout_session_exercises
         WHERE workout_session_set_id = ? AND order_index > ?
         ORDER BY order_index
         LIMIT 1",
        set_id,
        after_order_index,
    )
    .fetch_optional(conn)
    .await
}

pub async fn find_next_set(
    conn: &mut SqliteConnection,
    session_id: &str,
    after_set_order_index: i64,
) -> Result<Option<WorkoutSessionSetRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionSetRow,
        "SELECT id, workout_session_id, source_set_template_id, order_index,
                started_at, ended_at, paused_total_sec, paused_at,
                created_at, updated_at
         FROM workout_session_sets
         WHERE workout_session_id = ? AND order_index > ?
         ORDER BY order_index
         LIMIT 1",
        session_id,
        after_set_order_index,
    )
    .fetch_optional(conn)
    .await
}

pub async fn find_prev_exercise_in_set(
    conn: &mut SqliteConnection,
    set_id: &str,
    before_order_index: i64,
) -> Result<Option<WorkoutSessionExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionExerciseRow,
        "SELECT id, workout_session_set_id, order_index,
                exercise_id, placeholder_tag, display_name,
                duration_hint_sec, status, skipped,
                started_at, ended_at, notes,
                paused_offset_sec, performed_duration_sec,
                created_at, updated_at
         FROM workout_session_exercises
         WHERE workout_session_set_id = ? AND order_index < ?
         ORDER BY order_index DESC
         LIMIT 1",
        set_id,
        before_order_index,
    )
    .fetch_optional(conn)
    .await
}

pub async fn find_prev_set(
    conn: &mut SqliteConnection,
    session_id: &str,
    before_set_order_index: i64,
) -> Result<Option<WorkoutSessionSetRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionSetRow,
        "SELECT id, workout_session_id, source_set_template_id, order_index,
                started_at, ended_at, paused_total_sec, paused_at,
                created_at, updated_at
         FROM workout_session_sets
         WHERE workout_session_id = ? AND order_index < ?
         ORDER BY order_index DESC
         LIMIT 1",
        session_id,
        before_set_order_index,
    )
    .fetch_optional(conn)
    .await
}

pub async fn find_last_exercise_in_set(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<Option<WorkoutSessionExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionExerciseRow,
        "SELECT id, workout_session_set_id, order_index,
                exercise_id, placeholder_tag, display_name,
                duration_hint_sec, status, skipped,
                started_at, ended_at, notes,
                paused_offset_sec, performed_duration_sec,
                created_at, updated_at
         FROM workout_session_exercises
         WHERE workout_session_set_id = ?
         ORDER BY order_index DESC
         LIMIT 1",
        set_id,
    )
    .fetch_optional(conn)
    .await
}

// ── Startability check ───────────────────────────────────────────────────────

pub async fn count_total_cards_for_workout(
    conn: &mut SqliteConnection,
    workout_template_id: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT COUNT(stc.id) AS cnt
         FROM workout_template_set_refs wtsr
         JOIN set_template_cards stc ON stc.set_template_id = wtsr.set_template_id
         WHERE wtsr.workout_template_id = ?",
        workout_template_id
    )
    .fetch_one(conn)
    .await?;
    Ok(row.cnt)
}

// ── Snapshot inserts ─────────────────────────────────────────────────────────

pub async fn insert_session(
    conn: &mut SqliteConnection,
    id: &str,
    workout_template_id: Option<&str>,
    source_name: Option<&str>,
) -> Result<WorkoutSessionRow, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionRow,
        "INSERT INTO workout_sessions
             (id, workout_template_id, source_workout_template_name, status)
         VALUES (?, ?, ?, 'draft')
         RETURNING id, workout_template_id, source_workout_template_name, status,
                   session_date, started_at, ended_at, notes, created_at, updated_at",
        id,
        workout_template_id,
        source_name,
    )
    .fetch_one(conn)
    .await
}

pub async fn insert_session_set(
    conn: &mut SqliteConnection,
    id: &str,
    session_id: &str,
    source_set_template_id: Option<&str>,
    order_index: i64,
) -> Result<WorkoutSessionSetRow, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionSetRow,
        "INSERT INTO workout_session_sets
             (id, workout_session_id, source_set_template_id, order_index)
         VALUES (?, ?, ?, ?)
         RETURNING id, workout_session_id, source_set_template_id, order_index,
                   started_at, ended_at, paused_total_sec, paused_at,
                   created_at, updated_at",
        id,
        session_id,
        source_set_template_id,
        order_index,
    )
    .fetch_one(conn)
    .await
}

pub async fn insert_session_exercise(
    conn: &mut SqliteConnection,
    id: &str,
    set_id: &str,
    order_index: i64,
    exercise_id: Option<&str>,
    placeholder_tag: Option<&str>,
    display_name: &str,
    duration_hint_sec: Option<i64>,
    notes: Option<&str>,
) -> Result<WorkoutSessionExerciseRow, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionExerciseRow,
        "INSERT INTO workout_session_exercises
             (id, workout_session_set_id, order_index,
              exercise_id, placeholder_tag, display_name,
              duration_hint_sec, notes,
              status, skipped)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
         RETURNING id, workout_session_set_id, order_index,
                   exercise_id, placeholder_tag, display_name,
                   duration_hint_sec, status, skipped,
                   started_at, ended_at, notes,
                   paused_offset_sec, performed_duration_sec,
                   created_at, updated_at",
        id,
        set_id,
        order_index,
        exercise_id,
        placeholder_tag,
        display_name,
        duration_hint_sec,
        notes,
    )
    .fetch_one(conn)
    .await
}

// ── Phase 2 (start) updates ──────────────────────────────────────────────────

pub async fn transition_session_to_in_progress(
    conn: &mut SqliteConnection,
    session_id: &str,
) -> Result<WorkoutSessionRow, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionRow,
        "UPDATE workout_sessions
         SET status       = 'in_progress',
             started_at   = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             session_date = strftime('%Y-%m-%d', 'now')
         WHERE id = ? AND status = 'draft'
         RETURNING id, workout_template_id, source_workout_template_name, status,
                   session_date, started_at, ended_at, notes, created_at, updated_at",
        session_id
    )
    .fetch_one(conn)
    .await
}

pub async fn set_session_set_started(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_sets
         SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?",
        set_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn activate_exercise(
    conn: &mut SqliteConnection,
    exercise_id: &str,
) -> Result<(), sqlx::Error> {
    // Snapshot the parent set's paused_total_sec as paused_offset_sec so we can
    // later compute per-exercise paused time = set.paused_total_sec - paused_offset_sec.
    sqlx::query!(
        "UPDATE workout_session_exercises
         SET status           = 'active',
             started_at       = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             paused_offset_sec = (
                 SELECT COALESCE(wss.paused_total_sec, 0)
                 FROM workout_session_sets wss
                 WHERE wss.id = (
                     SELECT workout_session_set_id
                     FROM workout_session_exercises
                     WHERE id = ?
                 )
             )
         WHERE id = ?",
        exercise_id,
        exercise_id,
    )
    .execute(conn)
    .await?;
    Ok(())
}

// ── Pause / Resume ───────────────────────────────────────────────────────────

/// Set paused_at = now(). Idempotent: no-op if already paused.
pub async fn pause_set(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_sets
         SET paused_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND paused_at IS NULL",
        set_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Atomically accumulate paused seconds and clear paused_at.
/// Idempotent: no-op if not paused (WHERE paused_at IS NOT NULL guard).
pub async fn resume_set(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_sets
         SET paused_total_sec = paused_total_sec + (unixepoch('now') - unixepoch(paused_at)),
             paused_at = NULL
         WHERE id = ? AND paused_at IS NOT NULL",
        set_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

// ── Exercise status transitions ──────────────────────────────────────────────

pub async fn complete_exercise(
    conn: &mut SqliteConnection,
    exercise_id: &str,
) -> Result<(), sqlx::Error> {
    // performed_duration_sec = wall time elapsed - paused time during this exercise.
    // paused time during this exercise = set.paused_total_sec - exercise.paused_offset_sec.
    // Implicit resume has already fired before this call, so paused_total_sec is current.
    sqlx::query!(
        "UPDATE workout_session_exercises
         SET status                = 'completed',
             ended_at              = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             performed_duration_sec = (
                 SELECT CASE
                     WHEN e.started_at IS NOT NULL THEN
                         MAX(0, unixepoch('now') - unixepoch(e.started_at)
                             - (COALESCE(s.paused_total_sec, 0) - e.paused_offset_sec))
                     ELSE NULL
                 END
                 FROM workout_session_exercises e
                 JOIN workout_session_sets s ON s.id = e.workout_session_set_id
                 WHERE e.id = ?
             )
         WHERE id = ?",
        exercise_id,
        exercise_id,
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Reset an exercise to pending (corrective Prev — current exercise).
/// Also clears skipped in case the exercise was previously skipped.
pub async fn pend_exercise(
    conn: &mut SqliteConnection,
    exercise_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_exercises
         SET status                 = 'pending',
             started_at             = NULL,
             ended_at               = NULL,
             skipped                = 0,
             paused_offset_sec      = 0,
             performed_duration_sec = NULL
         WHERE id = ?",
        exercise_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Reactivate an exercise with fresh started_at (corrective Prev — previous exercise).
/// Clears ended_at and skipped in case it was previously completed/skipped.
pub async fn reactivate_exercise(
    conn: &mut SqliteConnection,
    exercise_id: &str,
) -> Result<(), sqlx::Error> {
    // Re-snapshot paused_offset_sec from the parent set (which was just restarted
    // by restart_prev_set or left unchanged for same-set Prev).
    sqlx::query!(
        "UPDATE workout_session_exercises
         SET status                 = 'active',
             started_at             = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             ended_at               = NULL,
             skipped                = 0,
             performed_duration_sec = NULL,
             paused_offset_sec      = (
                 SELECT COALESCE(wss.paused_total_sec, 0)
                 FROM workout_session_sets wss
                 WHERE wss.id = (
                     SELECT workout_session_set_id
                     FROM workout_session_exercises
                     WHERE id = ?
                 )
             )
         WHERE id = ?",
        exercise_id,
        exercise_id,
    )
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn mark_exercise_skipped(
    conn: &mut SqliteConnection,
    exercise_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_exercises
         SET skipped                = 1,
             status                 = 'skipped',
             ended_at               = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             performed_duration_sec = (
                 SELECT CASE
                     WHEN e.started_at IS NOT NULL THEN
                         MAX(0, unixepoch('now') - unixepoch(e.started_at)
                             - (COALESCE(s.paused_total_sec, 0) - e.paused_offset_sec))
                     ELSE NULL
                 END
                 FROM workout_session_exercises e
                 JOIN workout_session_sets s ON s.id = e.workout_session_set_id
                 WHERE e.id = ?
             )
         WHERE id = ?",
        exercise_id,
        exercise_id,
    )
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn end_exercise_if_open(
    conn: &mut SqliteConnection,
    exercise_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_exercises
         SET ended_at               = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             performed_duration_sec = (
                 SELECT CASE
                     WHEN e.started_at IS NOT NULL THEN
                         MAX(0, unixepoch('now') - unixepoch(e.started_at)
                             - (COALESCE(s.paused_total_sec, 0) - e.paused_offset_sec))
                     ELSE NULL
                 END
                 FROM workout_session_exercises e
                 JOIN workout_session_sets s ON s.id = e.workout_session_set_id
                 WHERE e.id = ?
             )
         WHERE id = ? AND ended_at IS NULL",
        exercise_id,
        exercise_id,
    )
    .execute(conn)
    .await?;
    Ok(())
}

// ── Set timing transitions ───────────────────────────────────────────────────

pub async fn end_set(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_sets
         SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?",
        set_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn end_set_if_open(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_sets
         SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND ended_at IS NULL",
        set_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Start a new set with fresh timer (used on cross-set advance).
pub async fn start_fresh_set(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_sets
         SET started_at       = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             paused_total_sec = 0,
             paused_at        = NULL
         WHERE id = ?",
        set_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Reset all timing on a set to null/zero (corrective Prev — current set).
pub async fn reset_set_timing(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_sets
         SET started_at       = NULL,
             ended_at         = NULL,
             paused_at        = NULL,
             paused_total_sec = 0
         WHERE id = ?",
        set_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Restart a previous set with fresh timer (corrective Prev — previous set).
pub async fn restart_prev_set(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_session_sets
         SET ended_at         = NULL,
             started_at       = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             paused_at        = NULL,
             paused_total_sec = 0
         WHERE id = ?",
        set_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

// ── Session terminal transitions ─────────────────────────────────────────────

pub async fn finish_session_row(
    conn: &mut SqliteConnection,
    session_id: &str,
) -> Result<WorkoutSessionRow, sqlx::Error> {
    sqlx::query_as!(
        WorkoutSessionRow,
        "UPDATE workout_sessions
         SET status   = 'completed',
             ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?
         RETURNING id, workout_template_id, source_workout_template_name, status,
                   session_date, started_at, ended_at, notes, created_at, updated_at",
        session_id
    )
    .fetch_one(conn)
    .await
}

pub async fn abandon_session_row(
    conn: &mut SqliteConnection,
    session_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_sessions
         SET status   = 'abandoned',
             ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?",
        session_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

// ── Discard ──────────────────────────────────────────────────────────────────

pub async fn delete_session(
    conn: &mut SqliteConnection,
    session_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM workout_sessions WHERE id = ?", session_id)
        .execute(conn)
        .await?;
    Ok(())
}
