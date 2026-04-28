use sqlx::{SqliteConnection, SqlitePool};
use crate::domain::types::{SetTemplateRow, SetTemplateSummaryRow, SetTemplateCardRow};

pub async fn find_all(pool: &SqlitePool) -> Result<Vec<SetTemplateSummaryRow>, sqlx::Error> {
    sqlx::query_as!(
        SetTemplateSummaryRow,
        "SELECT st.id, st.name, st.notes, st.owning_workout_template_id,
                st.created_at, st.updated_at,
                COUNT(stc.id) AS card_count
         FROM set_templates st
         LEFT JOIN set_template_cards stc ON stc.set_template_id = st.id
         WHERE st.owning_workout_template_id IS NULL
         GROUP BY st.id ORDER BY st.name"
    )
    .fetch_all(pool)
    .await
}

pub async fn find_local_for_workout(
    conn: &mut SqliteConnection,
    workout_id: &str,
) -> Result<Vec<SetTemplateSummaryRow>, sqlx::Error> {
    sqlx::query_as!(
        SetTemplateSummaryRow,
        "SELECT st.id, st.name, st.notes, st.owning_workout_template_id,
                st.created_at, st.updated_at,
                COUNT(stc.id) AS card_count
         FROM set_templates st
         LEFT JOIN set_template_cards stc ON stc.set_template_id = st.id
         WHERE st.owning_workout_template_id = ?
         GROUP BY st.id ORDER BY st.name",
        workout_id
    )
    .fetch_all(conn)
    .await
}

pub async fn find_by_id(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<SetTemplateRow>, sqlx::Error> {
    sqlx::query_as!(
        SetTemplateRow,
        "SELECT id, name, notes, owning_workout_template_id, created_at, updated_at
         FROM set_templates WHERE id = ?",
        id
    )
    .fetch_optional(conn)
    .await
}

pub async fn insert(
    conn: &mut SqliteConnection,
    id: &str,
    name: &str,
    notes: Option<&str>,
    owning_workout_template_id: Option<&str>,
) -> Result<SetTemplateRow, sqlx::Error> {
    sqlx::query_as!(
        SetTemplateRow,
        "INSERT INTO set_templates (id, name, notes, owning_workout_template_id)
         VALUES (?, ?, ?, ?)
         RETURNING id, name, notes, owning_workout_template_id, created_at, updated_at",
        id,
        name,
        notes,
        owning_workout_template_id
    )
    .fetch_one(conn)
    .await
}

pub async fn update(
    conn: &mut SqliteConnection,
    id: &str,
    name: &str,
    notes: Option<&str>,
) -> Result<SetTemplateRow, sqlx::Error> {
    sqlx::query_as!(
        SetTemplateRow,
        "UPDATE set_templates SET name = ?, notes = ?
         WHERE id = ?
         RETURNING id, name, notes, owning_workout_template_id, created_at, updated_at",
        name,
        notes,
        id
    )
    .fetch_one(conn)
    .await
}

pub async fn delete(conn: &mut SqliteConnection, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM set_templates WHERE id = ?", id)
        .execute(conn)
        .await?;
    Ok(())
}

pub async fn find_cards(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<Vec<SetTemplateCardRow>, sqlx::Error> {
    sqlx::query_as!(
        SetTemplateCardRow,
        "SELECT id, set_template_id, card_type, order_index, duration_hint_sec,
                notes, exercise_id, placeholder_tag, placeholder_label,
                created_at, updated_at
         FROM set_template_cards
         WHERE set_template_id = ?
         ORDER BY order_index",
        set_id
    )
    .fetch_all(conn)
    .await
}

pub async fn next_card_order_index(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT COALESCE(MAX(order_index), -1) + 1 AS next_idx
         FROM set_template_cards WHERE set_template_id = ?",
        set_id
    )
    .fetch_one(conn)
    .await?;
    Ok(row.next_idx)
}

pub async fn insert_card(
    conn: &mut SqliteConnection,
    id: &str,
    set_id: &str,
    card_type: &str,
    order_index: i64,
    exercise_id: Option<&str>,
    placeholder_tag: Option<&str>,
    placeholder_label: Option<&str>,
    duration_hint_sec: Option<i64>,
    notes: Option<&str>,
) -> Result<SetTemplateCardRow, sqlx::Error> {
    sqlx::query_as!(
        SetTemplateCardRow,
        "INSERT INTO set_template_cards
             (id, set_template_id, card_type, order_index, exercise_id,
              placeholder_tag, placeholder_label, duration_hint_sec, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, set_template_id, card_type, order_index, duration_hint_sec,
                   notes, exercise_id, placeholder_tag, placeholder_label,
                   created_at, updated_at",
        id,
        set_id,
        card_type,
        order_index,
        exercise_id,
        placeholder_tag,
        placeholder_label,
        duration_hint_sec,
        notes
    )
    .fetch_one(conn)
    .await
}

pub async fn update_card(
    conn: &mut SqliteConnection,
    id: &str,
    exercise_id: Option<&str>,
    placeholder_tag: Option<&str>,
    placeholder_label: Option<&str>,
    duration_hint_sec: Option<i64>,
    notes: Option<&str>,
) -> Result<SetTemplateCardRow, sqlx::Error> {
    sqlx::query_as!(
        SetTemplateCardRow,
        "UPDATE set_template_cards
         SET exercise_id = ?, placeholder_tag = ?, placeholder_label = ?,
             duration_hint_sec = ?, notes = ?
         WHERE id = ?
         RETURNING id, set_template_id, card_type, order_index, duration_hint_sec,
                   notes, exercise_id, placeholder_tag, placeholder_label,
                   created_at, updated_at",
        exercise_id,
        placeholder_tag,
        placeholder_label,
        duration_hint_sec,
        notes,
        id
    )
    .fetch_one(conn)
    .await
}

pub async fn delete_card(conn: &mut SqliteConnection, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM set_template_cards WHERE id = ?", id)
        .execute(conn)
        .await?;
    Ok(())
}

/// Phase 1 of two-phase reorder: assign temporary offset values (1000 + i)
pub async fn reorder_cards_phase1(
    conn: &mut SqliteConnection,
    set_id: &str,
    ordered_ids: &[String],
) -> Result<(), sqlx::Error> {
    for (i, id) in ordered_ids.iter().enumerate() {
        let tmp = 1000 + i as i64;
        let rows = sqlx::query!(
            "UPDATE set_template_cards SET order_index = ?
             WHERE id = ? AND set_template_id = ?",
            tmp,
            id,
            set_id
        )
        .execute(&mut *conn)
        .await?
        .rows_affected();
        if rows == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
    }
    Ok(())
}

/// Phase 2 of two-phase reorder: assign final 0-based values
pub async fn reorder_cards_phase2(
    conn: &mut SqliteConnection,
    set_id: &str,
    ordered_ids: &[String],
) -> Result<(), sqlx::Error> {
    for (i, id) in ordered_ids.iter().enumerate() {
        let idx = i as i64;
        sqlx::query!(
            "UPDATE set_template_cards SET order_index = ?
             WHERE id = ? AND set_template_id = ?",
            idx,
            id,
            set_id
        )
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Returns every set_template row (global and workout-local) ordered by name.
/// Used by the library export path.
pub async fn find_all_for_export(
    conn: &mut SqliteConnection,
) -> Result<Vec<SetTemplateRow>, sqlx::Error> {
    sqlx::query_as!(
        SetTemplateRow,
        "SELECT id, name, notes, owning_workout_template_id, created_at, updated_at
         FROM set_templates ORDER BY name"
    )
    .fetch_all(conn)
    .await
}

pub async fn count_workout_refs(
    conn: &mut SqliteConnection,
    set_id: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT COUNT(*) AS cnt FROM workout_template_set_refs WHERE set_template_id = ?",
        set_id
    )
    .fetch_one(conn)
    .await?;
    Ok(row.cnt)
}
