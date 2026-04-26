use std::collections::HashMap;
use sqlx::{SqliteConnection, SqlitePool};
use crate::domain::types::{ExerciseRow, ExerciseCardRef};

pub async fn find_all(pool: &SqlitePool) -> Result<Vec<ExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        ExerciseRow,
        "SELECT id, name, notes, image_url, created_at, updated_at
         FROM exercises ORDER BY name"
    )
    .fetch_all(pool)
    .await
}

pub async fn find_by_id(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<ExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        ExerciseRow,
        "SELECT id, name, notes, image_url, created_at, updated_at
         FROM exercises WHERE id = ?",
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
) -> Result<ExerciseRow, sqlx::Error> {
    sqlx::query_as!(
        ExerciseRow,
        "INSERT INTO exercises (id, name, notes)
         VALUES (?, ?, ?)
         RETURNING id, name, notes, image_url, created_at, updated_at",
        id,
        name,
        notes
    )
    .fetch_one(conn)
    .await
}

pub async fn update(
    conn: &mut SqliteConnection,
    id: &str,
    name: &str,
    notes: Option<&str>,
) -> Result<ExerciseRow, sqlx::Error> {
    sqlx::query_as!(
        ExerciseRow,
        "UPDATE exercises SET name = ?, notes = ?
         WHERE id = ?
         RETURNING id, name, notes, image_url, created_at, updated_at",
        name,
        notes,
        id
    )
    .fetch_one(conn)
    .await
}

pub async fn delete(conn: &mut SqliteConnection, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM exercises WHERE id = ?", id)
        .execute(conn)
        .await?;
    Ok(())
}

pub async fn find_referencing_cards(
    conn: &mut SqliteConnection,
    exercise_id: &str,
) -> Result<Vec<ExerciseCardRef>, sqlx::Error> {
    sqlx::query_as!(
        ExerciseCardRef,
        "SELECT stc.id AS card_id, st.name AS set_name
         FROM set_template_cards stc
         JOIN set_templates st ON st.id = stc.set_template_id
         WHERE stc.exercise_id = ?",
        exercise_id
    )
    .fetch_all(conn)
    .await
}

pub async fn convert_cards_to_placeholder(
    conn: &mut SqliteConnection,
    exercise_id: &str,
    exercise_name: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE set_template_cards
         SET card_type = 'placeholder',
             exercise_id = NULL,
             placeholder_tag = 'unspecified',
             placeholder_label = ?
         WHERE exercise_id = ?",
        exercise_name,
        exercise_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn null_assignment_exercise_ids(
    conn: &mut SqliteConnection,
    exercise_id: &str,
    exercise_name: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE workout_template_card_assignments
         SET exercise_id = NULL,
             display_label = COALESCE(display_label, ?)
         WHERE exercise_id = ?",
        exercise_name,
        exercise_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

// ── Tag helpers ───────────────────────────────────────────────────────────────

/// Fetch tags for a single exercise, ordered alphabetically.
pub async fn fetch_tags(
    conn: &mut SqliteConnection,
    exercise_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query!(
        "SELECT tag FROM exercise_tags WHERE exercise_id = ? ORDER BY tag",
        exercise_id
    )
    .fetch_all(conn)
    .await?;
    Ok(rows.into_iter().map(|r| r.tag).collect())
}

/// Fetch all tags for all exercises in one query.
/// Returns a map from exercise_id to sorted tag list.
pub async fn fetch_all_tags(pool: &SqlitePool) -> Result<HashMap<String, Vec<String>>, sqlx::Error> {
    let rows = sqlx::query!(
        "SELECT exercise_id, tag FROM exercise_tags ORDER BY exercise_id, tag"
    )
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for r in rows {
        map.entry(r.exercise_id).or_default().push(r.tag);
    }
    Ok(map)
}

/// Replace all tags for an exercise with the given slice.
/// Runs DELETE then INSERT within the caller's connection (use inside a transaction).
pub async fn set_tags(
    conn: &mut SqliteConnection,
    exercise_id: &str,
    tags: &[String],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM exercise_tags WHERE exercise_id = ?",
        exercise_id
    )
    .execute(&mut *conn)
    .await?;

    for tag in tags {
        sqlx::query!(
            "INSERT INTO exercise_tags (exercise_id, tag) VALUES (?, ?)",
            exercise_id,
            tag
        )
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}
