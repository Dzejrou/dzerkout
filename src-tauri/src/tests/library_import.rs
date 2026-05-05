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
