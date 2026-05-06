// Integration tests for exercise catalog metadata and muscles.
// Each test gets a fresh in-memory SQLite with all migrations applied.

use sqlx::SqlitePool;
use crate::{
    domain::exercise,
    domain::types::{ExerciseMeta, ExerciseMuscleInput},
    error::AppError,
};

fn meta(
    catalog_source: &str,
    catalog_id: &str,
    category: &str,
    equipment: &str,
    level: &str,
    mechanic: &str,
    force: &str,
) -> ExerciseMeta {
    ExerciseMeta {
        catalog_source: Some(catalog_source.to_string()),
        catalog_id: Some(catalog_id.to_string()),
        is_catalog: true,
        category: Some(category.to_string()),
        equipment: Some(equipment.to_string()),
        level: Some(level.to_string()),
        mechanic: Some(mechanic.to_string()),
        force: Some(force.to_string()),
        instructions_json: Some(r#"["Lie flat.", "Press the bar."]"#.to_string()),
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

// ── create with full catalog metadata and muscles ─────────────────────────────

#[sqlx::test]
async fn test_create_exercise_with_catalog_meta_and_muscles(pool: SqlitePool) {
    let m = meta("free-exercise-db", "Barbell_Bench_Press", "strength", "barbell", "beginner", "compound", "push");
    let ms = muscles(&[("chest", "primary"), ("triceps", "secondary"), ("shoulders", "secondary")]);

    let ex = exercise::create(&pool, "Barbell Bench Press", None, &[], Some(&m), Some(&ms), None)
        .await
        .unwrap();

    assert_eq!(ex.name, "Barbell Bench Press");
    assert_eq!(ex.catalog_source.as_deref(), Some("free-exercise-db"));
    assert_eq!(ex.catalog_id.as_deref(), Some("Barbell_Bench_Press"));
    assert!(ex.is_catalog);
    assert_eq!(ex.category.as_deref(), Some("strength"));
    assert_eq!(ex.equipment.as_deref(), Some("barbell"));
    assert_eq!(ex.level.as_deref(), Some("beginner"));
    assert_eq!(ex.mechanic.as_deref(), Some("compound"));
    assert_eq!(ex.force.as_deref(), Some("push"));
    assert!(ex.instructions_json.is_some());

    assert_eq!(ex.primary_muscles, vec!["chest"]);

    let mut sec = ex.secondary_muscles.clone();
    sec.sort();
    assert_eq!(sec, vec!["shoulders", "triceps"]);
}

// ── update replaces muscles ───────────────────────────────────────────────────

#[sqlx::test]
async fn test_update_exercise_replaces_muscles(pool: SqlitePool) {
    let ex = exercise::create(
        &pool, "Squat", None, &[],
        None,
        Some(&muscles(&[("quadriceps", "primary"), ("glutes", "secondary")])), None
    )
    .await
    .unwrap();

    assert_eq!(ex.primary_muscles, vec!["quadriceps"]);

    let updated = exercise::update(
        &pool, &ex.id, "Squat", None, &[],
        None,
        Some(&muscles(&[("hamstrings", "primary"), ("calves", "secondary")])), None
    )
    .await
    .unwrap();

    assert_eq!(updated.primary_muscles, vec!["hamstrings"]);
    assert_eq!(updated.secondary_muscles, vec!["calves"]);
}

// ── update with no muscles leaves existing muscles intact ─────────────────────

#[sqlx::test]
async fn test_update_exercise_no_muscles_preserves_existing(pool: SqlitePool) {
    let ex = exercise::create(
        &pool, "Deadlift", None, &[],
        None,
        Some(&muscles(&[("hamstrings", "primary"), ("glutes", "secondary")])), None
    )
    .await
    .unwrap();

    let updated = exercise::update(&pool, &ex.id, "Deadlift", Some("cue"), &[], None, None, None)
        .await
        .unwrap();

    assert_eq!(updated.notes.as_deref(), Some("cue"));
    assert_eq!(updated.primary_muscles, vec!["hamstrings"]);
    assert_eq!(updated.secondary_muscles, vec!["glutes"]);
}

// ── validation: invalid category ─────────────────────────────────────────────

#[sqlx::test]
async fn test_invalid_category_rejected(pool: SqlitePool) {
    let m = ExerciseMeta { category: Some("gymnastics".into()), ..Default::default() };
    let result = exercise::create(&pool, "Handstand", None, &[], Some(&m), None, None).await;
    assert!(
        matches!(result, Err(AppError::Validation(_))),
        "expected Validation error, got: {:?}", result
    );
}

// ── validation: invalid equipment ────────────────────────────────────────────

#[sqlx::test]
async fn test_invalid_equipment_rejected(pool: SqlitePool) {
    let m = ExerciseMeta { equipment: Some("trampoline".into()), ..Default::default() };
    let result = exercise::create(&pool, "Jump", None, &[], Some(&m), None, None).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── validation: invalid level ─────────────────────────────────────────────────

#[sqlx::test]
async fn test_invalid_level_rejected(pool: SqlitePool) {
    let m = ExerciseMeta { level: Some("advanced".into()), ..Default::default() };
    let result = exercise::create(&pool, "Planche", None, &[], Some(&m), None, None).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── validation: invalid mechanic ─────────────────────────────────────────────

#[sqlx::test]
async fn test_invalid_mechanic_rejected(pool: SqlitePool) {
    let m = ExerciseMeta { mechanic: Some("plyometric".into()), ..Default::default() };
    let result = exercise::create(&pool, "Box Jump", None, &[], Some(&m), None, None).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── validation: invalid force ─────────────────────────────────────────────────

#[sqlx::test]
async fn test_invalid_force_rejected(pool: SqlitePool) {
    let m = ExerciseMeta { force: Some("explosive".into()), ..Default::default() };
    let result = exercise::create(&pool, "Power Clean", None, &[], Some(&m), None, None).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── validation: invalid muscle name ──────────────────────────────────────────

#[sqlx::test]
async fn test_invalid_muscle_name_rejected(pool: SqlitePool) {
    let ms = muscles(&[("pectoralis major", "primary")]);
    let result = exercise::create(&pool, "Press", None, &[], None, Some(&ms), None).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── validation: invalid muscle role ──────────────────────────────────────────

#[sqlx::test]
async fn test_invalid_muscle_role_rejected(pool: SqlitePool) {
    let ms = muscles(&[("chest", "stabilizer")]);
    let result = exercise::create(&pool, "Fly", None, &[], None, Some(&ms), None).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── validation: instructions_json not JSON ────────────────────────────────────

#[sqlx::test]
async fn test_invalid_instructions_json_not_json(pool: SqlitePool) {
    let m = ExerciseMeta {
        instructions_json: Some("not json at all".into()),
        ..Default::default()
    };
    let result = exercise::create(&pool, "Run", None, &[], Some(&m), None, None).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── validation: instructions_json is object, not array ───────────────────────

#[sqlx::test]
async fn test_invalid_instructions_json_not_array(pool: SqlitePool) {
    let m = ExerciseMeta {
        instructions_json: Some(r#"{"step": "do it"}"#.into()),
        ..Default::default()
    };
    let result = exercise::create(&pool, "Run", None, &[], Some(&m), None, None).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── validation: instructions_json array contains non-string ──────────────────

#[sqlx::test]
async fn test_invalid_instructions_json_non_string_element(pool: SqlitePool) {
    let m = ExerciseMeta {
        instructions_json: Some(r#"["Step one", 42, "Step three"]"#.into()),
        ..Default::default()
    };
    let result = exercise::create(&pool, "Run", None, &[], Some(&m), None, None).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── delete cascades exercise_muscles ─────────────────────────────────────────

#[sqlx::test]
async fn test_delete_cascades_exercise_muscles(pool: SqlitePool) {
    let ex = exercise::create(
        &pool, "Curl", None, &[],
        None,
        Some(&muscles(&[("biceps", "primary"), ("forearms", "secondary")])), None
    )
    .await
    .unwrap();

    exercise::delete_with_unlink(&pool, &ex.id, true).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM exercise_muscles WHERE exercise_id = ?",
    )
    .bind(&ex.id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(count, 0, "muscle rows should be cascade-deleted");
}

// ── duplicate (catalog_source, catalog_id) is rejected ───────────────────────

#[sqlx::test]
async fn test_duplicate_catalog_id_rejected(pool: SqlitePool) {
    let m = ExerciseMeta {
        catalog_source: Some("free-exercise-db".into()),
        catalog_id: Some("Squat".into()),
        ..Default::default()
    };

    exercise::create(&pool, "Squat", None, &[], Some(&m), None, None)
        .await
        .unwrap();

    let m2 = ExerciseMeta {
        catalog_source: Some("free-exercise-db".into()),
        catalog_id: Some("Squat".into()),
        ..Default::default()
    };

    let result = exercise::create(&pool, "Squat Variant", None, &[], Some(&m2), None, None).await;
    assert!(
        matches!(result, Err(AppError::Conflict(_))),
        "expected Conflict for duplicate catalog id, got: {:?}", result
    );
}

// ── plain exercise create (no meta, no muscles) still works ──────────────────

#[sqlx::test]
async fn test_plain_exercise_create_still_works(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Pull-up", Some("dead hang start"), &["pull".into()], None, None, None)
        .await
        .unwrap();

    assert_eq!(ex.name, "Pull-up");
    assert_eq!(ex.notes.as_deref(), Some("dead hang start"));
    assert_eq!(ex.tags, vec!["pull"]);
    assert!(!ex.is_catalog);
    assert!(ex.catalog_source.is_none());
    assert!(ex.catalog_id.is_none());
    assert!(ex.category.is_none());
    assert!(ex.primary_muscles.is_empty());
    assert!(ex.secondary_muscles.is_empty());
}

// ── valid instructions_json accepted ─────────────────────────────────────────

#[sqlx::test]
async fn test_valid_instructions_json_accepted(pool: SqlitePool) {
    let m = ExerciseMeta {
        instructions_json: Some(r#"["Stand tall.", "Lower the bar slowly."]"#.into()),
        ..Default::default()
    };
    let ex = exercise::create(&pool, "Romanian Deadlift", None, &[], Some(&m), None, None)
        .await
        .unwrap();

    assert!(ex.instructions_json.is_some());
}

// ── pose types: create with pose types ────────────────────────────────────────

#[sqlx::test]
async fn test_create_exercise_with_pose_types(pool: SqlitePool) {
    let pts = vec!["standing".to_string(), "balancing".to_string()];
    let ex = exercise::create(
        &pool, "Tree Pose", None, &[], None, None, Some(&pts),
    )
    .await
    .unwrap();

    let mut got = ex.pose_types.clone();
    got.sort();
    assert_eq!(got, vec!["balancing", "standing"]);
}

// ── pose types: update replaces pose types ────────────────────────────────────

#[sqlx::test]
async fn test_update_exercise_replaces_pose_types(pool: SqlitePool) {
    let ex = exercise::create(
        &pool, "Bridge Pose", None, &[], None, None,
        Some(&vec!["supine".to_string(), "back_bend".to_string()]),
    )
    .await
    .unwrap();
    assert_eq!(ex.pose_types.len(), 2);

    let updated = exercise::update(
        &pool, &ex.id, "Bridge Pose", None, &[], None, None,
        Some(&vec!["seated".to_string()]),
    )
    .await
    .unwrap();
    assert_eq!(updated.pose_types, vec!["seated"]);
}

// ── pose types: update with None preserves existing ───────────────────────────

#[sqlx::test]
async fn test_update_exercise_no_pose_types_preserves_existing(pool: SqlitePool) {
    let ex = exercise::create(
        &pool, "Warrior I", None, &[], None, None,
        Some(&vec!["standing".to_string()]),
    )
    .await
    .unwrap();

    let updated =
        exercise::update(&pool, &ex.id, "Warrior I", Some("cue"), &[], None, None, None)
            .await
            .unwrap();
    assert_eq!(updated.pose_types, vec!["standing"]);
    assert_eq!(updated.notes.as_deref(), Some("cue"));
}

// ── pose types: update with Some([]) clears pose types ────────────────────────

#[sqlx::test]
async fn test_update_exercise_empty_pose_types_clears(pool: SqlitePool) {
    let ex = exercise::create(
        &pool, "Mountain Pose", None, &[], None, None,
        Some(&vec!["standing".to_string()]),
    )
    .await
    .unwrap();
    assert_eq!(ex.pose_types.len(), 1);

    let cleared: Vec<String> = vec![];
    let updated = exercise::update(
        &pool, &ex.id, "Mountain Pose", None, &[], None, None, Some(&cleared),
    )
    .await
    .unwrap();
    assert!(updated.pose_types.is_empty());
}

// ── pose types: invalid value rejected ────────────────────────────────────────

#[sqlx::test]
async fn test_invalid_pose_type_rejected(pool: SqlitePool) {
    let pts = vec!["upside-down".to_string()];
    let result = exercise::create(
        &pool, "Funky Pose", None, &[], None, None, Some(&pts),
    )
    .await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── pose types: delete cascades ───────────────────────────────────────────────

#[sqlx::test]
async fn test_delete_cascades_pose_types(pool: SqlitePool) {
    let ex = exercise::create(
        &pool, "Crow Pose", None, &[], None, None,
        Some(&vec!["arm_balance".to_string()]),
    )
    .await
    .unwrap();

    exercise::delete_with_unlink(&pool, &ex.id, true).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM exercise_pose_types WHERE exercise_id = ?",
    )
    .bind(&ex.id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(count, 0, "pose type rows should be cascade-deleted");
}

// ── empty instructions_json array is valid ────────────────────────────────────

#[sqlx::test]
async fn test_empty_instructions_json_array_accepted(pool: SqlitePool) {
    let m = ExerciseMeta {
        instructions_json: Some("[]".into()),
        ..Default::default()
    };
    let ex = exercise::create(&pool, "Side Bridge", None, &[], Some(&m), None, None)
        .await
        .unwrap();

    assert_eq!(ex.instructions_json.as_deref(), Some("[]"));
}
