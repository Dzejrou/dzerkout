use crate::{
    db::exercises,
    domain::types::{
        CatalogSourceSummary, Exercise, ExerciseMeta, ExerciseMuscleInput, ExerciseReferences,
        ExerciseSearchFilters, ExerciseSearchResult, VALID_EXERCISE_CATEGORIES,
        VALID_EXERCISE_EQUIPMENT, VALID_EXERCISE_FORCES, VALID_EXERCISE_LEVELS,
        VALID_EXERCISE_MECHANICS, VALID_EXERCISE_MUSCLES, VALID_EXERCISE_POSE_TYPES,
        VALID_EXERCISE_TAGS,
    },
    error::AppError,
};
use sqlx::SqlitePool;
use uuid::Uuid;

// ── Validation ────────────────────────────────────────────────────────────────

fn validate_tags(tags: &[String]) -> Result<(), AppError> {
    for tag in tags {
        if !VALID_EXERCISE_TAGS.contains(&tag.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid exercise tag: '{}'. Valid tags: {}",
                tag,
                VALID_EXERCISE_TAGS.join(", ")
            )));
        }
    }
    Ok(())
}

fn validate_meta(meta: &ExerciseMeta) -> Result<(), AppError> {
    if let Some(v) = &meta.category {
        if !VALID_EXERCISE_CATEGORIES.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid category: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_CATEGORIES.join(", ")
            )));
        }
    }
    if let Some(v) = &meta.equipment {
        if !VALID_EXERCISE_EQUIPMENT.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid equipment: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_EQUIPMENT.join(", ")
            )));
        }
    }
    if let Some(v) = &meta.level {
        if !VALID_EXERCISE_LEVELS.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid level: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_LEVELS.join(", ")
            )));
        }
    }
    if let Some(v) = &meta.mechanic {
        if !VALID_EXERCISE_MECHANICS.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid mechanic: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_MECHANICS.join(", ")
            )));
        }
    }
    if let Some(v) = &meta.force {
        if !VALID_EXERCISE_FORCES.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid force: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_FORCES.join(", ")
            )));
        }
    }
    if let Some(json) = &meta.instructions_json {
        validate_instructions_json(json)?;
    }
    Ok(())
}

fn validate_pose_types(pose_types: &[String]) -> Result<(), AppError> {
    for pt in pose_types {
        if !VALID_EXERCISE_POSE_TYPES.contains(&pt.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid pose type: '{}'. Valid values: {}",
                pt,
                VALID_EXERCISE_POSE_TYPES.join(", ")
            )));
        }
    }
    Ok(())
}

fn validate_muscles(muscles: &[ExerciseMuscleInput]) -> Result<(), AppError> {
    for m in muscles {
        if !VALID_EXERCISE_MUSCLES.contains(&m.muscle.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid muscle: '{}'. Valid values: {}",
                m.muscle,
                VALID_EXERCISE_MUSCLES.join(", ")
            )));
        }
        if m.role != "primary" && m.role != "secondary" {
            return Err(AppError::Validation(format!(
                "invalid muscle role: '{}'. Must be 'primary' or 'secondary'",
                m.role
            )));
        }
    }
    Ok(())
}

fn validate_instructions_json(json: &str) -> Result<(), AppError> {
    match serde_json::from_str::<serde_json::Value>(json) {
        Ok(serde_json::Value::Array(arr)) => {
            for item in &arr {
                if !item.is_string() {
                    return Err(AppError::Validation(
                        "instructions_json must be an array of strings".into(),
                    ));
                }
            }
            Ok(())
        }
        Ok(_) => Err(AppError::Validation(
            "instructions_json must be a JSON array".into(),
        )),
        Err(_) => Err(AppError::Validation(
            "instructions_json is not valid JSON".into(),
        )),
    }
}

// ── Domain functions ──────────────────────────────────────────────────────────

pub async fn list(pool: &SqlitePool) -> Result<Vec<Exercise>, AppError> {
    let rows = exercises::find_all(pool).await?;
    let mut tags_map = exercises::fetch_all_tags(pool).await?;
    let mut muscles_map = exercises::fetch_all_muscles(pool).await?;
    let mut pose_types_map = exercises::fetch_all_pose_types(pool).await?;

    let result = rows
        .into_iter()
        .map(|row| {
            let tags = tags_map.remove(&row.id).unwrap_or_default();
            let (primary, secondary) = muscles_map.remove(&row.id).unwrap_or_default();
            let pose_types = pose_types_map.remove(&row.id).unwrap_or_default();
            Exercise::from_parts(row, tags, primary, secondary, pose_types)
        })
        .collect();

    Ok(result)
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Exercise, AppError> {
    let mut conn = pool.acquire().await?;
    let row = exercises::find_by_id(&mut conn, id)
        .await?
        .ok_or_else(|| AppError::NotFound(id.to_string()))?;
    drop(conn);

    let ids = vec![row.id.clone()];
    let mut tags_map = exercises::fetch_tags_for_ids(pool, &ids).await?;
    let mut muscles_map = exercises::fetch_muscles_for_ids(pool, &ids).await?;
    let mut pose_types_map = exercises::fetch_pose_types_for_ids(pool, &ids).await?;
    let tags = tags_map.remove(&row.id).unwrap_or_default();
    let (primary, secondary) = muscles_map.remove(&row.id).unwrap_or_default();
    let pose_types = pose_types_map.remove(&row.id).unwrap_or_default();

    Ok(Exercise::from_parts(row, tags, primary, secondary, pose_types))
}

pub async fn create(
    pool: &SqlitePool,
    name: &str,
    notes: Option<&str>,
    tags: &[String],
    meta: Option<&ExerciseMeta>,
    muscles: Option<&[ExerciseMuscleInput]>,
    pose_types: Option<&[String]>,
) -> Result<Exercise, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    validate_tags(tags)?;

    let default_meta = ExerciseMeta::default();
    let effective_meta = meta.unwrap_or(&default_meta);
    validate_meta(effective_meta)?;

    if let Some(ms) = muscles {
        validate_muscles(ms)?;
    }

    if let Some(pts) = pose_types {
        validate_pose_types(pts)?;
    }

    let id = Uuid::new_v4().to_string();
    let mut tx = pool.begin().await?;

    let row = exercises::insert(&mut tx, &id, name, notes, effective_meta)
        .await
        .map_err(|e| match &e {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                let msg = db.message();
                if msg.contains("catalog_source") || msg.contains("uq_exercises_catalog") {
                    AppError::Conflict(format!(
                        "Catalog exercise ({}/{}) already exists",
                        effective_meta.catalog_source.as_deref().unwrap_or(""),
                        effective_meta.catalog_id.as_deref().unwrap_or(""),
                    ))
                } else {
                    AppError::Conflict(format!("Exercise '{}' already exists", name))
                }
            }
            _ => e.into(),
        })?;

    exercises::set_tags(&mut tx, &id, tags).await?;

    if let Some(ms) = muscles {
        exercises::set_muscles(&mut tx, &id, ms).await?;
    }

    if let Some(pts) = pose_types {
        exercises::set_pose_types(&mut tx, &id, pts).await?;
    }

    tx.commit().await?;

    let (primary_muscles, secondary_muscles) =
        exercises::fetch_muscles_for_exercise(pool, &id).await?;
    let mut conn = pool.acquire().await?;
    let stored_pose_types = exercises::fetch_pose_types_for_exercise(&mut conn, &id).await?;
    drop(conn);

    let mut sorted_tags = tags.to_vec();
    sorted_tags.sort();
    Ok(Exercise::from_parts(
        row,
        sorted_tags,
        primary_muscles,
        secondary_muscles,
        stored_pose_types,
    ))
}

pub async fn update(
    pool: &SqlitePool,
    id: &str,
    name: &str,
    notes: Option<&str>,
    tags: &[String],
    meta: Option<&ExerciseMeta>,
    muscles: Option<&[ExerciseMuscleInput]>,
    pose_types: Option<&[String]>,
) -> Result<Exercise, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    validate_tags(tags)?;

    if let Some(m) = meta {
        validate_meta(m)?;
    }

    if let Some(ms) = muscles {
        validate_muscles(ms)?;
    }

    if let Some(pts) = pose_types {
        validate_pose_types(pts)?;
    }

    let mut tx = pool.begin().await?;

    let mut row = exercises::update(&mut tx, id, name, notes)
        .await
        .map_err(|e| match &e {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                AppError::Conflict(format!("Exercise '{}' already exists", name))
            }
            sqlx::Error::RowNotFound => AppError::NotFound(id.to_string()),
            _ => e.into(),
        })?;

    exercises::set_tags(&mut tx, id, tags).await?;

    if let Some(m) = meta {
        exercises::update_meta(&mut tx, id, m).await?;
        row.category = m.category.clone();
        row.equipment = m.equipment.clone();
        row.level = m.level.clone();
        row.mechanic = m.mechanic.clone();
        row.force = m.force.clone();
        row.instructions_json = m.instructions_json.clone();
    }

    if let Some(ms) = muscles {
        exercises::set_muscles(&mut tx, id, ms).await?;
    }

    if let Some(pts) = pose_types {
        exercises::set_pose_types(&mut tx, id, pts).await?;
    }

    tx.commit().await?;

    let (primary_muscles, secondary_muscles) =
        exercises::fetch_muscles_for_exercise(pool, id).await?;
    let mut conn = pool.acquire().await?;
    let stored_pose_types = exercises::fetch_pose_types_for_exercise(&mut conn, id).await?;
    drop(conn);

    let mut sorted_tags = tags.to_vec();
    sorted_tags.sort();
    Ok(Exercise::from_parts(
        row,
        sorted_tags,
        primary_muscles,
        secondary_muscles,
        stored_pose_types,
    ))
}

pub async fn get_references(pool: &SqlitePool, id: &str) -> Result<ExerciseReferences, AppError> {
    let mut conn = pool.acquire().await?;
    let cards = exercises::find_referencing_cards(&mut conn, id)
        .await
        .map_err(AppError::from)?;
    Ok(ExerciseReferences { cards })
}

const DEFAULT_SEARCH_LIMIT: i64 = 80;
const MAX_SEARCH_LIMIT: i64 = 200;

fn validate_search_filters(filters: &ExerciseSearchFilters) -> Result<(), AppError> {
    if let Some(limit) = filters.limit {
        if limit <= 0 {
            return Err(AppError::Validation(format!(
                "invalid limit: {limit}; must be a positive integer"
            )));
        }
    }
    if let Some(offset) = filters.offset {
        if offset < 0 {
            return Err(AppError::Validation(format!(
                "invalid offset: {offset}; must be a non-negative integer"
            )));
        }
    }
    if let Some(src) = &filters.source {
        match src.as_str() {
            "all" | "user" | "catalog" => {}
            _ => {
                return Err(AppError::Validation(format!(
                    "invalid source: '{}'. Valid values: all, user, catalog",
                    src
                )));
            }
        }
    }

    // catalog_source narrows to catalog rows; combining with source="user"
    // is contradictory and rejected to surface the bug at the API boundary.
    if let Some(cs) = &filters.catalog_source {
        if cs.trim().is_empty() {
            return Err(AppError::Validation(
                "catalog_source must not be an empty string".into(),
            ));
        }
        if filters.source.as_deref() == Some("user") {
            return Err(AppError::Validation(
                "catalog_source cannot be combined with source='user'".into(),
            ));
        }
    }
    if let Some(v) = &filters.category {
        if !VALID_EXERCISE_CATEGORIES.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid category: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_CATEGORIES.join(", ")
            )));
        }
    }
    if let Some(v) = &filters.equipment {
        if !VALID_EXERCISE_EQUIPMENT.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid equipment: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_EQUIPMENT.join(", ")
            )));
        }
    }
    if let Some(v) = &filters.level {
        if !VALID_EXERCISE_LEVELS.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid level: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_LEVELS.join(", ")
            )));
        }
    }
    if let Some(v) = &filters.force {
        if !VALID_EXERCISE_FORCES.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid force: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_FORCES.join(", ")
            )));
        }
    }
    if let Some(v) = &filters.primary_muscle {
        if !VALID_EXERCISE_MUSCLES.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid primary_muscle: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_MUSCLES.join(", ")
            )));
        }
    }
    if let Some(v) = &filters.tag {
        if !VALID_EXERCISE_TAGS.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid tag: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_TAGS.join(", ")
            )));
        }
    }
    if let Some(v) = &filters.pose_type {
        if !VALID_EXERCISE_POSE_TYPES.contains(&v.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid pose_type: '{}'. Valid values: {}",
                v,
                VALID_EXERCISE_POSE_TYPES.join(", ")
            )));
        }
    }
    Ok(())
}

pub async fn search(
    pool: &SqlitePool,
    filters: &ExerciseSearchFilters,
) -> Result<ExerciseSearchResult, AppError> {
    validate_search_filters(filters)?;

    let effective_filters = ExerciseSearchFilters {
        source: match filters.source.as_deref() {
            Some("all") => None,
            _ => filters.source.clone(),
        },
        ..filters.clone()
    };

    let limit = filters
        .limit
        .unwrap_or(DEFAULT_SEARCH_LIMIT)
        .min(MAX_SEARCH_LIMIT)
        .max(1);
    let offset = filters.offset.unwrap_or(0).max(0);

    let (rows, total) = exercises::search(pool, &effective_filters, limit, offset).await?;

    let ids: Vec<String> = rows.iter().map(|r| r.id.clone()).collect();
    let mut tags_map = exercises::fetch_tags_for_ids(pool, &ids).await?;
    let mut muscles_map = exercises::fetch_muscles_for_ids(pool, &ids).await?;
    let mut pose_types_map = exercises::fetch_pose_types_for_ids(pool, &ids).await?;

    let result = rows
        .into_iter()
        .map(|row| {
            let tags = tags_map.remove(&row.id).unwrap_or_default();
            let (primary, secondary) = muscles_map.remove(&row.id).unwrap_or_default();
            let pose_types = pose_types_map.remove(&row.id).unwrap_or_default();
            Exercise::from_parts(row, tags, primary, secondary, pose_types)
        })
        .collect();

    Ok(ExerciseSearchResult {
        exercises: result,
        total,
    })
}

pub async fn list_catalog_sources(
    pool: &SqlitePool,
) -> Result<Vec<CatalogSourceSummary>, AppError> {
    Ok(exercises::list_catalog_sources(pool).await?)
}

pub async fn delete_with_unlink(
    pool: &SqlitePool,
    id: &str,
    confirmed: bool,
) -> Result<(), AppError> {
    if !confirmed {
        return Err(AppError::Validation(
            "deletion requires explicit confirmation".into(),
        ));
    }

    let mut tx = pool.begin().await?;

    // 1. Get exercise name for fallback labels
    let exercise = exercises::find_by_id(&mut tx, id)
        .await?
        .ok_or_else(|| AppError::NotFound(id.to_string()))?;

    // 2. Convert referencing concrete cards to placeholders
    exercises::convert_cards_to_placeholder(&mut tx, id, &exercise.name).await?;

    // 3. Null exercise_id on assignments; preserve or set display_label
    exercises::null_assignment_exercise_ids(&mut tx, id, &exercise.name).await?;

    // 4. Delete exercise — CASCADE DELETE removes exercise_tags and exercise_muscles rows
    exercises::delete(&mut tx, id).await?;

    tx.commit().await?;
    Ok(())
}
