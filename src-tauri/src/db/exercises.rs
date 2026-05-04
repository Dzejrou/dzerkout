use std::collections::HashMap;
use sqlx::{SqliteConnection, SqlitePool};
use crate::domain::types::{ExerciseRow, ExerciseCardRef, ExerciseMeta, ExerciseMuscleInput};

// ── Column list shared by all SELECT / RETURNING queries ─────────────────────
// Must stay in sync with ExerciseRow field order.

pub async fn find_all(pool: &SqlitePool) -> Result<Vec<ExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        ExerciseRow,
        "SELECT id, name, notes, image_url,
                catalog_source, catalog_id, is_catalog,
                category, equipment, level, mechanic, force, instructions_json,
                created_at, updated_at
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
        "SELECT id, name, notes, image_url,
                catalog_source, catalog_id, is_catalog,
                category, equipment, level, mechanic, force, instructions_json,
                created_at, updated_at
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
    meta: &ExerciseMeta,
) -> Result<ExerciseRow, sqlx::Error> {
    let is_catalog = meta.is_catalog as i64;
    sqlx::query_as!(
        ExerciseRow,
        "INSERT INTO exercises (
             id, name, notes,
             catalog_source, catalog_id, is_catalog,
             category, equipment, level, mechanic, force, instructions_json
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, name, notes, image_url,
                   catalog_source, catalog_id, is_catalog,
                   category, equipment, level, mechanic, force, instructions_json,
                   created_at, updated_at",
        id,
        name,
        notes,
        meta.catalog_source,
        meta.catalog_id,
        is_catalog,
        meta.category,
        meta.equipment,
        meta.level,
        meta.mechanic,
        meta.force,
        meta.instructions_json
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
         RETURNING id, name, notes, image_url,
                   catalog_source, catalog_id, is_catalog,
                   category, equipment, level, mechanic, force, instructions_json,
                   created_at, updated_at",
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

// ── Muscle helpers ────────────────────────────────────────────────────────────

/// Fetch primary and secondary muscles for all exercises in one query.
/// Returns a map from exercise_id to (primary_muscles, secondary_muscles).
pub async fn fetch_all_muscles(
    pool: &SqlitePool,
) -> Result<HashMap<String, (Vec<String>, Vec<String>)>, sqlx::Error> {
    let rows = sqlx::query!(
        "SELECT exercise_id, muscle, role
         FROM exercise_muscles
         ORDER BY exercise_id, role, muscle"
    )
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<String, (Vec<String>, Vec<String>)> = HashMap::new();
    for r in rows {
        let entry = map.entry(r.exercise_id).or_default();
        if r.role == "primary" {
            entry.0.push(r.muscle);
        } else {
            entry.1.push(r.muscle);
        }
    }
    Ok(map)
}

/// Fetch primary and secondary muscles for a single exercise.
pub async fn fetch_muscles_for_exercise(
    pool: &SqlitePool,
    exercise_id: &str,
) -> Result<(Vec<String>, Vec<String>), sqlx::Error> {
    let rows = sqlx::query!(
        "SELECT muscle, role
         FROM exercise_muscles
         WHERE exercise_id = ?
         ORDER BY role, muscle",
        exercise_id
    )
    .fetch_all(pool)
    .await?;

    let mut primary = Vec::new();
    let mut secondary = Vec::new();
    for r in rows {
        if r.role == "primary" {
            primary.push(r.muscle);
        } else {
            secondary.push(r.muscle);
        }
    }
    Ok((primary, secondary))
}

/// Replace all muscle rows for an exercise with the given slice.
/// Must be called within the caller's transaction.
pub async fn set_muscles(
    conn: &mut SqliteConnection,
    exercise_id: &str,
    muscles: &[ExerciseMuscleInput],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM exercise_muscles WHERE exercise_id = ?",
        exercise_id
    )
    .execute(&mut *conn)
    .await?;

    for m in muscles {
        sqlx::query!(
            "INSERT INTO exercise_muscles (exercise_id, muscle, role) VALUES (?, ?, ?)",
            exercise_id,
            m.muscle,
            m.role
        )
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}
