// Integration tests for sequential catalog import.
// Each test gets a fresh in-memory SQLite with all migrations applied.

use sqlx::SqlitePool;
use crate::{domain::{exercise, library}, error::AppError};

/// Minimal valid catalog-exercise JSON fragment.
fn catalog_exercise(id: &str, name: &str, source: &str, cat_id: &str) -> String {
    format!(
        r#"{{
          "id": "{id}",
          "name": "{name}",
          "notes": null,
          "tags": [],
          "image_url": null,
          "catalog_source": "{source}",
          "catalog_id": "{cat_id}",
          "is_catalog": true,
          "category": null,
          "equipment": null,
          "level": null,
          "mechanic": null,
          "force": null,
          "instructions_json": null,
          "primary_muscles": [],
          "secondary_muscles": []
        }}"#
    )
}

fn catalog_json(exercises: &[String]) -> String {
    format!(
        r#"{{
          "schema": "dzerkout.library",
          "version": 1,
          "exported_at": "2024-01-01T00:00:00Z",
          "exercises": [{ex}],
          "set_templates": [],
          "workout_templates": [],
          "sessions": [],
          "session_sets": [],
          "session_exercises": []
        }}"#,
        ex = exercises.join(",")
    )
}

/// Import catalog A then B — both catalogs fully present in the union.
#[sqlx::test]
async fn test_sequential_import_a_then_b(pool: SqlitePool) {
    let a_ex1 = catalog_exercise("fed-bench-a1", "Bench Press", "free-exercise-db", "bench-press");
    let a_ex2 = catalog_exercise("fed-squat-a2", "Squat", "free-exercise-db", "squat");
    let catalog_a = catalog_json(&[a_ex1, a_ex2]);

    let b_ex1 = catalog_exercise("yoga-tree-b1", "Tree Pose", "yoga-poses", "tree-pose");
    let b_ex2 = catalog_exercise("yoga-warrior-b2", "Warrior I", "yoga-poses", "warrior-i");
    let catalog_b = catalog_json(&[b_ex1, b_ex2]);

    let r_a = library::import_library_json(&pool, &catalog_a).await.unwrap();
    assert_eq!(r_a.exercises_created, 2, "catalog A: 2 created");
    assert_eq!(r_a.exercises_updated, 0);

    let r_b = library::import_library_json(&pool, &catalog_b).await.unwrap();
    assert_eq!(r_b.exercises_created, 2, "catalog B: 2 created");
    assert_eq!(r_b.exercises_updated, 0);

    let all = exercise::list(&pool).await.unwrap();
    assert_eq!(all.len(), 4, "union of both catalogs = 4 exercises");

    let names: std::collections::HashSet<_> = all.iter().map(|e| e.name.as_str()).collect();
    assert!(names.contains("Bench Press"));
    assert!(names.contains("Squat"));
    assert!(names.contains("Tree Pose"));
    assert!(names.contains("Warrior I"));
}

/// Import B first, then A — same union regardless of order.
#[sqlx::test]
async fn test_sequential_import_b_then_a(pool: SqlitePool) {
    let a_ex1 = catalog_exercise("fed-bench-a1", "Bench Press", "free-exercise-db", "bench-press");
    let a_ex2 = catalog_exercise("fed-squat-a2", "Squat", "free-exercise-db", "squat");
    let catalog_a = catalog_json(&[a_ex1, a_ex2]);

    let b_ex1 = catalog_exercise("yoga-tree-b1", "Tree Pose", "yoga-poses", "tree-pose");
    let b_ex2 = catalog_exercise("yoga-warrior-b2", "Warrior I", "yoga-poses", "warrior-i");
    let catalog_b = catalog_json(&[b_ex1, b_ex2]);

    let r_b = library::import_library_json(&pool, &catalog_b).await.unwrap();
    assert_eq!(r_b.exercises_created, 2, "catalog B first: 2 created");

    let r_a = library::import_library_json(&pool, &catalog_a).await.unwrap();
    assert_eq!(r_a.exercises_created, 2, "catalog A second: 2 created");
    assert_eq!(r_a.exercises_updated, 0);

    let all = exercise::list(&pool).await.unwrap();
    assert_eq!(all.len(), 4, "union of both catalogs = 4 exercises");
}

/// Re-import A after A+B is already in DB: updates A's rows, does not duplicate.
#[sqlx::test]
async fn test_reimport_a_after_ab_is_idempotent(pool: SqlitePool) {
    let a_ex = catalog_exercise("fed-bench-a1", "Bench Press", "free-exercise-db", "bench-press");
    let catalog_a = catalog_json(&[a_ex]);

    let b_ex = catalog_exercise("yoga-tree-b1", "Tree Pose", "yoga-poses", "tree-pose");
    let catalog_b = catalog_json(&[b_ex]);

    library::import_library_json(&pool, &catalog_a).await.unwrap();
    library::import_library_json(&pool, &catalog_b).await.unwrap();

    let result = library::import_library_json(&pool, &catalog_a).await.unwrap();
    assert_eq!(result.exercises_created, 0, "re-import A: no new rows");
    assert_eq!(result.exercises_updated, 1, "re-import A: existing row updated in-place");

    let all = exercise::list(&pool).await.unwrap();
    assert_eq!(all.len(), 2, "still 2 total — no duplicates");
}

/// Importing an exercise whose name already belongs to a different exercise ID
/// returns a clear Validation error, not an opaque UNIQUE constraint failure.
#[sqlx::test]
async fn test_cross_catalog_name_collision_gives_clear_error(pool: SqlitePool) {
    let a_ex = catalog_exercise("id-fed-bridge", "Bridge Pose", "free-exercise-db", "bridge-pose");
    let catalog_a = catalog_json(&[a_ex]);

    // Same display name, but different ID and different catalog_source.
    let b_ex = catalog_exercise("id-yoga-bridge", "Bridge Pose", "yoga-poses", "bridge-pose");
    let catalog_b = catalog_json(&[b_ex]);

    library::import_library_json(&pool, &catalog_a).await.unwrap();

    let err = library::import_library_json(&pool, &catalog_b).await.unwrap_err();
    match err {
        AppError::Validation(msg) => {
            assert!(
                msg.contains("Bridge Pose"),
                "error should name the colliding exercise; got: {msg}"
            );
        }
        other => panic!("expected AppError::Validation, got: {other:?}"),
    }
}

/// Old import payloads (pre pose_types) still import successfully — pose_types
/// defaults to an empty array on deserialise.
#[sqlx::test]
async fn test_import_without_pose_types_succeeds(pool: SqlitePool) {
    let ex = catalog_exercise("yoga-tree-old", "Tree Pose", "yoga-poses", "tree-pose");
    let catalog = catalog_json(&[ex]);
    let result = library::import_library_json(&pool, &catalog).await.unwrap();
    assert_eq!(result.exercises_created, 1);

    let stored = exercise::list(&pool).await.unwrap();
    assert_eq!(stored.len(), 1);
    assert!(
        stored[0].pose_types.is_empty(),
        "missing pose_types should default to empty"
    );
}

/// Pose types round-trip through export → import: import populates the join
/// table; export emits the stored values back.
#[sqlx::test]
async fn test_pose_types_roundtrip_through_import_and_export(pool: SqlitePool) {
    let json = format!(
        r#"{{
          "schema": "dzerkout.library",
          "version": 1,
          "exported_at": "2024-01-01T00:00:00Z",
          "exercises": [{{
            "id": "yoga-warrior-i",
            "name": "Warrior I",
            "notes": null,
            "tags": [],
            "image_url": null,
            "catalog_source": "yoga-poses",
            "catalog_id": "warrior-i",
            "is_catalog": true,
            "category": "yoga",
            "equipment": "none",
            "level": null,
            "mechanic": null,
            "force": null,
            "instructions_json": null,
            "primary_muscles": [],
            "secondary_muscles": [],
            "pose_types": ["standing", "balancing"]
          }}],
          "set_templates": [],
          "workout_templates": [],
          "sessions": [],
          "session_sets": [],
          "session_exercises": []
        }}"#
    );

    library::import_library_json(&pool, &json).await.unwrap();

    let stored = exercise::list(&pool).await.unwrap();
    assert_eq!(stored.len(), 1);
    let mut got = stored[0].pose_types.clone();
    got.sort();
    assert_eq!(got, vec!["balancing", "standing"]);

    // Export and confirm pose_types appears in the JSON.
    let exported = library::export_full_library(&pool).await.unwrap();
    assert!(exported.contains("\"pose_types\""));
    assert!(exported.contains("standing"));
    assert!(exported.contains("balancing"));
}

/// Invalid pose_type values are rejected at the import boundary.
#[sqlx::test]
async fn test_import_rejects_invalid_pose_type(pool: SqlitePool) {
    let json = format!(
        r#"{{
          "schema": "dzerkout.library",
          "version": 1,
          "exported_at": "2024-01-01T00:00:00Z",
          "exercises": [{{
            "id": "yoga-bad",
            "name": "Funny Pose",
            "notes": null,
            "tags": [],
            "image_url": null,
            "catalog_source": "yoga-poses",
            "catalog_id": "bad",
            "is_catalog": true,
            "category": "yoga",
            "equipment": "none",
            "level": null,
            "mechanic": null,
            "force": null,
            "instructions_json": null,
            "primary_muscles": [],
            "secondary_muscles": [],
            "pose_types": ["upside-down"]
          }}],
          "set_templates": [],
          "workout_templates": [],
          "sessions": [],
          "session_sets": [],
          "session_exercises": []
        }}"#
    );

    let err = library::import_library_json(&pool, &json).await.unwrap_err();
    assert!(matches!(err, AppError::Validation(_)));
}

/// Sanskrit name round-trips through export → import.
#[sqlx::test]
async fn test_sanskrit_name_roundtrip(pool: SqlitePool) {
    let json = r#"{
      "schema": "dzerkout.library",
      "version": 1,
      "exported_at": "2024-01-01T00:00:00Z",
      "exercises": [{
        "id": "yoga-tree-1",
        "name": "Tree Pose",
        "notes": null,
        "tags": [],
        "image_url": null,
        "catalog_source": "yoga-poses",
        "catalog_id": "tree-pose",
        "is_catalog": true,
        "category": "yoga",
        "equipment": "none",
        "level": null,
        "mechanic": null,
        "force": null,
        "instructions_json": null,
        "sanskrit_name": "Vrksasana",
        "primary_muscles": [],
        "secondary_muscles": [],
        "pose_types": ["standing"]
      }],
      "set_templates": [],
      "workout_templates": [],
      "sessions": [],
      "session_sets": [],
      "session_exercises": []
    }"#;

    library::import_library_json(&pool, json).await.unwrap();

    let stored = exercise::list(&pool).await.unwrap();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].sanskrit_name.as_deref(), Some("Vrksasana"));

    let exported = library::export_full_library(&pool).await.unwrap();
    assert!(exported.contains("\"sanskrit_name\""));
    assert!(exported.contains("Vrksasana"));
}

/// Old payloads without `sanskrit_name` still import — defaults to None.
#[sqlx::test]
async fn test_import_without_sanskrit_name_succeeds(pool: SqlitePool) {
    let ex = catalog_exercise("yoga-old-1", "Old Pose", "yoga-poses", "old-pose");
    let catalog = catalog_json(&[ex]);
    library::import_library_json(&pool, &catalog).await.unwrap();

    let stored = exercise::list(&pool).await.unwrap();
    assert_eq!(stored.len(), 1);
    assert!(stored[0].sanskrit_name.is_none());
}

/// image_urls_json round-trips through export → import.
#[sqlx::test]
async fn test_image_urls_json_roundtrip(pool: SqlitePool) {
    let json = r#"{
      "schema": "dzerkout.library",
      "version": 1,
      "exported_at": "2024-01-01T00:00:00Z",
      "exercises": [{
        "id": "fed-multi-1",
        "name": "Multi Image",
        "notes": null,
        "tags": [],
        "image_url": "catalog/free-exercise-db/multi/0.jpg",
        "image_urls_json": "[\"catalog/free-exercise-db/multi/0.jpg\",\"catalog/free-exercise-db/multi/1.jpg\"]",
        "catalog_source": "free-exercise-db",
        "catalog_id": "multi",
        "is_catalog": true,
        "category": null,
        "equipment": null,
        "level": null,
        "mechanic": null,
        "force": null,
        "instructions_json": null,
        "primary_muscles": [],
        "secondary_muscles": [],
        "pose_types": []
      }],
      "set_templates": [],
      "workout_templates": [],
      "sessions": [],
      "session_sets": [],
      "session_exercises": []
    }"#;

    library::import_library_json(&pool, json).await.unwrap();

    let stored = exercise::list(&pool).await.unwrap();
    assert_eq!(stored.len(), 1);
    let raw = stored[0].image_urls_json.as_deref().expect("image_urls_json stored");
    let parsed: Vec<String> = serde_json::from_str(raw).unwrap();
    assert_eq!(parsed, vec![
        "catalog/free-exercise-db/multi/0.jpg".to_string(),
        "catalog/free-exercise-db/multi/1.jpg".to_string(),
    ]);

    let exported = library::export_full_library(&pool).await.unwrap();
    assert!(exported.contains("\"image_urls_json\""));
    assert!(exported.contains("multi/1.jpg"));
}

/// Old payloads without `image_urls_json` still import — defaults to None.
#[sqlx::test]
async fn test_import_without_image_urls_json_succeeds(pool: SqlitePool) {
    let ex = catalog_exercise("fed-old-1", "Old Exercise", "free-exercise-db", "old-1");
    let catalog = catalog_json(&[ex]);
    library::import_library_json(&pool, &catalog).await.unwrap();

    let stored = exercise::list(&pool).await.unwrap();
    assert_eq!(stored.len(), 1);
    assert!(stored[0].image_urls_json.is_none());
}

/// Malformed JSON in image_urls_json is rejected at the import boundary.
#[sqlx::test]
async fn test_import_rejects_malformed_image_urls_json(pool: SqlitePool) {
    let ex = format!(
        r#"{{
          "id": "fed-bad-json",
          "name": "Bad JSON",
          "notes": null,
          "tags": [],
          "image_url": null,
          "image_urls_json": "not-json",
          "catalog_source": "free-exercise-db",
          "catalog_id": "bad-json",
          "is_catalog": true,
          "category": null,
          "equipment": null,
          "level": null,
          "mechanic": null,
          "force": null,
          "instructions_json": null,
          "primary_muscles": [],
          "secondary_muscles": [],
          "pose_types": []
        }}"#
    );
    let catalog = catalog_json(&[ex]);
    let err = library::import_library_json(&pool, &catalog).await.unwrap_err();
    assert!(matches!(err, AppError::Validation(_)));
}

/// image_urls_json must be a JSON array (not an object/number/string).
#[sqlx::test]
async fn test_import_rejects_non_array_image_urls_json(pool: SqlitePool) {
    let ex = format!(
        r#"{{
          "id": "fed-bad-shape",
          "name": "Bad Shape",
          "notes": null,
          "tags": [],
          "image_url": null,
          "image_urls_json": "{{\"k\":\"v\"}}",
          "catalog_source": "free-exercise-db",
          "catalog_id": "bad-shape",
          "is_catalog": true,
          "category": null,
          "equipment": null,
          "level": null,
          "mechanic": null,
          "force": null,
          "instructions_json": null,
          "primary_muscles": [],
          "secondary_muscles": [],
          "pose_types": []
        }}"#
    );
    let catalog = catalog_json(&[ex]);
    let err = library::import_library_json(&pool, &catalog).await.unwrap_err();
    assert!(matches!(err, AppError::Validation(_)));
}

/// image_urls_json array elements must be non-empty strings.
#[sqlx::test]
async fn test_import_rejects_image_urls_json_with_non_string_element(pool: SqlitePool) {
    let ex = format!(
        r#"{{
          "id": "fed-non-str",
          "name": "Non String",
          "notes": null,
          "tags": [],
          "image_url": null,
          "image_urls_json": "[\"ok.jpg\", 5]",
          "catalog_source": "free-exercise-db",
          "catalog_id": "non-str",
          "is_catalog": true,
          "category": null,
          "equipment": null,
          "level": null,
          "mechanic": null,
          "force": null,
          "instructions_json": null,
          "primary_muscles": [],
          "secondary_muscles": [],
          "pose_types": []
        }}"#
    );
    let catalog = catalog_json(&[ex]);
    let err = library::import_library_json(&pool, &catalog).await.unwrap_err();
    assert!(matches!(err, AppError::Validation(_)));
}

#[sqlx::test]
async fn test_import_rejects_image_urls_json_with_empty_string(pool: SqlitePool) {
    let ex = format!(
        r#"{{
          "id": "fed-empty-str",
          "name": "Empty String",
          "notes": null,
          "tags": [],
          "image_url": null,
          "image_urls_json": "[\"ok.jpg\", \"\"]",
          "catalog_source": "free-exercise-db",
          "catalog_id": "empty-str",
          "is_catalog": true,
          "category": null,
          "equipment": null,
          "level": null,
          "mechanic": null,
          "force": null,
          "instructions_json": null,
          "primary_muscles": [],
          "secondary_muscles": [],
          "pose_types": []
        }}"#
    );
    let catalog = catalog_json(&[ex]);
    let err = library::import_library_json(&pool, &catalog).await.unwrap_err();
    assert!(matches!(err, AppError::Validation(_)));
}

/// Within a single import payload, duplicate exercise names are rejected.
#[sqlx::test]
async fn test_duplicate_name_within_payload_rejected(pool: SqlitePool) {
    let ex1 = catalog_exercise("id-yoga-tree-1", "Tree Pose", "yoga-poses", "tree-pose-1");
    let ex2 = catalog_exercise("id-yoga-tree-2", "Tree Pose", "yoga-poses", "tree-pose-2");
    let catalog = catalog_json(&[ex1, ex2]);

    let err = library::import_library_json(&pool, &catalog).await.unwrap_err();
    match err {
        AppError::Validation(msg) => {
            assert!(
                msg.contains("Tree Pose"),
                "error should name the duplicate; got: {msg}"
            );
        }
        other => panic!("expected AppError::Validation, got: {other:?}"),
    }
}
