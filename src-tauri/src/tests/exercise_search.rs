use crate::{
    domain::exercise,
    domain::types::{ExerciseMeta, ExerciseMuscleInput, ExerciseSearchFilters},
    error::AppError,
};
use sqlx::SqlitePool;

fn catalog_meta(
    id: &str,
    category: &str,
    equipment: &str,
    level: &str,
    force: &str,
) -> ExerciseMeta {
    ExerciseMeta {
        catalog_source: Some("free-exercise-db".to_string()),
        catalog_id: Some(id.to_string()),
        is_catalog: true,
        category: Some(category.to_string()),
        equipment: Some(equipment.to_string()),
        level: Some(level.to_string()),
        mechanic: Some("compound".to_string()),
        force: Some(force.to_string()),
        instructions_json: None,
    }
}

fn muscles(pairs: &[(&str, &str)]) -> Vec<ExerciseMuscleInput> {
    pairs
        .iter()
        .map(|(m, r)| ExerciseMuscleInput {
            muscle: m.to_string(),
            role: r.to_string(),
        })
        .collect()
}

async fn seed_exercises(pool: &SqlitePool) {
    exercise::create(
        pool,
        "Barbell Bench Press",
        None,
        &["push".to_string()],
        Some(&catalog_meta(
            "bench_press",
            "strength",
            "barbell",
            "intermediate",
            "push",
        )),
        Some(&muscles(&[("chest", "primary"), ("triceps", "secondary")])),
    )
    .await
    .unwrap();

    exercise::create(
        pool,
        "Dumbbell Curl",
        None,
        &["pull".to_string()],
        Some(&catalog_meta(
            "dumbbell_curl",
            "strength",
            "dumbbell",
            "beginner",
            "pull",
        )),
        Some(&muscles(&[
            ("biceps", "primary"),
            ("forearms", "secondary"),
        ])),
    )
    .await
    .unwrap();

    exercise::create(
        pool,
        "Bodyweight Squat",
        None,
        &["legs".to_string()],
        Some(&catalog_meta(
            "bw_squat",
            "strength",
            "body only",
            "beginner",
            "push",
        )),
        Some(&muscles(&[
            ("quadriceps", "primary"),
            ("glutes", "secondary"),
        ])),
    )
    .await
    .unwrap();

    // User-created exercise (not catalog)
    exercise::create(
        pool,
        "My Custom Press",
        Some("personal variation"),
        &["push".to_string(), "core".to_string()],
        None,
        Some(&muscles(&[("shoulders", "primary")])),
    )
    .await
    .unwrap();
}

// ── Query search: case-insensitive substring ─────────────────────────────────

#[sqlx::test]
async fn test_search_query_case_insensitive(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            query: Some("bench".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.exercises.len(), 1);
    assert_eq!(result.exercises[0].name, "Barbell Bench Press");
    assert_eq!(result.total, 1);
}

#[sqlx::test]
async fn test_search_query_substring(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            query: Some("bell".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 2); // Barbell Bench Press + Dumbbell Curl
}

#[sqlx::test]
async fn test_search_query_treats_like_wildcards_literally(pool: SqlitePool) {
    exercise::create(
        &pool,
        "100% Hold",
        None,
        &[],
        None,
        Some(&muscles(&[("shoulders", "primary")])),
    )
    .await
    .unwrap();
    seed_exercises(&pool).await;

    let percent_result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            query: Some("%".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(percent_result.total, 1);
    assert_eq!(percent_result.exercises[0].name, "100% Hold");

    let underscore_result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            query: Some("_".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(underscore_result.total, 0);
}

// ── Source filter ────────────────────────────────────────────────────────────

#[sqlx::test]
async fn test_search_source_user(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            source: Some("user".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 1);
    assert_eq!(result.exercises[0].name, "My Custom Press");
}

#[sqlx::test]
async fn test_search_source_catalog(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            source: Some("catalog".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 3);
}

#[sqlx::test]
async fn test_search_source_all(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            source: Some("all".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 4);
}

// ── Category/equipment/level/force filters ───────────────────────────────────

#[sqlx::test]
async fn test_search_category_filter(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            category: Some("strength".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 3);
}

#[sqlx::test]
async fn test_search_equipment_filter(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            equipment: Some("barbell".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 1);
    assert_eq!(result.exercises[0].name, "Barbell Bench Press");
}

#[sqlx::test]
async fn test_search_level_filter(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            level: Some("beginner".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 2);
}

#[sqlx::test]
async fn test_search_force_filter(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            force: Some("pull".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 1);
    assert_eq!(result.exercises[0].name, "Dumbbell Curl");
}

// ── Primary muscle filter ────────────────────────────────────────────────────

#[sqlx::test]
async fn test_search_primary_muscle(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            primary_muscle: Some("chest".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 1);
    assert_eq!(result.exercises[0].name, "Barbell Bench Press");
}

#[sqlx::test]
async fn test_search_primary_muscle_excludes_secondary(pool: SqlitePool) {
    seed_exercises(&pool).await;
    // triceps is secondary on bench press, should not match primary filter
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            primary_muscle: Some("triceps".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 0);
}

// ── Tag filter ───────────────────────────────────────────────────────────────

#[sqlx::test]
async fn test_search_tag(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            tag: Some("push".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 2); // Bench Press + My Custom Press
}

#[sqlx::test]
async fn test_search_tag_core(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            tag: Some("core".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 1);
    assert_eq!(result.exercises[0].name, "My Custom Press");
}

// ── Combined filters (AND semantics) ─────────────────────────────────────────

#[sqlx::test]
async fn test_search_combined_and(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            source: Some("catalog".to_string()),
            force: Some("push".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    // Bench Press (push, catalog) + Bodyweight Squat (push, catalog)
    assert_eq!(result.total, 2);
}

#[sqlx::test]
async fn test_search_combined_narrows(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            source: Some("catalog".to_string()),
            force: Some("push".to_string()),
            equipment: Some("barbell".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.total, 1);
    assert_eq!(result.exercises[0].name, "Barbell Bench Press");
}

// ── Default limit / explicit limit ───────────────────────────────────────────

#[sqlx::test]
async fn test_search_default_limit(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(&pool, &ExerciseSearchFilters::default())
        .await
        .unwrap();
    assert_eq!(result.exercises.len(), 4);
    assert_eq!(result.total, 4);
}

#[sqlx::test]
async fn test_search_explicit_limit(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            limit: Some(2),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.exercises.len(), 2);
    assert_eq!(result.total, 4);
}

#[sqlx::test]
async fn test_search_offset(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            limit: Some(2),
            offset: Some(2),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.exercises.len(), 2);
    assert_eq!(result.total, 4);
}

// ── Validation errors ────────────────────────────────────────────────────────

#[sqlx::test]
async fn test_search_invalid_source(pool: SqlitePool) {
    let err = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            source: Some("invalid".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap_err();
    match err {
        AppError::Validation(msg) => assert!(msg.contains("invalid source")),
        _ => panic!("expected validation error"),
    }
}

#[sqlx::test]
async fn test_search_invalid_category(pool: SqlitePool) {
    let err = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            category: Some("nonexistent".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap_err();
    match err {
        AppError::Validation(msg) => assert!(msg.contains("invalid category")),
        _ => panic!("expected validation error"),
    }
}

#[sqlx::test]
async fn test_search_invalid_equipment(pool: SqlitePool) {
    let err = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            equipment: Some("nonexistent".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap_err();
    match err {
        AppError::Validation(msg) => assert!(msg.contains("invalid equipment")),
        _ => panic!("expected validation error"),
    }
}

#[sqlx::test]
async fn test_search_invalid_muscle(pool: SqlitePool) {
    let err = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            primary_muscle: Some("nonexistent".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap_err();
    match err {
        AppError::Validation(msg) => assert!(msg.contains("invalid primary_muscle")),
        _ => panic!("expected validation error"),
    }
}

#[sqlx::test]
async fn test_search_invalid_tag(pool: SqlitePool) {
    let err = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            tag: Some("nonexistent".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap_err();
    match err {
        AppError::Validation(msg) => assert!(msg.contains("invalid tag")),
        _ => panic!("expected validation error"),
    }
}

// ── Result includes tags and muscles ─────────────────────────────────────────

#[sqlx::test]
async fn test_search_includes_tags_and_muscles(pool: SqlitePool) {
    seed_exercises(&pool).await;
    let result = exercise::search(
        &pool,
        &ExerciseSearchFilters {
            query: Some("Barbell Bench".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(result.exercises.len(), 1);
    let ex = &result.exercises[0];
    assert_eq!(ex.tags, vec!["push"]);
    assert_eq!(ex.primary_muscles, vec!["chest"]);
    assert_eq!(ex.secondary_muscles, vec!["triceps"]);
}
