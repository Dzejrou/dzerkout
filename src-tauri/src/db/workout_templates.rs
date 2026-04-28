use sqlx::{SqliteConnection, SqlitePool};
use crate::domain::types::{
    WorkoutTemplateRow, WorkoutTemplateSummaryRow, WorkoutTemplateSetRefRow,
    WorkoutTemplateCardAssignmentRow,
};

pub async fn find_all(pool: &SqlitePool) -> Result<Vec<WorkoutTemplateSummaryRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutTemplateSummaryRow,
        "SELECT wt.id, wt.name, wt.notes,
                wt.default_exercise_duration_sec, wt.rest_between_sets_sec,
                wt.created_at, wt.updated_at,
                COUNT(DISTINCT wtsr.id) AS set_count
         FROM workout_templates wt
         LEFT JOIN workout_template_set_refs wtsr ON wtsr.workout_template_id = wt.id
         GROUP BY wt.id ORDER BY wt.name"
    )
    .fetch_all(pool)
    .await
}

/// Returns all workout template rows without the set_count join — used by export.
pub async fn find_all_rows(pool: &SqlitePool) -> Result<Vec<WorkoutTemplateRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutTemplateRow,
        "SELECT id, name, notes, default_exercise_duration_sec, rest_between_sets_sec,
                created_at, updated_at
         FROM workout_templates ORDER BY name"
    )
    .fetch_all(pool)
    .await
}

pub async fn find_by_id(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<WorkoutTemplateRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutTemplateRow,
        "SELECT id, name, notes, default_exercise_duration_sec,
                rest_between_sets_sec, created_at, updated_at
         FROM workout_templates WHERE id = ?",
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
    default_duration_sec: i64,
    rest_sec: Option<i64>,
) -> Result<WorkoutTemplateRow, sqlx::Error> {
    sqlx::query_as!(
        WorkoutTemplateRow,
        "INSERT INTO workout_templates
             (id, name, notes, default_exercise_duration_sec, rest_between_sets_sec)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id, name, notes, default_exercise_duration_sec,
                   rest_between_sets_sec, created_at, updated_at",
        id,
        name,
        notes,
        default_duration_sec,
        rest_sec
    )
    .fetch_one(conn)
    .await
}

pub async fn update(
    conn: &mut SqliteConnection,
    id: &str,
    name: &str,
    notes: Option<&str>,
    default_duration_sec: i64,
    rest_sec: Option<i64>,
) -> Result<WorkoutTemplateRow, sqlx::Error> {
    sqlx::query_as!(
        WorkoutTemplateRow,
        "UPDATE workout_templates
         SET name = ?, notes = ?,
             default_exercise_duration_sec = ?, rest_between_sets_sec = ?
         WHERE id = ?
         RETURNING id, name, notes, default_exercise_duration_sec,
                   rest_between_sets_sec, created_at, updated_at",
        name,
        notes,
        default_duration_sec,
        rest_sec,
        id
    )
    .fetch_one(conn)
    .await
}

pub async fn delete(conn: &mut SqliteConnection, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM workout_templates WHERE id = ?", id)
        .execute(conn)
        .await?;
    Ok(())
}

// ── Set refs ────────────────────────────────────────────────────────────────

pub async fn find_set_refs(
    conn: &mut SqliteConnection,
    workout_id: &str,
) -> Result<Vec<WorkoutTemplateSetRefRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutTemplateSetRefRow,
        "SELECT wtsr.id, wtsr.workout_template_id, wtsr.set_template_id,
                wtsr.order_index, st.name AS set_name,
                wtsr.source_set_template_id,
                wtsr.created_at, wtsr.updated_at
         FROM workout_template_set_refs wtsr
         JOIN set_templates st ON st.id = wtsr.set_template_id
         WHERE wtsr.workout_template_id = ?
         ORDER BY wtsr.order_index",
        workout_id
    )
    .fetch_all(conn)
    .await
}

pub async fn find_set_ref_by_id(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<WorkoutTemplateSetRefRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutTemplateSetRefRow,
        "SELECT wtsr.id, wtsr.workout_template_id, wtsr.set_template_id,
                wtsr.order_index, st.name AS set_name,
                wtsr.source_set_template_id,
                wtsr.created_at, wtsr.updated_at
         FROM workout_template_set_refs wtsr
         JOIN set_templates st ON st.id = wtsr.set_template_id
         WHERE wtsr.id = ?",
        id
    )
    .fetch_optional(conn)
    .await
}

pub async fn next_set_ref_order_index(
    conn: &mut SqliteConnection,
    workout_id: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT COALESCE(MAX(order_index), -1) + 1 AS next_idx
         FROM workout_template_set_refs WHERE workout_template_id = ?",
        workout_id
    )
    .fetch_one(conn)
    .await?;
    Ok(row.next_idx)
}

pub async fn insert_set_ref(
    conn: &mut SqliteConnection,
    id: &str,
    workout_id: &str,
    set_id: &str,
    order_index: i64,
    source_set_template_id: Option<&str>,
) -> Result<WorkoutTemplateSetRefRow, sqlx::Error> {
    sqlx::query!(
        "INSERT INTO workout_template_set_refs
             (id, workout_template_id, set_template_id, order_index, source_set_template_id)
         VALUES (?, ?, ?, ?, ?)",
        id,
        workout_id,
        set_id,
        order_index,
        source_set_template_id
    )
    .execute(&mut *conn)
    .await?;

    find_set_ref_by_id(conn, id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_set_ref(conn: &mut SqliteConnection, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM workout_template_set_refs WHERE id = ?", id)
        .execute(conn)
        .await?;
    Ok(())
}

/// Phase 1 of two-phase reorder for set refs
pub async fn reorder_set_refs_phase1(
    conn: &mut SqliteConnection,
    workout_id: &str,
    ordered_ids: &[String],
) -> Result<(), sqlx::Error> {
    for (i, id) in ordered_ids.iter().enumerate() {
        let tmp = 1000 + i as i64;
        let rows = sqlx::query!(
            "UPDATE workout_template_set_refs SET order_index = ?
             WHERE id = ? AND workout_template_id = ?",
            tmp,
            id,
            workout_id
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

/// Phase 2 of two-phase reorder for set refs
pub async fn reorder_set_refs_phase2(
    conn: &mut SqliteConnection,
    workout_id: &str,
    ordered_ids: &[String],
) -> Result<(), sqlx::Error> {
    for (i, id) in ordered_ids.iter().enumerate() {
        let idx = i as i64;
        sqlx::query!(
            "UPDATE workout_template_set_refs SET order_index = ?
             WHERE id = ? AND workout_template_id = ?",
            idx,
            id,
            workout_id
        )
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

// ── Card assignments ─────────────────────────────────────────────────────────

pub async fn find_assignments_for_workout(
    conn: &mut SqliteConnection,
    workout_id: &str,
) -> Result<Vec<WorkoutTemplateCardAssignmentRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkoutTemplateCardAssignmentRow,
        "SELECT wtca.id, wtca.workout_template_set_ref_id, wtca.set_template_card_id,
                wtca.exercise_id, wtca.display_label, wtca.duration_hint_sec,
                wtca.notes, wtca.created_at, wtca.updated_at
         FROM workout_template_card_assignments wtca
         JOIN workout_template_set_refs wtsr
           ON wtsr.id = wtca.workout_template_set_ref_id
         WHERE wtsr.workout_template_id = ?",
        workout_id
    )
    .fetch_all(conn)
    .await
}

pub async fn upsert_assignment(
    conn: &mut SqliteConnection,
    id: &str,
    set_ref_id: &str,
    card_id: &str,
    exercise_id: Option<&str>,
    display_label: Option<&str>,
    duration_hint_sec: Option<i64>,
    notes: Option<&str>,
) -> Result<WorkoutTemplateCardAssignmentRow, sqlx::Error> {
    sqlx::query!(
        "INSERT INTO workout_template_card_assignments
             (id, workout_template_set_ref_id, set_template_card_id,
              exercise_id, display_label, duration_hint_sec, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (workout_template_set_ref_id, set_template_card_id)
         DO UPDATE SET
             exercise_id       = excluded.exercise_id,
             display_label     = excluded.display_label,
             duration_hint_sec = excluded.duration_hint_sec,
             notes             = excluded.notes",
        id,
        set_ref_id,
        card_id,
        exercise_id,
        display_label,
        duration_hint_sec,
        notes
    )
    .execute(&mut *conn)
    .await?;

    // Fetch the row that was inserted or updated
    sqlx::query_as!(
        WorkoutTemplateCardAssignmentRow,
        "SELECT id, workout_template_set_ref_id, set_template_card_id,
                exercise_id, display_label, duration_hint_sec,
                notes, created_at, updated_at
         FROM workout_template_card_assignments
         WHERE workout_template_set_ref_id = ? AND set_template_card_id = ?",
        set_ref_id,
        card_id
    )
    .fetch_one(conn)
    .await
}

pub async fn delete_assignment(conn: &mut SqliteConnection, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM workout_template_card_assignments WHERE id = ?", id)
        .execute(conn)
        .await?;
    Ok(())
}

/// Validate that card_id belongs to the set_template referenced by set_ref_id.
/// Returns Ok(()) if valid, Err if not.
pub async fn validate_card_belongs_to_ref(
    conn: &mut SqliteConnection,
    set_ref_id: &str,
    card_id: &str,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query!(
        "SELECT
           (SELECT set_template_id FROM workout_template_set_refs WHERE id = ?) AS ref_set_id,
           (SELECT set_template_id FROM set_template_cards WHERE id = ?) AS card_set_id",
        set_ref_id,
        card_id
    )
    .fetch_one(conn)
    .await?;

    match (row.ref_set_id, row.card_set_id) {
        (Some(r), Some(c)) if r == c => Ok(()),
        _ => Err(sqlx::Error::RowNotFound), // caller maps to Validation error
    }
}

pub async fn count_total_cards(
    conn: &mut SqliteConnection,
    workout_id: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT COUNT(stc.id) AS cnt
         FROM workout_template_set_refs wtsr
         JOIN set_template_cards stc ON stc.set_template_id = wtsr.set_template_id
         WHERE wtsr.workout_template_id = ?",
        workout_id
    )
    .fetch_one(conn)
    .await?;
    Ok(row.cnt)
}
