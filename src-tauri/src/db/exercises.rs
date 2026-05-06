use crate::domain::types::{
    CatalogSourceSummary, ExerciseCardRef, ExerciseMeta, ExerciseMuscleInput, ExerciseRow,
    ExerciseSearchFilters,
};
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::collections::HashMap;

// ── Column list shared by all SELECT / RETURNING queries ─────────────────────
// Must stay in sync with ExerciseRow field order.

pub async fn find_all(pool: &SqlitePool) -> Result<Vec<ExerciseRow>, sqlx::Error> {
    sqlx::query_as!(
        ExerciseRow,
        "SELECT id, name, notes, image_url,
                catalog_source, catalog_id, is_catalog,
                category, equipment, level, mechanic, force, instructions_json,
                sanskrit_name,
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
                sanskrit_name,
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
             category, equipment, level, mechanic, force, instructions_json,
             sanskrit_name
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, name, notes, image_url,
                   catalog_source, catalog_id, is_catalog,
                   category, equipment, level, mechanic, force, instructions_json,
                   sanskrit_name,
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
        meta.instructions_json,
        meta.sanskrit_name
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
                   sanskrit_name,
                   created_at, updated_at",
        name,
        notes,
        id
    )
    .fetch_one(conn)
    .await
}

pub async fn update_meta(
    conn: &mut SqliteConnection,
    id: &str,
    meta: &ExerciseMeta,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE exercises
         SET category = ?, equipment = ?, level = ?, mechanic = ?, force = ?,
             instructions_json = ?, sanskrit_name = ?
         WHERE id = ?",
        meta.category,
        meta.equipment,
        meta.level,
        meta.mechanic,
        meta.force,
        meta.instructions_json,
        meta.sanskrit_name,
        id
    )
    .execute(conn)
    .await?;
    Ok(())
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
pub async fn fetch_all_tags(
    pool: &SqlitePool,
) -> Result<HashMap<String, Vec<String>>, sqlx::Error> {
    let rows = sqlx::query!("SELECT exercise_id, tag FROM exercise_tags ORDER BY exercise_id, tag")
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

// ── Catalog source helpers ────────────────────────────────────────────────────

/// Distinct catalog_source values across catalog exercises with row counts,
/// sorted by source ascending. Excludes user-created (`is_catalog = 0`) rows
/// and rows with NULL catalog_source.
pub async fn list_catalog_sources(
    pool: &SqlitePool,
) -> Result<Vec<CatalogSourceSummary>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT catalog_source AS "source!: String", COUNT(*) AS "count!: i64"
           FROM exercises
           WHERE is_catalog = 1 AND catalog_source IS NOT NULL
           GROUP BY catalog_source
           ORDER BY catalog_source ASC"#
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| CatalogSourceSummary {
            source: r.source,
            count: r.count,
        })
        .collect())
}

// ── Pose-type helpers ─────────────────────────────────────────────────────────

/// Fetch pose types for all exercises in one query.
/// Returns a map from exercise_id to sorted pose type list.
pub async fn fetch_all_pose_types(
    pool: &SqlitePool,
) -> Result<HashMap<String, Vec<String>>, sqlx::Error> {
    let rows = sqlx::query!(
        "SELECT exercise_id, pose_type
         FROM exercise_pose_types
         ORDER BY exercise_id, pose_type"
    )
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for r in rows {
        map.entry(r.exercise_id).or_default().push(r.pose_type);
    }
    Ok(map)
}

/// Fetch sorted pose types for a single exercise.
pub async fn fetch_pose_types_for_exercise(
    conn: &mut SqliteConnection,
    exercise_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query!(
        "SELECT pose_type FROM exercise_pose_types
         WHERE exercise_id = ? ORDER BY pose_type",
        exercise_id
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows.into_iter().map(|r| r.pose_type).collect())
}

/// Replace all pose-type rows for an exercise with the given slice.
/// Must be called within the caller's transaction.
pub async fn set_pose_types(
    conn: &mut SqliteConnection,
    exercise_id: &str,
    pose_types: &[String],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM exercise_pose_types WHERE exercise_id = ?",
        exercise_id
    )
    .execute(&mut *conn)
    .await?;

    for pt in pose_types {
        sqlx::query!(
            "INSERT INTO exercise_pose_types (exercise_id, pose_type) VALUES (?, ?)",
            exercise_id,
            pt
        )
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Fetch pose types for a specific set of exercise IDs.
pub async fn fetch_pose_types_for_ids(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<HashMap<String, Vec<String>>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT exercise_id, pose_type FROM exercise_pose_types
         WHERE exercise_id IN ({}) ORDER BY exercise_id, pose_type",
        placeholders
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    let rows = query.fetch_all(pool).await?;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for r in rows {
        let eid: String = r.get("exercise_id");
        let pt: String = r.get("pose_type");
        map.entry(eid).or_default().push(pt);
    }
    Ok(map)
}

// ── Search ───────────────────────────────────────────────────────────────────

fn escape_like(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

pub async fn search(
    pool: &SqlitePool,
    filters: &ExerciseSearchFilters,
    limit: i64,
    offset: i64,
) -> Result<(Vec<ExerciseRow>, i64), sqlx::Error> {
    let mut where_clauses: Vec<String> = Vec::new();
    let mut params: Vec<String> = Vec::new();

    if let Some(q) = &filters.query {
        if !q.is_empty() {
            // Match either English name OR sanskrit_name (NULL-safe via the
            // single bound param; SQLite returns NULL for LIKE on NULL which
            // is treated as false in the OR).
            let pos = params.len() + 1;
            where_clauses.push(format!(
                "(LOWER(e.name) LIKE LOWER(?{pos}) ESCAPE '\\' \
                  OR LOWER(e.sanskrit_name) LIKE LOWER(?{pos}) ESCAPE '\\')"
            ));
            params.push(format!("%{}%", escape_like(q)));
        }
    }

    match filters.source.as_deref() {
        Some("user") => where_clauses.push("e.is_catalog = 0".to_string()),
        Some("catalog") => where_clauses.push("e.is_catalog = 1".to_string()),
        _ => {}
    }

    if let Some(v) = &filters.catalog_source {
        // Specific catalog filter implies catalog rows.
        where_clauses.push("e.is_catalog = 1".to_string());
        where_clauses.push(format!("e.catalog_source = ?{}", params.len() + 1));
        params.push(v.clone());
    }

    if let Some(v) = &filters.category {
        where_clauses.push(format!("e.category = ?{}", params.len() + 1));
        params.push(v.clone());
    }
    if let Some(v) = &filters.equipment {
        where_clauses.push(format!("e.equipment = ?{}", params.len() + 1));
        params.push(v.clone());
    }
    if let Some(v) = &filters.level {
        where_clauses.push(format!("e.level = ?{}", params.len() + 1));
        params.push(v.clone());
    }
    if let Some(v) = &filters.force {
        where_clauses.push(format!("e.force = ?{}", params.len() + 1));
        params.push(v.clone());
    }

    let mut joins = String::new();
    if let Some(muscle) = &filters.primary_muscle {
        joins
            .push_str(" JOIN exercise_muscles em ON em.exercise_id = e.id AND em.role = 'primary'");
        where_clauses.push(format!("em.muscle = ?{}", params.len() + 1));
        params.push(muscle.clone());
    }
    if let Some(tag) = &filters.tag {
        joins.push_str(" JOIN exercise_tags et ON et.exercise_id = e.id");
        where_clauses.push(format!("et.tag = ?{}", params.len() + 1));
        params.push(tag.clone());
    }
    if let Some(pose_type) = &filters.pose_type {
        joins.push_str(" JOIN exercise_pose_types ept ON ept.exercise_id = e.id");
        where_clauses.push(format!("ept.pose_type = ?{}", params.len() + 1));
        params.push(pose_type.clone());
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_clauses.join(" AND "))
    };

    let count_sql =
        format!("SELECT COUNT(DISTINCT e.id) as cnt FROM exercises e{joins}{where_sql}");
    let data_sql = format!(
        "SELECT DISTINCT e.id, e.name, e.notes, e.image_url,
                e.catalog_source, e.catalog_id, e.is_catalog,
                e.category, e.equipment, e.level, e.mechanic, e.force, e.instructions_json,
                e.sanskrit_name,
                e.created_at, e.updated_at
         FROM exercises e{joins}{where_sql}
         ORDER BY e.name COLLATE NOCASE ASC, e.id ASC
         LIMIT ?{limit_pos} OFFSET ?{offset_pos}",
        limit_pos = params.len() + 1,
        offset_pos = params.len() + 2,
    );

    // Build and execute count query
    let mut count_query = sqlx::query(&count_sql);
    for p in &params {
        count_query = count_query.bind(p);
    }
    let total: i64 = count_query.fetch_one(pool).await?.get("cnt");

    // Build and execute data query
    let mut data_query = sqlx::query_as::<_, ExerciseRow>(&data_sql);
    for p in &params {
        data_query = data_query.bind(p);
    }
    data_query = data_query.bind(limit).bind(offset);

    let rows = data_query.fetch_all(pool).await?;
    Ok((rows, total))
}

/// Fetch tags for a specific set of exercise IDs.
pub async fn fetch_tags_for_ids(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<HashMap<String, Vec<String>>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT exercise_id, tag FROM exercise_tags WHERE exercise_id IN ({}) ORDER BY exercise_id, tag",
        placeholders
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    let rows = query.fetch_all(pool).await?;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for r in rows {
        let eid: String = r.get("exercise_id");
        let tag: String = r.get("tag");
        map.entry(eid).or_default().push(tag);
    }
    Ok(map)
}

/// Fetch muscles for a specific set of exercise IDs.
pub async fn fetch_muscles_for_ids(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<HashMap<String, (Vec<String>, Vec<String>)>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT exercise_id, muscle, role FROM exercise_muscles WHERE exercise_id IN ({}) ORDER BY exercise_id, role, muscle",
        placeholders
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    let rows = query.fetch_all(pool).await?;
    let mut map: HashMap<String, (Vec<String>, Vec<String>)> = HashMap::new();
    for r in rows {
        let eid: String = r.get("exercise_id");
        let muscle: String = r.get("muscle");
        let role: String = r.get("role");
        let entry = map.entry(eid).or_default();
        if role == "primary" {
            entry.0.push(muscle);
        } else {
            entry.1.push(muscle);
        }
    }
    Ok(map)
}
