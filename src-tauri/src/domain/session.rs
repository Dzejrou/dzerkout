use sqlx::{SqliteConnection, SqlitePool};
use uuid::Uuid;
use crate::{
    db::{exercises as exercises_db, sessions, set_templates, workout_templates},
    domain::types::{ActiveSessionPayload, RestPhaseInfo, TimerBase, WorkoutSessionRow},
    error::AppError,
};

// ── Shared payload builder ────────────────────────────────────────────────────

pub async fn build_payload(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<ActiveSessionPayload, AppError> {
    let mut conn = pool.acquire().await?;
    let session = sessions::find_session_by_id(&mut conn, session_id)
        .await?
        .ok_or_else(|| AppError::NotFound(session_id.to_string()))?;
    let sets = sessions::find_sets_for_session(&mut conn, session_id).await?;
    let exercises = sessions::find_exercises_for_session(&mut conn, session_id).await?;

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

    let timer_base = match current_set_id
        .as_deref()
        .and_then(|sid| sets.iter().find(|s| s.id == sid))
    {
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

    // Detect rest phase: a set whose rest_started_at IS NOT NULL and started_at IS NULL.
    let rest_phase = sets
        .iter()
        .find(|s| s.rest_started_at.is_some() && s.started_at.is_none())
        .and_then(|s| {
            let started_ms = s
                .rest_started_at
                .as_deref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.timestamp_millis())?;
            Some(RestPhaseInfo {
                next_set_id: s.id.clone(),
                rest_duration_sec: s.rest_duration_sec.unwrap_or(0),
                rest_started_at_ms: started_ms,
            })
        });

    Ok(ActiveSessionPayload {
        session,
        sets,
        exercises,
        current_exercise_id,
        current_set_id,
        timer_base,
        rest_phase,
    })
}

// ── Inline resume helper ──────────────────────────────────────────────────────

/// Resume the set timer if currently paused. Safe to call unconditionally —
/// the WHERE guard makes it a no-op when not paused.
async fn inline_resume_if_paused(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<(), AppError> {
    sessions::resume_set(conn, set_id).await?;
    Ok(())
}

// ── get_active_session (app launch / recovery) ────────────────────────────────

pub async fn get_active_session(
    pool: &SqlitePool,
) -> Result<Option<ActiveSessionPayload>, AppError> {
    let session = match sessions::find_active(pool).await? {
        Some(s) => s,
        None => return Ok(None),
    };
    let payload = build_payload(pool, &session.id).await?;
    Ok(Some(payload))
}

// ── create_session_draft (Phase 1 — snapshot) ────────────────────────────────

pub async fn create_session_draft(
    pool: &SqlitePool,
    workout_template_id: &str,
) -> Result<ActiveSessionPayload, AppError> {
    // Startability pre-check (before opening transaction)
    let mut pre_conn = pool.acquire().await?;
    let card_count =
        sessions::count_total_cards_for_workout(&mut pre_conn, workout_template_id).await?;
    if card_count == 0 {
        return Err(AppError::Validation(
            "workout has no cards; add at least one exercise before starting".into(),
        ));
    }

    let wt = workout_templates::find_by_id(&mut pre_conn, workout_template_id)
        .await?
        .ok_or_else(|| AppError::NotFound(workout_template_id.to_string()))?;

    let set_refs = workout_templates::find_set_refs(&mut pre_conn, workout_template_id).await?;

    let all_assignments =
        workout_templates::find_assignments_for_workout(&mut pre_conn, workout_template_id)
            .await?;

    drop(pre_conn);

    let mut tx = pool.begin().await?;

    let session_id = Uuid::new_v4().to_string();
    sessions::insert_session(
        &mut tx,
        &session_id,
        Some(workout_template_id),
        Some(&wt.name),
    )
    .await?;

    let mut set_order: i64 = 0;

    for set_ref in &set_refs {
        let cards = set_templates::find_cards(&mut tx, &set_ref.set_template_id).await?;

        if cards.is_empty() {
            continue;
        }

        let wss_id = Uuid::new_v4().to_string();
        sessions::insert_session_set(
            &mut tx,
            &wss_id,
            &session_id,
            Some(&set_ref.set_template_id),
            set_order,
        )
        .await?;
        set_order += 1;

        for (card_idx, card) in cards.iter().enumerate() {
            let assignment = all_assignments.iter().find(|a| {
                a.workout_template_set_ref_id == set_ref.id
                    && a.set_template_card_id == card.id
            });

            let resolved_exercise_id = assignment
                .and_then(|a| a.exercise_id.as_deref())
                .or(card.exercise_id.as_deref());

            let display_name: String = if let Some(label) = assignment.and_then(|a| a.display_label.as_deref()) {
                label.to_string()
            } else if let Some(ex_id) = resolved_exercise_id {
                match exercises_db::find_by_id(&mut tx, ex_id).await? {
                    Some(ex) => ex.name,
                    None => card
                        .placeholder_label
                        .as_deref()
                        .or(card.placeholder_tag.as_deref())
                        .unwrap_or("Unknown")
                        .to_string(),
                }
            } else {
                card.placeholder_label
                    .as_deref()
                    .or(card.placeholder_tag.as_deref())
                    .unwrap_or("Unspecified")
                    .to_string()
            };

            let duration_hint_sec: Option<i64> = assignment
                .and_then(|a| a.duration_hint_sec)
                .or(card.duration_hint_sec)
                .or(Some(wt.default_exercise_duration_sec));

            let notes: Option<&str> = assignment
                .and_then(|a| a.notes.as_deref())
                .or(card.notes.as_deref());

            let wse_id = Uuid::new_v4().to_string();
            sessions::insert_session_exercise(
                &mut tx,
                &wse_id,
                &wss_id,
                card_idx as i64,
                resolved_exercise_id,
                card.placeholder_tag.as_deref(),
                &display_name,
                duration_hint_sec,
                notes,
            )
            .await?;
        }
    }

    tx.commit().await?;

    build_payload(pool, &session_id).await
}

// ── start_session (Phase 2) ───────────────────────────────────────────────────

pub async fn start_session(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<ActiveSessionPayload, AppError> {
    let mut tx = pool.begin().await?;

    let session = sessions::find_session_by_id(&mut tx, session_id)
        .await?
        .ok_or_else(|| AppError::NotFound(session_id.to_string()))?;

    if session.status != "draft" {
        return Err(AppError::Validation(format!(
            "session {} is not in draft state (current: {})",
            session_id, session.status
        )));
    }

    let first_set = sessions::find_first_set(&mut tx, session_id)
        .await?
        .ok_or_else(|| AppError::Validation("session has no sets".into()))?;

    let first_exercise = sessions::find_first_exercise(&mut tx, &first_set.id)
        .await?
        .ok_or_else(|| AppError::Validation("first set has no exercises".into()))?;

    sessions::transition_session_to_in_progress(&mut tx, session_id).await?;
    sessions::set_session_set_started(&mut tx, &first_set.id).await?;
    sessions::activate_exercise(&mut tx, &first_exercise.id).await?;

    tx.commit().await?;

    build_payload(pool, session_id).await
}

// ── pause_session ─────────────────────────────────────────────────────────────

pub async fn pause_session(
    pool: &SqlitePool,
    session_id: &str,
    set_id: &str,
) -> Result<ActiveSessionPayload, AppError> {
    let mut conn = pool.acquire().await?;
    sessions::pause_set(&mut conn, set_id).await?;
    build_payload(pool, session_id).await
}

// ── resume_session ────────────────────────────────────────────────────────────

pub async fn resume_session(
    pool: &SqlitePool,
    session_id: &str,
    set_id: &str,
) -> Result<ActiveSessionPayload, AppError> {
    let mut conn = pool.acquire().await?;
    sessions::resume_set(&mut conn, set_id).await?;
    build_payload(pool, session_id).await
}

// ── advance_exercise (Next) ───────────────────────────────────────────────────

pub async fn advance_exercise(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<ActiveSessionPayload, AppError> {
    let mut tx = pool.begin().await?;

    let current_ex = sessions::find_active_exercise(&mut tx, session_id)
        .await?
        .ok_or_else(|| AppError::Validation("no active exercise".into()))?;

    let current_set = sessions::find_set_by_id(&mut tx, &current_ex.workout_session_set_id)
        .await?
        .ok_or_else(|| AppError::NotFound(current_ex.workout_session_set_id.clone()))?;

    // Implicit resume if paused (SPEC §3.5 edge case)
    if current_set.paused_at.is_some() {
        inline_resume_if_paused(&mut tx, &current_set.id).await?;
    }

    let next_in_set = sessions::find_next_exercise_in_set(
        &mut tx,
        &current_set.id,
        current_ex.order_index,
    )
    .await?;

    if let Some(next) = next_in_set {
        // Same-set advance
        sessions::complete_exercise(&mut tx, &current_ex.id).await?;
        sessions::activate_exercise(&mut tx, &next.id).await?;
    } else {
        // Cross-set advance
        let next_set =
            sessions::find_next_set(&mut tx, session_id, current_set.order_index).await?;

        let Some(ns) = next_set else {
            return Err(AppError::Validation(
                "no next exercise — call finish_session".into(),
            ));
        };

        let next_ex = sessions::find_first_exercise(&mut tx, &ns.id)
            .await?
            .ok_or_else(|| AppError::Validation("next set has no exercises".into()))?;

        sessions::complete_exercise(&mut tx, &current_ex.id).await?;
        sessions::end_set(&mut tx, &current_set.id).await?;

        // Enter rest phase if the template has a rest duration configured.
        let rest_sec = sessions::fetch_rest_between_sets_sec(&mut tx, session_id).await?;
        if rest_sec.unwrap_or(0) > 0 {
            sessions::begin_rest_on_set(&mut tx, &ns.id, rest_sec.unwrap()).await?;
        } else {
            sessions::start_fresh_set(&mut tx, &ns.id).await?;
            sessions::activate_exercise(&mut tx, &next_ex.id).await?;
        }
    }

    tx.commit().await?;
    build_payload(pool, session_id).await
}

// ── retreat_exercise (Prev) ───────────────────────────────────────────────────

pub async fn retreat_exercise(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<ActiveSessionPayload, AppError> {
    let mut tx = pool.begin().await?;

    let maybe_current_ex = sessions::find_active_exercise(&mut tx, session_id).await?;

    // Handle rest phase: no active exercise but there is a set waiting in rest.
    if maybe_current_ex.is_none() {
        let rest_set = sessions::find_set_in_rest(&mut tx, session_id).await?;
        if let Some(rs) = rest_set {
            let prev_set = sessions::find_prev_set(&mut tx, session_id, rs.order_index).await?;
            let Some(ps) = prev_set else {
                return Err(AppError::Validation(
                    "already at first exercise (rest phase — no previous set)".into(),
                ));
            };
            let prev_ex = sessions::find_last_exercise_in_set(&mut tx, &ps.id)
                .await?
                .ok_or_else(|| AppError::Validation("previous set has no exercises".into()))?;

            // Cancel rest on the waiting set and re-open the previous set.
            sessions::clear_rest_on_set(&mut tx, &rs.id).await?;
            sessions::restart_prev_set(&mut tx, &ps.id).await?;
            sessions::reactivate_exercise(&mut tx, &prev_ex.id).await?;

            tx.commit().await?;
            return build_payload(pool, session_id).await;
        }
        return Err(AppError::Validation("no active exercise".into()));
    }

    let current_ex = maybe_current_ex.unwrap();

    let current_set = sessions::find_set_by_id(&mut tx, &current_ex.workout_session_set_id)
        .await?
        .ok_or_else(|| AppError::NotFound(current_ex.workout_session_set_id.clone()))?;

    let prev_in_set = sessions::find_prev_exercise_in_set(
        &mut tx,
        &current_set.id,
        current_ex.order_index,
    )
    .await?;

    if let Some(prev) = prev_in_set {
        // Same-set retreat — set timer unchanged, paused state carries over
        sessions::pend_exercise(&mut tx, &current_ex.id).await?;
        sessions::reactivate_exercise(&mut tx, &prev.id).await?;
    } else {
        // Cross-set retreat
        let prev_set =
            sessions::find_prev_set(&mut tx, session_id, current_set.order_index).await?;

        let Some(ps) = prev_set else {
            return Err(AppError::Validation("already at first exercise".into()));
        };

        let prev_ex = sessions::find_last_exercise_in_set(&mut tx, &ps.id)
            .await?
            .ok_or_else(|| AppError::Validation("previous set has no exercises".into()))?;

        sessions::pend_exercise(&mut tx, &current_ex.id).await?;
        sessions::reset_set_timing(&mut tx, &current_set.id).await?;
        sessions::restart_prev_set(&mut tx, &ps.id).await?;
        sessions::reactivate_exercise(&mut tx, &prev_ex.id).await?;
    }

    tx.commit().await?;
    build_payload(pool, session_id).await
}

// ── skip_exercise ─────────────────────────────────────────────────────────────

pub async fn skip_exercise(
    pool: &SqlitePool,
    session_id: &str,
    exercise_id: &str,
) -> Result<ActiveSessionPayload, AppError> {
    let mut tx = pool.begin().await?;

    let current_ex = sessions::find_active_exercise(&mut tx, session_id)
        .await?
        .ok_or_else(|| AppError::Validation("no active exercise".into()))?;

    if current_ex.id != exercise_id {
        return Err(AppError::Validation(
            "exercise_id does not match active exercise".into(),
        ));
    }

    let current_set = sessions::find_set_by_id(&mut tx, &current_ex.workout_session_set_id)
        .await?
        .ok_or_else(|| AppError::NotFound(current_ex.workout_session_set_id.clone()))?;

    // Implicit resume if paused
    if current_set.paused_at.is_some() {
        inline_resume_if_paused(&mut tx, &current_set.id).await?;
    }

    sessions::mark_exercise_skipped(&mut tx, &current_ex.id).await?;

    // Advance using same logic as advance_exercise
    let next_in_set = sessions::find_next_exercise_in_set(
        &mut tx,
        &current_set.id,
        current_ex.order_index,
    )
    .await?;

    if let Some(next) = next_in_set {
        sessions::activate_exercise(&mut tx, &next.id).await?;
    } else {
        let next_set =
            sessions::find_next_set(&mut tx, session_id, current_set.order_index).await?;

        if let Some(ns) = next_set {
            let next_ex = sessions::find_first_exercise(&mut tx, &ns.id)
                .await?
                .ok_or_else(|| AppError::Validation("next set has no exercises".into()))?;

            sessions::end_set(&mut tx, &current_set.id).await?;
            // Skip always bypasses rest — the user deliberately chose to move on immediately.
            sessions::start_fresh_set(&mut tx, &ns.id).await?;
            sessions::activate_exercise(&mut tx, &next_ex.id).await?;
        }
        // If no next set: last exercise skipped — no next to activate; current_exercise_id
        // will be None in the payload, signalling the frontend to offer Finish.
    }

    tx.commit().await?;
    build_payload(pool, session_id).await
}

// ── finish_session ────────────────────────────────────────────────────────────

pub async fn finish_session(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<WorkoutSessionRow, AppError> {
    let mut tx = pool.begin().await?;

    let current_ex = sessions::find_active_exercise(&mut tx, session_id).await?;

    if let Some(ref ex) = current_ex {
        let current_set = sessions::find_set_by_id(&mut tx, &ex.workout_session_set_id)
            .await?
            .ok_or_else(|| AppError::NotFound(ex.workout_session_set_id.clone()))?;

        // Implicit resume if paused
        if current_set.paused_at.is_some() {
            inline_resume_if_paused(&mut tx, &current_set.id).await?;
        }

        sessions::end_exercise_if_open(&mut tx, &ex.id).await?;
        sessions::end_set_if_open(&mut tx, &current_set.id).await?;
    }

    let session = sessions::finish_session_row(&mut tx, session_id).await?;
    tx.commit().await?;
    Ok(session)
}

// ── start_next_set (end rest → begin next set) ────────────────────────────────

pub async fn start_next_set(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<ActiveSessionPayload, AppError> {
    let mut tx = pool.begin().await?;

    let rest_set = sessions::find_set_in_rest(&mut tx, session_id)
        .await?
        .ok_or_else(|| AppError::Validation("no rest phase is currently active".into()))?;

    let next_ex = sessions::find_first_exercise(&mut tx, &rest_set.id)
        .await?
        .ok_or_else(|| AppError::Validation("rest set has no exercises".into()))?;

    sessions::clear_rest_on_set(&mut tx, &rest_set.id).await?;
    sessions::start_fresh_set(&mut tx, &rest_set.id).await?;
    sessions::activate_exercise(&mut tx, &next_ex.id).await?;

    tx.commit().await?;
    build_payload(pool, session_id).await
}

// ── abandon_session ───────────────────────────────────────────────────────────

pub async fn abandon_session(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    sessions::abandon_session_row(&mut conn, session_id)
        .await
        .map_err(Into::into)
}

// ── discard_session ───────────────────────────────────────────────────────────

pub async fn discard_session(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    sessions::delete_session(&mut conn, session_id)
        .await
        .map_err(Into::into)
}
