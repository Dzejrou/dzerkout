use sqlx::SqlitePool;
use uuid::Uuid;
use crate::{
    db::exercises,
    domain::types::{
        Exercise, ExerciseMeta, ExerciseMuscleInput, ExerciseReferences,
        VALID_EXERCISE_CATEGORIES, VALID_EXERCISE_EQUIPMENT, VALID_EXERCISE_FORCES,
        VALID_EXERCISE_LEVELS, VALID_EXERCISE_MECHANICS, VALID_EXERCISE_MUSCLES,
        VALID_EXERCISE_TAGS,
    },
    error::AppError,
};

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

    let result = rows
        .into_iter()
        .map(|row| {
            let tags = tags_map.remove(&row.id).unwrap_or_default();
            let (primary, secondary) = muscles_map.remove(&row.id).unwrap_or_default();
            Exercise::from_parts(row, tags, primary, secondary)
        })
        .collect();

    Ok(result)
}

pub async fn create(
    pool: &SqlitePool,
    name: &str,
    notes: Option<&str>,
    tags: &[String],
    meta: Option<&ExerciseMeta>,
    muscles: Option<&[ExerciseMuscleInput]>,
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

    tx.commit().await?;

    let (primary_muscles, secondary_muscles) =
        exercises::fetch_muscles_for_exercise(pool, &id).await?;

    let mut sorted_tags = tags.to_vec();
    sorted_tags.sort();
    Ok(Exercise::from_parts(row, sorted_tags, primary_muscles, secondary_muscles))
}

pub async fn update(
    pool: &SqlitePool,
    id: &str,
    name: &str,
    notes: Option<&str>,
    tags: &[String],
    muscles: Option<&[ExerciseMuscleInput]>,
) -> Result<Exercise, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    validate_tags(tags)?;

    if let Some(ms) = muscles {
        validate_muscles(ms)?;
    }

    let mut tx = pool.begin().await?;

    let row = exercises::update(&mut tx, id, name, notes)
        .await
        .map_err(|e| match &e {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                AppError::Conflict(format!("Exercise '{}' already exists", name))
            }
            sqlx::Error::RowNotFound => AppError::NotFound(id.to_string()),
            _ => e.into(),
        })?;

    exercises::set_tags(&mut tx, id, tags).await?;

    if let Some(ms) = muscles {
        exercises::set_muscles(&mut tx, id, ms).await?;
    }

    tx.commit().await?;

    let (primary_muscles, secondary_muscles) =
        exercises::fetch_muscles_for_exercise(pool, id).await?;

    let mut sorted_tags = tags.to_vec();
    sorted_tags.sort();
    Ok(Exercise::from_parts(row, sorted_tags, primary_muscles, secondary_muscles))
}

pub async fn get_references(
    pool: &SqlitePool,
    id: &str,
) -> Result<ExerciseReferences, AppError> {
    let mut conn = pool.acquire().await?;
    let cards = exercises::find_referencing_cards(&mut conn, id)
        .await
        .map_err(AppError::from)?;
    Ok(ExerciseReferences { cards })
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
