use sqlx::SqlitePool;
use uuid::Uuid;
use crate::{
    db::{set_templates, workout_templates},
    domain::types::{
        SetTemplateRow, WorkoutTemplateRow, WorkoutTemplateSummaryRow, WorkoutTemplateSetRefRow,
        WorkoutTemplateCardAssignmentRow, WorkoutTemplateDetail,
    },
    error::AppError,
};

pub async fn list(pool: &SqlitePool) -> Result<Vec<WorkoutTemplateSummaryRow>, AppError> {
    workout_templates::find_all(pool).await.map_err(Into::into)
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<WorkoutTemplateDetail, AppError> {
    let mut conn = pool.acquire().await?;
    let row = workout_templates::find_by_id(&mut conn, id)
        .await?
        .ok_or_else(|| AppError::NotFound(id.to_string()))?;
    let set_refs = workout_templates::find_set_refs(&mut conn, id).await?;
    let assignments = workout_templates::find_assignments_for_workout(&mut conn, id).await?;
    Ok(WorkoutTemplateDetail {
        id: row.id,
        name: row.name,
        notes: row.notes,
        default_exercise_duration_sec: row.default_exercise_duration_sec,
        rest_between_sets_sec: row.rest_between_sets_sec,
        created_at: row.created_at,
        updated_at: row.updated_at,
        set_refs,
        assignments,
    })
}

pub async fn create(
    pool: &SqlitePool,
    name: &str,
    notes: Option<&str>,
    default_duration_sec: i64,
    rest_sec: Option<i64>,
) -> Result<WorkoutTemplateRow, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    let id = Uuid::new_v4().to_string();
    let mut conn = pool.acquire().await?;
    workout_templates::insert(&mut conn, &id, name, notes, default_duration_sec, rest_sec)
        .await
        .map_err(Into::into)
}

pub async fn update(
    pool: &SqlitePool,
    id: &str,
    name: &str,
    notes: Option<&str>,
    default_duration_sec: i64,
    rest_sec: Option<i64>,
) -> Result<WorkoutTemplateRow, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    let mut conn = pool.acquire().await?;
    workout_templates::update(&mut conn, id, name, notes, default_duration_sec, rest_sec)
        .await
        .map_err(|e| match &e {
            sqlx::Error::RowNotFound => AppError::NotFound(id.to_string()),
            _ => e.into(),
        })
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    // The migration sets ON DELETE CASCADE on owning_workout_template_id, so
    // deleting the workout row also cleans up its local (forked) set_templates.
    let mut conn = pool.acquire().await?;
    workout_templates::delete(&mut conn, id)
        .await
        .map_err(Into::into)
}

/// Export a workout-local forked set into the global library under a new name.
/// Creates an independent global copy; the local fork is not removed.
pub async fn export_forked_set(
    pool: &SqlitePool,
    set_id: &str,
    new_name: &str,
) -> Result<SetTemplateRow, AppError> {
    if new_name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    let mut tx = pool.begin().await?;

    let source = set_templates::find_by_id(&mut tx, set_id)
        .await?
        .ok_or_else(|| AppError::NotFound(set_id.to_string()))?;

    if source.owning_workout_template_id.is_none() {
        return Err(AppError::Validation(
            "set is already global; only workout-local sets can be exported".into(),
        ));
    }

    let source_cards = set_templates::find_cards(&mut tx, set_id).await?;

    let new_id = Uuid::new_v4().to_string();
    let exported = set_templates::insert(&mut tx, &new_id, new_name, source.notes.as_deref(), None)
        .await?;

    for card in &source_cards {
        let card_id = Uuid::new_v4().to_string();
        set_templates::insert_card(
            &mut tx,
            &card_id,
            &new_id,
            &card.card_type,
            card.order_index,
            card.exercise_id.as_deref(),
            card.placeholder_tag.as_deref(),
            card.placeholder_label.as_deref(),
            card.duration_hint_sec,
            card.notes.as_deref(),
        )
        .await?;
    }

    tx.commit().await?;
    Ok(exported)
}

pub async fn add_set_ref(
    pool: &SqlitePool,
    workout_id: &str,
    set_id: &str,
) -> Result<WorkoutTemplateSetRefRow, AppError> {
    let mut tx = pool.begin().await?;

    // Verify both exist
    workout_templates::find_by_id(&mut tx, workout_id)
        .await?
        .ok_or_else(|| AppError::NotFound(workout_id.to_string()))?;
    set_templates::find_by_id(&mut tx, set_id)
        .await?
        .ok_or_else(|| AppError::NotFound(set_id.to_string()))?;

    let order_index = workout_templates::next_set_ref_order_index(&mut tx, workout_id).await?;
    let ref_id = Uuid::new_v4().to_string();
    let set_ref =
        workout_templates::insert_set_ref(&mut tx, &ref_id, workout_id, set_id, order_index, None)
            .await?;
    tx.commit().await?;
    Ok(set_ref)
}

pub async fn remove_set_ref(pool: &SqlitePool, set_ref_id: &str) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    workout_templates::delete_set_ref(&mut conn, set_ref_id)
        .await
        .map_err(Into::into)
}

/// Two-phase reorder to avoid UNIQUE (workout_template_id, order_index) violations.
pub async fn reorder_set_refs(
    pool: &SqlitePool,
    workout_id: &str,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    workout_templates::reorder_set_refs_phase1(&mut tx, workout_id, &ordered_ids)
        .await
        .map_err(|_| AppError::Validation("reorder: one or more ref IDs not found".into()))?;
    workout_templates::reorder_set_refs_phase2(&mut tx, workout_id, &ordered_ids).await?;
    tx.commit().await?;
    Ok(())
}

/// Clone a set template from within a workout: creates an independent copy,
/// then replaces the existing set_ref to point at the new clone.
pub async fn clone_set_from_workout(
    pool: &SqlitePool,
    set_ref_id: &str,
) -> Result<WorkoutTemplateSetRefRow, AppError> {
    let mut tx = pool.begin().await?;

    let set_ref = workout_templates::find_set_ref_by_id(&mut tx, set_ref_id)
        .await?
        .ok_or_else(|| AppError::NotFound(set_ref_id.to_string()))?;

    // Clone the source set template
    let source = set_templates::find_by_id(&mut tx, &set_ref.set_template_id)
        .await?
        .ok_or_else(|| AppError::NotFound(set_ref.set_template_id.clone()))?;
    let source_cards = set_templates::find_cards(&mut tx, &set_ref.set_template_id).await?;

    let new_set_id = Uuid::new_v4().to_string();
    set_templates::insert(
        &mut tx,
        &new_set_id,
        &source.name,
        source.notes.as_deref(),
        Some(&set_ref.workout_template_id),
    )
    .await?;

    for card in &source_cards {
        let card_id = Uuid::new_v4().to_string();
        set_templates::insert_card(
            &mut tx,
            &card_id,
            &new_set_id,
            &card.card_type,
            card.order_index,
            card.exercise_id.as_deref(),
            card.placeholder_tag.as_deref(),
            card.placeholder_label.as_deref(),
            card.duration_hint_sec,
            card.notes.as_deref(),
        )
        .await?;
    }

    // Replace the existing set_ref with one pointing at the new clone.
    // source_set_template_id records the original for the "Forked" badge in the UI.
    let original_set_id = set_ref.set_template_id.clone();
    let new_ref_id = Uuid::new_v4().to_string();
    workout_templates::delete_set_ref(&mut tx, set_ref_id).await?;
    let new_ref = workout_templates::insert_set_ref(
        &mut tx,
        &new_ref_id,
        &set_ref.workout_template_id,
        &new_set_id,
        set_ref.order_index,
        Some(&original_set_id),
    )
    .await?;

    tx.commit().await?;
    Ok(new_ref)
}

pub async fn upsert_card_assignment(
    pool: &SqlitePool,
    set_ref_id: &str,
    card_id: &str,
    exercise_id: Option<&str>,
    display_label: Option<&str>,
    duration_hint_sec: Option<i64>,
    notes: Option<&str>,
) -> Result<WorkoutTemplateCardAssignmentRow, AppError> {
    let mut tx = pool.begin().await?;

    // Cross-set validation: card must belong to the set referenced by set_ref
    workout_templates::validate_card_belongs_to_ref(&mut tx, set_ref_id, card_id)
        .await
        .map_err(|_| {
            AppError::Validation(
                "card does not belong to the set referenced by this set_ref".into(),
            )
        })?;

    let id = Uuid::new_v4().to_string();
    let assignment = workout_templates::upsert_assignment(
        &mut tx,
        &id,
        set_ref_id,
        card_id,
        exercise_id,
        display_label,
        duration_hint_sec,
        notes,
    )
    .await?;

    tx.commit().await?;
    Ok(assignment)
}

pub async fn delete_card_assignment(
    pool: &SqlitePool,
    assignment_id: &str,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    workout_templates::delete_assignment(&mut conn, assignment_id)
        .await
        .map_err(Into::into)
}
