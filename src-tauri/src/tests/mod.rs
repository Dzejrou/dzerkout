// Integration tests using sqlx::test — each test gets a fresh in-memory SQLite
// with migrations applied automatically.

use sqlx::SqlitePool;
use crate::{
    domain::{exercise, set_template, workout_template},
    error::AppError,
};

// ── Assignment cross-set validation ─────────────────────────────────────────

#[sqlx::test]
async fn test_assignment_validation_rejects_wrong_set(pool: SqlitePool) {
    // Create two set templates, each with one card
    let set_a = set_template::create(&pool, "Set A", None).await.unwrap();
    let set_b = set_template::create(&pool, "Set B", None).await.unwrap();
    let exercise = exercise::create(&pool, "Squat", None).await.unwrap();

    let card_a = set_template::add_card(
        &pool,
        &set_a.id,
        "concrete",
        Some(&exercise.id),
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();

    // Create a workout that references only Set A
    let wt = workout_template::create(&pool, "My Workout", None, 120, None)
        .await
        .unwrap();
    let ref_a = workout_template::add_set_ref(&pool, &wt.id, &set_a.id)
        .await
        .unwrap();

    // Also add a card to Set B (not referenced by the workout ref)
    let card_b = set_template::add_card(
        &pool,
        &set_b.id,
        "concrete",
        Some(&exercise.id),
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();

    // Attempt to assign card_b to ref_a — card_b belongs to set_b, not set_a → must fail
    let result = workout_template::upsert_card_assignment(
        &pool,
        &ref_a.id,
        &card_b.id, // wrong set
        None,
        Some("Override"),
        None,
        None,
    )
    .await;

    assert!(
        matches!(result, Err(AppError::Validation(_))),
        "expected Validation error for cross-set assignment, got: {:?}",
        result
    );

    // Assigning card_a to ref_a (same set) must succeed
    let ok = workout_template::upsert_card_assignment(
        &pool,
        &ref_a.id,
        &card_a.id, // correct set
        None,
        Some("Override"),
        None,
        None,
    )
    .await;
    assert!(ok.is_ok(), "valid same-set assignment should succeed: {:?}", ok);
}

// ── Two-phase card reorder ───────────────────────────────────────────────────

#[sqlx::test]
async fn test_reorder_cards_two_phase(pool: SqlitePool) {
    let exercise = exercise::create(&pool, "Push-up", None).await.unwrap();
    let set = set_template::create(&pool, "Reorder Set", None).await.unwrap();

    // Add three cards
    let c0 = set_template::add_card(
        &pool, &set.id, "concrete", Some(&exercise.id), None, None, None, None,
    ).await.unwrap();
    let c1 = set_template::add_card(
        &pool, &set.id, "concrete", Some(&exercise.id), None, None, None, None,
    ).await.unwrap();
    let c2 = set_template::add_card(
        &pool, &set.id, "concrete", Some(&exercise.id), None, None, None, None,
    ).await.unwrap();

    // Reverse order: 2 → 0, 1 → 1, 0 → 2 (maximum collision scenario)
    set_template::reorder_cards(
        &pool,
        &set.id,
        vec![c2.id.clone(), c1.id.clone(), c0.id.clone()],
    )
    .await
    .unwrap();

    let detail = set_template::get(&pool, &set.id).await.unwrap();
    assert_eq!(detail.cards[0].id, c2.id, "first card should be c2");
    assert_eq!(detail.cards[1].id, c1.id, "second card should be c1");
    assert_eq!(detail.cards[2].id, c0.id, "third card should be c0");
    assert_eq!(detail.cards[0].order_index, 0);
    assert_eq!(detail.cards[1].order_index, 1);
    assert_eq!(detail.cards[2].order_index, 2);
}

#[sqlx::test]
async fn test_reorder_set_refs_two_phase(pool: SqlitePool) {
    let set_a = set_template::create(&pool, "Alpha", None).await.unwrap();
    let set_b = set_template::create(&pool, "Beta", None).await.unwrap();
    let set_c = set_template::create(&pool, "Gamma", None).await.unwrap();

    let wt = workout_template::create(&pool, "Reorder Workout", None, 120, None)
        .await
        .unwrap();
    let r0 = workout_template::add_set_ref(&pool, &wt.id, &set_a.id).await.unwrap();
    let r1 = workout_template::add_set_ref(&pool, &wt.id, &set_b.id).await.unwrap();
    let r2 = workout_template::add_set_ref(&pool, &wt.id, &set_c.id).await.unwrap();

    // Reverse: c → 0, b → 1, a → 2
    workout_template::reorder_set_refs(
        &pool,
        &wt.id,
        vec![r2.id.clone(), r1.id.clone(), r0.id.clone()],
    )
    .await
    .unwrap();

    let detail = workout_template::get(&pool, &wt.id).await.unwrap();
    assert_eq!(detail.set_refs[0].id, r2.id);
    assert_eq!(detail.set_refs[1].id, r1.id);
    assert_eq!(detail.set_refs[2].id, r0.id);
    assert_eq!(detail.set_refs[0].order_index, 0);
    assert_eq!(detail.set_refs[2].order_index, 2);
}

// ── clone_set_template ───────────────────────────────────────────────────────

#[sqlx::test]
async fn test_clone_set_template(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Deadlift", None).await.unwrap();
    let src = set_template::create(&pool, "Source Set", Some("notes")).await.unwrap();

    set_template::add_card(
        &pool, &src.id, "concrete", Some(&ex.id), None, None, Some(45), Some("note"),
    ).await.unwrap();
    set_template::add_card(
        &pool, &src.id, "placeholder", None, Some("push"), Some("Upper push"), None, None,
    ).await.unwrap();

    let clone = set_template::clone_set(&pool, &src.id).await.unwrap();

    // Name
    assert_eq!(clone.name, "Source Set (copy)");
    assert_ne!(clone.id, src.id);

    // Cards are duplicated
    let src_detail = set_template::get(&pool, &src.id).await.unwrap();
    let clone_detail = set_template::get(&pool, &clone.id).await.unwrap();

    assert_eq!(src_detail.cards.len(), clone_detail.cards.len());

    // IDs are different
    for (s, c) in src_detail.cards.iter().zip(clone_detail.cards.iter()) {
        assert_ne!(s.id, c.id, "cloned card must have a new ID");
        assert_eq!(s.card_type, c.card_type);
        assert_eq!(s.exercise_id, c.exercise_id);
        assert_eq!(s.placeholder_tag, c.placeholder_tag);
        assert_eq!(s.order_index, c.order_index);
    }

    // Modifying source does not affect clone (independent)
    set_template::remove_card(&pool, &src_detail.cards[0].id).await.unwrap();
    let clone_detail_after = set_template::get(&pool, &clone.id).await.unwrap();
    assert_eq!(
        clone_detail_after.cards.len(),
        2,
        "clone should still have 2 cards after source card removed"
    );
}

// ── clone_set_from_workout ───────────────────────────────────────────────────

#[sqlx::test]
async fn test_clone_set_from_workout(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Bench Press", None).await.unwrap();
    let src_set = set_template::create(&pool, "Push Set", None).await.unwrap();
    set_template::add_card(
        &pool, &src_set.id, "concrete", Some(&ex.id), None, None, Some(60), None,
    ).await.unwrap();

    let wt = workout_template::create(&pool, "Chest Day", None, 120, None)
        .await
        .unwrap();
    let ref_a = workout_template::add_set_ref(&pool, &wt.id, &src_set.id)
        .await
        .unwrap();

    let new_ref = workout_template::clone_set_from_workout(&pool, &ref_a.id)
        .await
        .unwrap();

    // New ref replaces old ref at same order_index
    assert_eq!(new_ref.order_index, ref_a.order_index);
    assert_ne!(new_ref.id, ref_a.id);
    assert_ne!(new_ref.set_template_id, src_set.id, "must point at new clone");

    // Workout now has exactly one ref (replacement, not insertion)
    let detail = workout_template::get(&pool, &wt.id).await.unwrap();
    assert_eq!(detail.set_refs.len(), 1);
    assert_eq!(detail.set_refs[0].id, new_ref.id);

    // Original set template is untouched
    let src_detail = set_template::get(&pool, &src_set.id).await.unwrap();
    assert_eq!(src_detail.cards.len(), 1);
}

// ── Exercise delete/unlink ───────────────────────────────────────────────────

#[sqlx::test]
async fn test_exercise_delete_unlinks_cards_and_assignments(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Squat", None).await.unwrap();
    let set = set_template::create(&pool, "Leg Day", None).await.unwrap();

    // Concrete card referencing exercise
    set_template::add_card(
        &pool, &set.id, "concrete", Some(&ex.id), None, None, None, None,
    ).await.unwrap();

    // Workout + assignment
    let wt = workout_template::create(&pool, "Legs", None, 120, None).await.unwrap();
    let ref_ = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();
    let set_detail = set_template::get(&pool, &set.id).await.unwrap();
    let card = &set_detail.cards[0];

    workout_template::upsert_card_assignment(
        &pool, &ref_.id, &card.id, Some(&ex.id), None, None, None,
    ).await.unwrap();

    // Delete exercise with confirmation
    exercise::delete_with_unlink(&pool, &ex.id, true).await.unwrap();

    // Card converted to placeholder
    let set_after = set_template::get(&pool, &set.id).await.unwrap();
    assert_eq!(set_after.cards[0].card_type, "placeholder");
    assert_eq!(set_after.cards[0].exercise_id, None);
    assert_eq!(
        set_after.cards[0].placeholder_label.as_deref(),
        Some("Squat"),
        "placeholder_label must be the exercise's prior name"
    );

    // Assignment exercise_id nulled, display_label = exercise name
    let wt_after = workout_template::get(&pool, &wt.id).await.unwrap();
    let assignment = &wt_after.assignments[0];
    assert_eq!(assignment.exercise_id, None);
    assert_eq!(
        assignment.display_label.as_deref(),
        Some("Squat"),
        "display_label should fall back to exercise name"
    );
}

#[sqlx::test]
async fn test_exercise_delete_requires_confirmed_flag(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Lunge", None).await.unwrap();
    let result = exercise::delete_with_unlink(&pool, &ex.id, false).await;
    assert!(
        matches!(result, Err(AppError::Validation(_))),
        "unconfirmed delete must return Validation error"
    );
}
