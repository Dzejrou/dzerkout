use sqlx::SqlitePool;
use uuid::Uuid;
use crate::{
    db::set_templates,
    domain::types::{SetTemplateRow, SetTemplateSummaryRow, SetTemplateCardRow, SetTemplateDetail},
    error::AppError,
};

pub async fn list(pool: &SqlitePool) -> Result<Vec<SetTemplateSummaryRow>, AppError> {
    set_templates::find_all(pool).await.map_err(Into::into)
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<SetTemplateDetail, AppError> {
    let mut conn = pool.acquire().await?;
    let row = set_templates::find_by_id(&mut conn, id)
        .await?
        .ok_or_else(|| AppError::NotFound(id.to_string()))?;
    let cards = set_templates::find_cards(&mut conn, id).await?;
    Ok(SetTemplateDetail {
        id: row.id,
        name: row.name,
        notes: row.notes,
        owning_workout_template_id: row.owning_workout_template_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        cards,
    })
}

pub async fn create(
    pool: &SqlitePool,
    name: &str,
    notes: Option<&str>,
) -> Result<SetTemplateRow, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    let id = Uuid::new_v4().to_string();
    let mut conn = pool.acquire().await?;
    set_templates::insert(&mut conn, &id, name, notes, None)
        .await
        .map_err(Into::into)
}

/// Create a workout-local (owned) set template.  Used in tests and by the
/// workout_template domain when forking/cloning sets.
pub async fn create_local(
    pool: &SqlitePool,
    name: &str,
    notes: Option<&str>,
    owning_workout_template_id: &str,
) -> Result<SetTemplateRow, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    let id = Uuid::new_v4().to_string();
    let mut conn = pool.acquire().await?;
    set_templates::insert(&mut conn, &id, name, notes, Some(owning_workout_template_id))
        .await
        .map_err(Into::into)
}

pub async fn update(
    pool: &SqlitePool,
    id: &str,
    name: &str,
    notes: Option<&str>,
) -> Result<SetTemplateRow, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    let mut conn = pool.acquire().await?;
    set_templates::update(&mut conn, id, name, notes)
        .await
        .map_err(|e| match &e {
            sqlx::Error::RowNotFound => AppError::NotFound(id.to_string()),
            _ => e.into(),
        })
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let refs = set_templates::count_workout_refs(&mut conn, id).await?;
    if refs > 0 {
        return Err(AppError::Conflict(format!(
            "Set template is referenced by {} workout template(s)",
            refs
        )));
    }
    set_templates::delete(&mut conn, id).await.map_err(Into::into)
}

pub async fn clone_set(pool: &SqlitePool, source_id: &str) -> Result<SetTemplateRow, AppError> {
    let mut tx = pool.begin().await?;

    let source = set_templates::find_by_id(&mut tx, source_id)
        .await?
        .ok_or_else(|| AppError::NotFound(source_id.to_string()))?;
    let source_cards = set_templates::find_cards(&mut tx, source_id).await?;

    let new_id = Uuid::new_v4().to_string();
    let new_name = format!("{} (copy)", source.name);
    let new_set = set_templates::insert(&mut tx, &new_id, &new_name, source.notes.as_deref(), None)
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
    Ok(new_set)
}

pub async fn add_card(
    pool: &SqlitePool,
    set_id: &str,
    card_type: &str,
    exercise_id: Option<&str>,
    placeholder_tag: Option<&str>,
    placeholder_label: Option<&str>,
    duration_hint_sec: Option<i64>,
    notes: Option<&str>,
) -> Result<SetTemplateCardRow, AppError> {
    // Validate type invariants
    match card_type {
        "concrete" => {
            if exercise_id.is_none() {
                return Err(AppError::Validation(
                    "concrete card requires exercise_id".into(),
                ));
            }
        }
        "placeholder" => {
            if placeholder_tag.is_none() {
                return Err(AppError::Validation(
                    "placeholder card requires placeholder_tag".into(),
                ));
            }
        }
        _ => return Err(AppError::Validation(format!("unknown card_type: {}", card_type))),
    }

    let mut tx = pool.begin().await?;

    // Set template must exist
    set_templates::find_by_id(&mut tx, set_id)
        .await?
        .ok_or_else(|| AppError::NotFound(set_id.to_string()))?;

    let order_index = set_templates::next_card_order_index(&mut tx, set_id).await?;
    let card_id = Uuid::new_v4().to_string();

    let card = set_templates::insert_card(
        &mut tx,
        &card_id,
        set_id,
        card_type,
        order_index,
        exercise_id,
        placeholder_tag,
        placeholder_label,
        duration_hint_sec,
        notes,
    )
    .await?;

    tx.commit().await?;
    Ok(card)
}

pub async fn update_card(
    pool: &SqlitePool,
    card_id: &str,
    exercise_id: Option<&str>,
    placeholder_tag: Option<&str>,
    placeholder_label: Option<&str>,
    duration_hint_sec: Option<i64>,
    notes: Option<&str>,
) -> Result<SetTemplateCardRow, AppError> {
    let mut conn = pool.acquire().await?;
    set_templates::update_card(
        &mut conn,
        card_id,
        exercise_id,
        placeholder_tag,
        placeholder_label,
        duration_hint_sec,
        notes,
    )
    .await
    .map_err(|e| match &e {
        sqlx::Error::RowNotFound => AppError::NotFound(card_id.to_string()),
        _ => e.into(),
    })
}

pub async fn remove_card(pool: &SqlitePool, card_id: &str) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    set_templates::delete_card(&mut conn, card_id)
        .await
        .map_err(Into::into)
}

/// Two-phase reorder to avoid UNIQUE (set_template_id, order_index) violations.
pub async fn reorder_cards(
    pool: &SqlitePool,
    set_id: &str,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    set_templates::reorder_cards_phase1(&mut tx, set_id, &ordered_ids)
        .await
        .map_err(|_| AppError::Validation("reorder: one or more card IDs not found".into()))?;
    set_templates::reorder_cards_phase2(&mut tx, set_id, &ordered_ids).await?;
    tx.commit().await?;
    Ok(())
}
