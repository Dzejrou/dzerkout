// Integration tests using sqlx::test — each test gets a fresh in-memory SQLite
// with migrations applied automatically.

use sqlx::SqlitePool;
use crate::{
    db::history as history_db,
    domain::{exercise, session, set_template, workout_template},
    error::AppError,
};

// ── Assignment cross-set validation ─────────────────────────────────────────

#[sqlx::test]
async fn test_assignment_validation_rejects_wrong_set(pool: SqlitePool) {
    let set_a = set_template::create(&pool, "Set A", None).await.unwrap();
    let set_b = set_template::create(&pool, "Set B", None).await.unwrap();
    let exercise = exercise::create(&pool, "Squat", None).await.unwrap();

    let card_a = set_template::add_card(
        &pool, &set_a.id, "concrete", Some(&exercise.id), None, None, None, None,
    ).await.unwrap();

    let wt = workout_template::create(&pool, "My Workout", None, 120, None).await.unwrap();
    let ref_a = workout_template::add_set_ref(&pool, &wt.id, &set_a.id).await.unwrap();

    let card_b = set_template::add_card(
        &pool, &set_b.id, "concrete", Some(&exercise.id), None, None, None, None,
    ).await.unwrap();

    let result = workout_template::upsert_card_assignment(
        &pool, &ref_a.id, &card_b.id, None, Some("Override"), None, None,
    ).await;
    assert!(
        matches!(result, Err(AppError::Validation(_))),
        "expected Validation error for cross-set assignment, got: {:?}",
        result
    );

    let ok = workout_template::upsert_card_assignment(
        &pool, &ref_a.id, &card_a.id, None, Some("Override"), None, None,
    ).await;
    assert!(ok.is_ok(), "valid same-set assignment should succeed: {:?}", ok);
}

// ── Two-phase card reorder ───────────────────────────────────────────────────

#[sqlx::test]
async fn test_reorder_cards_two_phase(pool: SqlitePool) {
    let exercise = exercise::create(&pool, "Push-up", None).await.unwrap();
    let set = set_template::create(&pool, "Reorder Set", None).await.unwrap();

    let c0 = set_template::add_card(&pool, &set.id, "concrete", Some(&exercise.id), None, None, None, None).await.unwrap();
    let c1 = set_template::add_card(&pool, &set.id, "concrete", Some(&exercise.id), None, None, None, None).await.unwrap();
    let c2 = set_template::add_card(&pool, &set.id, "concrete", Some(&exercise.id), None, None, None, None).await.unwrap();

    set_template::reorder_cards(&pool, &set.id, vec![c2.id.clone(), c1.id.clone(), c0.id.clone()]).await.unwrap();

    let detail = set_template::get(&pool, &set.id).await.unwrap();
    assert_eq!(detail.cards[0].id, c2.id);
    assert_eq!(detail.cards[1].id, c1.id);
    assert_eq!(detail.cards[2].id, c0.id);
    assert_eq!(detail.cards[0].order_index, 0);
    assert_eq!(detail.cards[1].order_index, 1);
    assert_eq!(detail.cards[2].order_index, 2);
}

#[sqlx::test]
async fn test_reorder_set_refs_two_phase(pool: SqlitePool) {
    let set_a = set_template::create(&pool, "Alpha", None).await.unwrap();
    let set_b = set_template::create(&pool, "Beta", None).await.unwrap();
    let set_c = set_template::create(&pool, "Gamma", None).await.unwrap();

    let wt = workout_template::create(&pool, "Reorder Workout", None, 120, None).await.unwrap();
    let r0 = workout_template::add_set_ref(&pool, &wt.id, &set_a.id).await.unwrap();
    let r1 = workout_template::add_set_ref(&pool, &wt.id, &set_b.id).await.unwrap();
    let r2 = workout_template::add_set_ref(&pool, &wt.id, &set_c.id).await.unwrap();

    workout_template::reorder_set_refs(&pool, &wt.id, vec![r2.id.clone(), r1.id.clone(), r0.id.clone()]).await.unwrap();

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

    set_template::add_card(&pool, &src.id, "concrete", Some(&ex.id), None, None, Some(45), Some("note")).await.unwrap();
    set_template::add_card(&pool, &src.id, "placeholder", None, Some("push"), Some("Upper push"), None, None).await.unwrap();

    let clone = set_template::clone_set(&pool, &src.id).await.unwrap();
    assert_eq!(clone.name, "Source Set (copy)");
    assert_ne!(clone.id, src.id);

    let src_detail = set_template::get(&pool, &src.id).await.unwrap();
    let clone_detail = set_template::get(&pool, &clone.id).await.unwrap();
    assert_eq!(src_detail.cards.len(), clone_detail.cards.len());

    for (s, c) in src_detail.cards.iter().zip(clone_detail.cards.iter()) {
        assert_ne!(s.id, c.id);
        assert_eq!(s.card_type, c.card_type);
        assert_eq!(s.exercise_id, c.exercise_id);
        assert_eq!(s.placeholder_tag, c.placeholder_tag);
        assert_eq!(s.order_index, c.order_index);
    }

    set_template::remove_card(&pool, &src_detail.cards[0].id).await.unwrap();
    let clone_after = set_template::get(&pool, &clone.id).await.unwrap();
    assert_eq!(clone_after.cards.len(), 2);
}

// ── clone_set_from_workout ───────────────────────────────────────────────────

#[sqlx::test]
async fn test_clone_set_from_workout(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Bench Press", None).await.unwrap();
    let src_set = set_template::create(&pool, "Push Set", None).await.unwrap();
    set_template::add_card(&pool, &src_set.id, "concrete", Some(&ex.id), None, None, Some(60), None).await.unwrap();

    let wt = workout_template::create(&pool, "Chest Day", None, 120, None).await.unwrap();
    let ref_a = workout_template::add_set_ref(&pool, &wt.id, &src_set.id).await.unwrap();

    let new_ref = workout_template::clone_set_from_workout(&pool, &ref_a.id).await.unwrap();
    assert_eq!(new_ref.order_index, ref_a.order_index);
    assert_ne!(new_ref.id, ref_a.id);
    assert_ne!(new_ref.set_template_id, src_set.id);

    let detail = workout_template::get(&pool, &wt.id).await.unwrap();
    assert_eq!(detail.set_refs.len(), 1);
    assert_eq!(detail.set_refs[0].id, new_ref.id);

    let src_detail = set_template::get(&pool, &src_set.id).await.unwrap();
    assert_eq!(src_detail.cards.len(), 1);
}

// ── Exercise delete/unlink ───────────────────────────────────────────────────

#[sqlx::test]
async fn test_exercise_delete_unlinks_cards_and_assignments(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Squat", None).await.unwrap();
    let set = set_template::create(&pool, "Leg Day", None).await.unwrap();

    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "Legs", None, 120, None).await.unwrap();
    let ref_ = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();
    let set_detail = set_template::get(&pool, &set.id).await.unwrap();
    let card = &set_detail.cards[0];

    workout_template::upsert_card_assignment(&pool, &ref_.id, &card.id, Some(&ex.id), None, None, None).await.unwrap();
    exercise::delete_with_unlink(&pool, &ex.id, true).await.unwrap();

    let set_after = set_template::get(&pool, &set.id).await.unwrap();
    assert_eq!(set_after.cards[0].card_type, "placeholder");
    assert_eq!(set_after.cards[0].exercise_id, None);
    assert_eq!(set_after.cards[0].placeholder_label.as_deref(), Some("Squat"));

    let wt_after = workout_template::get(&pool, &wt.id).await.unwrap();
    assert_eq!(wt_after.assignments[0].exercise_id, None);
    assert_eq!(wt_after.assignments[0].display_label.as_deref(), Some("Squat"));
}

#[sqlx::test]
async fn test_exercise_delete_requires_confirmed_flag(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Lunge", None).await.unwrap();
    let result = exercise::delete_with_unlink(&pool, &ex.id, false).await;
    assert!(matches!(result, Err(AppError::Validation(_))));
}

// ── Session snapshot: mixed empty/non-empty sets ─────────────────────────────

#[sqlx::test]
async fn test_snapshot_skips_empty_sets(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Squat", None).await.unwrap();

    let empty_set = set_template::create(&pool, "Empty Set", None).await.unwrap();
    let set_a = set_template::create(&pool, "Set A", None).await.unwrap();
    let set_b = set_template::create(&pool, "Set B", None).await.unwrap();

    set_template::add_card(&pool, &set_a.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    set_template::add_card(&pool, &set_a.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    set_template::add_card(&pool, &set_b.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    set_template::add_card(&pool, &set_b.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    set_template::add_card(&pool, &set_b.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "Mixed Workout", None, 60, None).await.unwrap();
    workout_template::add_set_ref(&pool, &wt.id, &empty_set.id).await.unwrap();
    workout_template::add_set_ref(&pool, &wt.id, &set_a.id).await.unwrap();
    workout_template::add_set_ref(&pool, &wt.id, &set_b.id).await.unwrap();

    let payload = session::create_session_draft(&pool, &wt.id).await.unwrap();

    assert_eq!(payload.sets.len(), 2, "empty set must be skipped");
    assert_eq!(payload.exercises.len(), 5, "5 exercises across the 2 non-empty sets");
    assert_eq!(payload.session.status, "draft");
    assert!(payload.current_exercise_id.is_none());
}

// ── Snapshot fallback chains ──────────────────────────────────────────────────

#[sqlx::test]
async fn test_snapshot_fallback_chains(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Bench Press", None).await.unwrap();
    let set = set_template::create(&pool, "Push Set", None).await.unwrap();

    let card1 = set_template::add_card(
        &pool, &set.id, "concrete", Some(&ex.id), None, None, Some(45), Some("card note"),
    ).await.unwrap();

    let card2 = set_template::add_card(
        &pool, &set.id, "concrete", Some(&ex.id), None, None, None, None,
    ).await.unwrap();

    let card3 = set_template::add_card(
        &pool, &set.id, "placeholder", None, Some("push"), Some("Upper push"), None, None,
    ).await.unwrap();

    let card4 = set_template::add_card(
        &pool, &set.id, "placeholder", None, Some("legs"), None, None, None,
    ).await.unwrap();

    let card5 = set_template::add_card(
        &pool, &set.id, "placeholder", None, Some("pull"), Some("Pull slot"), None, None,
    ).await.unwrap();

    let wt = workout_template::create(&pool, "Fallback Workout", None, 120, None).await.unwrap();
    let ref_ = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    workout_template::upsert_card_assignment(
        &pool, &ref_.id, &card2.id, None, Some("My Override"), Some(30), None,
    ).await.unwrap();

    workout_template::upsert_card_assignment(
        &pool, &ref_.id, &card5.id, Some(&ex.id), None, None, None,
    ).await.unwrap();

    let payload = session::create_session_draft(&pool, &wt.id).await.unwrap();
    let exs = &payload.exercises;
    assert_eq!(exs.len(), 5);

    assert_eq!(exs[0].display_name, "Bench Press", "concrete no assignment → exercise name");
    assert_eq!(exs[0].duration_hint_sec, Some(45), "card duration preserved");
    assert_eq!(exs[0].notes.as_deref(), Some("card note"), "card notes preserved");

    assert_eq!(exs[1].display_name, "My Override", "assignment display_label overrides");
    assert_eq!(exs[1].duration_hint_sec, Some(30), "assignment duration overrides card");

    assert_eq!(exs[2].display_name, "Upper push", "placeholder label used");
    assert_eq!(exs[2].placeholder_tag.as_deref(), Some("push"), "placeholder_tag preserved");

    assert_eq!(exs[3].display_name, "legs", "placeholder tag used when no label");

    assert_eq!(exs[4].display_name, "Bench Press", "assignment exercise_id resolves placeholder");
    assert_eq!(exs[4].exercise_id.as_deref(), Some(ex.id.as_str()), "exercise_id set");

    assert_eq!(exs[2].duration_hint_sec, Some(120), "fallback to template default duration");
    assert_eq!(exs[3].duration_hint_sec, Some(120));
    assert_eq!(exs[4].duration_hint_sec, Some(120));

    // suppress unused variable warnings
    let _ = (card1, card3, card4);
}

// ── Placeholder-only workout startability ────────────────────────────────────

#[sqlx::test]
async fn test_placeholder_only_workout_is_startable(pool: SqlitePool) {
    let set = set_template::create(&pool, "Placeholder Set", None).await.unwrap();
    set_template::add_card(
        &pool, &set.id, "placeholder", None, Some("push"), Some("Push slot"), None, None,
    ).await.unwrap();

    let wt = workout_template::create(&pool, "Placeholder Workout", None, 60, None).await.unwrap();
    workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    let payload = session::create_session_draft(&pool, &wt.id).await.unwrap();
    assert_eq!(payload.exercises.len(), 1);
    assert_eq!(payload.exercises[0].exercise_id, None, "placeholder has no exercise_id");
    assert_eq!(payload.exercises[0].placeholder_tag.as_deref(), Some("push"));
    assert_eq!(payload.exercises[0].display_name, "Push slot");
}

// ── start_session transitions ────────────────────────────────────────────────

#[sqlx::test]
async fn test_start_session_transitions(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Squat", None).await.unwrap();
    let set = set_template::create(&pool, "Leg Set", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "Leg Day", None, 120, None).await.unwrap();
    workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    let draft = session::create_session_draft(&pool, &wt.id).await.unwrap();
    assert_eq!(draft.session.status, "draft");
    assert!(draft.session.started_at.is_none());
    assert!(draft.current_exercise_id.is_none());

    let started = session::start_session(&pool, &draft.session.id).await.unwrap();
    assert_eq!(started.session.status, "in_progress");
    assert!(started.session.started_at.is_some(), "started_at set");
    assert!(started.session.session_date.is_some(), "session_date set");

    let first_set = &started.sets[0];
    assert!(first_set.started_at.is_some(), "first set started_at set");

    let first_ex = started.exercises.iter().find(|e| e.status == "active");
    assert!(first_ex.is_some(), "one exercise is active");
    assert!(first_ex.unwrap().started_at.is_some(), "active exercise has started_at");

    let pending = started.exercises.iter().filter(|e| e.status == "pending").count();
    assert_eq!(pending, 1, "remaining exercise is pending");

    assert!(started.current_exercise_id.is_some());
    assert!(started.current_set_id.is_some());
}

// ── discard_session removes children via cascade ──────────────────────────────

#[sqlx::test]
async fn test_discard_session_cascades(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Pull-up", None).await.unwrap();
    let set = set_template::create(&pool, "Pull Set", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "Pull Day", None, 120, None).await.unwrap();
    workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    let payload = session::create_session_draft(&pool, &wt.id).await.unwrap();
    let session_id = payload.session.id.clone();
    let set_id = payload.sets[0].id.clone();
    let ex_id = payload.exercises[0].id.clone();

    session::discard_session(&pool, &session_id).await.unwrap();

    let mut conn = pool.acquire().await.unwrap();
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM workout_sessions WHERE id = ?"
    ).bind(&session_id).fetch_optional(&mut *conn).await.unwrap();
    assert!(row.is_none(), "session deleted");

    let set_row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM workout_session_sets WHERE id = ?"
    ).bind(&set_id).fetch_optional(&mut *conn).await.unwrap();
    assert!(set_row.is_none(), "session set deleted via CASCADE");

    let ex_row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM workout_session_exercises WHERE id = ?"
    ).bind(&ex_id).fetch_optional(&mut *conn).await.unwrap();
    assert!(ex_row.is_none(), "session exercise deleted via CASCADE");
}

// ── Helpers for runner transition tests ──────────────────────────────────────

async fn make_two_set_session(pool: &SqlitePool) -> (String, Vec<String>, Vec<String>) {
    // Returns (session_id, set_ids[2], exercise_ids[4]) for a started session
    // Set 1: 2 exercises, Set 2: 2 exercises
    let ex = exercise::create(pool, "Exercise", None).await.unwrap();

    let set_a = set_template::create(pool, "Set A", None).await.unwrap();
    let set_b = set_template::create(pool, "Set B", None).await.unwrap();

    set_template::add_card(pool, &set_a.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    set_template::add_card(pool, &set_a.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    set_template::add_card(pool, &set_b.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    set_template::add_card(pool, &set_b.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(pool, "Two Set Workout", None, 120, None).await.unwrap();
    workout_template::add_set_ref(pool, &wt.id, &set_a.id).await.unwrap();
    workout_template::add_set_ref(pool, &wt.id, &set_b.id).await.unwrap();

    let draft = session::create_session_draft(pool, &wt.id).await.unwrap();
    let started = session::start_session(pool, &draft.session.id).await.unwrap();

    let session_id = started.session.id.clone();
    let set_ids: Vec<String> = started.sets.iter().map(|s| s.id.clone()).collect();
    let ex_ids: Vec<String> = started.exercises.iter().map(|e| e.id.clone()).collect();

    (session_id, set_ids, ex_ids)
}

// ── pause / resume accumulation ──────────────────────────────────────────────

#[sqlx::test]
async fn test_pause_resume_accumulation(pool: SqlitePool) {
    let (session_id, set_ids, _) = make_two_set_session(&pool).await;
    let set_id = &set_ids[0];

    // Pause
    let paused = session::pause_session(&pool, &session_id, set_id).await.unwrap();
    let set_after_pause = paused.sets.iter().find(|s| s.id == *set_id).unwrap();
    assert!(set_after_pause.paused_at.is_some(), "paused_at set after pause");
    assert_eq!(set_after_pause.paused_total_sec, 0, "no accumulated time yet");

    // Resume (immediately — paused_total_sec will be 0 since unixepoch resolution is 1s)
    let resumed = session::resume_session(&pool, &session_id, set_id).await.unwrap();
    let set_after_resume = resumed.sets.iter().find(|s| s.id == *set_id).unwrap();
    assert!(set_after_resume.paused_at.is_none(), "paused_at cleared after resume");

    // Pause again
    let paused2 = session::pause_session(&pool, &session_id, set_id).await.unwrap();
    let set_after_pause2 = paused2.sets.iter().find(|s| s.id == *set_id).unwrap();
    assert!(set_after_pause2.paused_at.is_some(), "paused_at set again");

    // Resume again
    let resumed2 = session::resume_session(&pool, &session_id, set_id).await.unwrap();
    let set_after_resume2 = resumed2.sets.iter().find(|s| s.id == *set_id).unwrap();
    assert!(set_after_resume2.paused_at.is_none(), "paused_at cleared again");

    // Timer base is populated correctly
    assert!(resumed2.timer_base.set_started_at_ms.is_some(), "timer base has started_at");
    assert!(resumed2.timer_base.paused_at_ms.is_none(), "timer not paused");
}

// ── advance within same set ──────────────────────────────────────────────────

#[sqlx::test]
async fn test_advance_within_same_set(pool: SqlitePool) {
    let (session_id, set_ids, ex_ids) = make_two_set_session(&pool).await;
    // ex_ids: [set1_ex0, set1_ex1, set2_ex0, set2_ex1]
    // Started: set1_ex0 is active

    let advanced = session::advance_exercise(&pool, &session_id).await.unwrap();

    // set1_ex0 should now be completed
    let ex0 = advanced.exercises.iter().find(|e| e.id == ex_ids[0]).unwrap();
    assert_eq!(ex0.status, "completed", "first exercise completed");
    assert!(ex0.ended_at.is_some(), "ended_at set");

    // set1_ex1 should now be active
    let ex1 = advanced.exercises.iter().find(|e| e.id == ex_ids[1]).unwrap();
    assert_eq!(ex1.status, "active", "second exercise active");
    assert!(ex1.started_at.is_some(), "started_at set");

    // Set 1 timing unchanged (no ended_at)
    let s1 = advanced.sets.iter().find(|s| s.id == set_ids[0]).unwrap();
    assert!(s1.ended_at.is_none(), "set 1 still open");

    // current_exercise_id updated
    assert_eq!(advanced.current_exercise_id.as_deref(), Some(ex_ids[1].as_str()));
    assert_eq!(advanced.current_set_id.as_deref(), Some(set_ids[0].as_str()));
}

// ── advance across set boundary ──────────────────────────────────────────────

#[sqlx::test]
async fn test_advance_across_set_boundary(pool: SqlitePool) {
    let (session_id, set_ids, ex_ids) = make_two_set_session(&pool).await;

    // Advance twice to get into set 2
    session::advance_exercise(&pool, &session_id).await.unwrap(); // set1_ex0 → set1_ex1
    let crossed = session::advance_exercise(&pool, &session_id).await.unwrap(); // set1_ex1 → set2_ex0

    // set1_ex1 completed
    let ex1 = crossed.exercises.iter().find(|e| e.id == ex_ids[1]).unwrap();
    assert_eq!(ex1.status, "completed");

    // set1 ended
    let s1 = crossed.sets.iter().find(|s| s.id == set_ids[0]).unwrap();
    assert!(s1.ended_at.is_some(), "set 1 ended after crossing");

    // set2 started with fresh timer
    let s2 = crossed.sets.iter().find(|s| s.id == set_ids[1]).unwrap();
    assert!(s2.started_at.is_some(), "set 2 started");
    assert_eq!(s2.paused_total_sec, 0, "set 2 timer fresh");
    assert!(s2.paused_at.is_none(), "set 2 not paused");

    // set2_ex0 is active
    let ex2 = crossed.exercises.iter().find(|e| e.id == ex_ids[2]).unwrap();
    assert_eq!(ex2.status, "active");

    assert_eq!(crossed.current_set_id.as_deref(), Some(set_ids[1].as_str()));
    assert_eq!(crossed.current_exercise_id.as_deref(), Some(ex_ids[2].as_str()));
}

// ── retreat within same set ──────────────────────────────────────────────────

#[sqlx::test]
async fn test_retreat_within_same_set(pool: SqlitePool) {
    let (session_id, set_ids, ex_ids) = make_two_set_session(&pool).await;

    // Advance to set1_ex1
    session::advance_exercise(&pool, &session_id).await.unwrap();

    // Save set1's started_at before retreat
    let before = session::advance_exercise(&pool, &session_id).await; // puts us in set2
    let _ = before; // ignore, we'll retreat back

    // Actually, let's retreat from set1_ex1 position
    // Re-setup: fresh session
    let ex = exercise::create(&pool, "X", None).await.unwrap();
    let set = set_template::create(&pool, "S", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    let wt2 = workout_template::create(&pool, "W2", None, 120, None).await.unwrap();
    workout_template::add_set_ref(&pool, &wt2.id, &set.id).await.unwrap();
    let draft2 = session::create_session_draft(&pool, &wt2.id).await.unwrap();
    let s2 = session::start_session(&pool, &draft2.session.id).await.unwrap();
    let sid2 = s2.session.id.clone();
    let set2_ids: Vec<String> = s2.sets.iter().map(|s| s.id.clone()).collect();
    let ex2_ids: Vec<String> = s2.exercises.iter().map(|e| e.id.clone()).collect();

    // Record set started_at
    let set_started = s2.sets[0].started_at.clone();

    // Advance to ex1
    session::advance_exercise(&pool, &sid2).await.unwrap();

    // Retreat from ex1 → back to ex0 (same set)
    let retreated = session::retreat_exercise(&pool, &sid2).await.unwrap();

    // ex1 back to pending
    let ex1 = retreated.exercises.iter().find(|e| e.id == ex2_ids[1]).unwrap();
    assert_eq!(ex1.status, "pending", "ex1 reset to pending");
    assert!(ex1.started_at.is_none(), "ex1 started_at cleared");
    assert!(ex1.ended_at.is_none(), "ex1 ended_at cleared");

    // ex0 back to active with fresh started_at
    let ex0 = retreated.exercises.iter().find(|e| e.id == ex2_ids[0]).unwrap();
    assert_eq!(ex0.status, "active", "ex0 reactivated");
    assert!(ex0.started_at.is_some(), "ex0 started_at set");

    // Set timing unchanged (started_at same or at least not null)
    let set_row = retreated.sets.iter().find(|s| s.id == set2_ids[0]).unwrap();
    assert_eq!(set_row.started_at, set_started, "set started_at unchanged");
    assert!(set_row.ended_at.is_none(), "set not ended");

    assert_eq!(retreated.current_exercise_id.as_deref(), Some(ex2_ids[0].as_str()));
}

// ── retreat across set boundary ──────────────────────────────────────────────

#[sqlx::test]
async fn test_retreat_across_set_boundary(pool: SqlitePool) {
    let (session_id, set_ids, ex_ids) = make_two_set_session(&pool).await;

    // Advance through all of set 1 to reach set 2
    session::advance_exercise(&pool, &session_id).await.unwrap(); // → set1_ex1
    session::advance_exercise(&pool, &session_id).await.unwrap(); // → set2_ex0

    // Now retreat from set2_ex0 back to set1_ex1
    let retreated = session::retreat_exercise(&pool, &session_id).await.unwrap();

    // set2 timing fully reset
    let s2 = retreated.sets.iter().find(|s| s.id == set_ids[1]).unwrap();
    assert!(s2.started_at.is_none(), "set2 started_at cleared");
    assert!(s2.ended_at.is_none(), "set2 ended_at cleared");
    assert!(s2.paused_at.is_none(), "set2 paused_at cleared");
    assert_eq!(s2.paused_total_sec, 0, "set2 paused_total_sec reset");

    // set1 restarted with fresh timer
    let s1 = retreated.sets.iter().find(|s| s.id == set_ids[0]).unwrap();
    assert!(s1.started_at.is_some(), "set1 restarted");
    assert!(s1.ended_at.is_none(), "set1 ended_at cleared");
    assert!(s1.paused_at.is_none(), "set1 paused_at cleared");
    assert_eq!(s1.paused_total_sec, 0, "set1 paused_total_sec reset");

    // set2_ex0 reset to pending
    let ex2_0 = retreated.exercises.iter().find(|e| e.id == ex_ids[2]).unwrap();
    assert_eq!(ex2_0.status, "pending");
    assert!(ex2_0.started_at.is_none());

    // set1_ex1 is active
    let ex1_1 = retreated.exercises.iter().find(|e| e.id == ex_ids[1]).unwrap();
    assert_eq!(ex1_1.status, "active");
    assert!(ex1_1.started_at.is_some());

    assert_eq!(retreated.current_exercise_id.as_deref(), Some(ex_ids[1].as_str()));
    assert_eq!(retreated.current_set_id.as_deref(), Some(set_ids[0].as_str()));
}

// ── retreat at first exercise returns error ───────────────────────────────────

#[sqlx::test]
async fn test_retreat_at_first_exercise_errors(pool: SqlitePool) {
    let (session_id, _, _) = make_two_set_session(&pool).await;
    let result = session::retreat_exercise(&pool, &session_id).await;
    assert!(
        matches!(result, Err(AppError::Validation(_))),
        "should error at first exercise, got: {:?}", result
    );
}

// ── skip persistence ─────────────────────────────────────────────────────────

#[sqlx::test]
async fn test_skip_exercise_persistence(pool: SqlitePool) {
    let (session_id, set_ids, ex_ids) = make_two_set_session(&pool).await;

    // Skip the first exercise
    let skipped = session::skip_exercise(&pool, &session_id, &ex_ids[0]).await.unwrap();

    // Skipped exercise preserved with correct fields
    let ex0 = skipped.exercises.iter().find(|e| e.id == ex_ids[0]).unwrap();
    assert_eq!(ex0.status, "skipped", "status = skipped");
    assert_eq!(ex0.skipped, 1, "skipped flag set");
    assert!(ex0.ended_at.is_some(), "ended_at set on skip");

    // Next exercise is now active
    let ex1 = skipped.exercises.iter().find(|e| e.id == ex_ids[1]).unwrap();
    assert_eq!(ex1.status, "active", "next exercise activated");

    // Set still open (same set)
    let s1 = skipped.sets.iter().find(|s| s.id == set_ids[0]).unwrap();
    assert!(s1.ended_at.is_none(), "set still open");

    assert_eq!(skipped.current_exercise_id.as_deref(), Some(ex_ids[1].as_str()));
}

// ── finish_session closes all open rows ──────────────────────────────────────

#[sqlx::test]
async fn test_finish_session_closes_rows(pool: SqlitePool) {
    let (session_id, _, _) = make_two_set_session(&pool).await;

    let finished = session::finish_session(&pool, &session_id).await.unwrap();

    assert_eq!(finished.status, "completed", "session completed");
    assert!(finished.ended_at.is_some(), "session ended_at set");

    // Verify via direct query
    let mut conn = pool.acquire().await.unwrap();
    let session_row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT status, ended_at FROM workout_sessions WHERE id = ?"
    ).bind(&session_id).fetch_optional(&mut *conn).await.unwrap();
    let (status, ended_at) = session_row.unwrap();
    assert_eq!(status, "completed");
    assert!(ended_at.is_some());

    // The first set (which was started and contained the active exercise) has ended_at.
    // Spec §9.17 only closes the CURRENT set; unstarted future sets remain with ended_at=NULL.
    let started_set_open: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM workout_session_sets WHERE workout_session_id = ? AND started_at IS NOT NULL AND ended_at IS NULL"
    ).bind(&session_id).fetch_optional(&mut *conn).await.unwrap();
    assert!(started_set_open.is_none(), "all started sets should have ended_at after finish");

    // The current (active) exercise has ended_at set.
    // Spec §9.17 only sets ended_at on the exercise; status stays 'active' (it was the last active).
    let ex_active_no_end: Option<(String,)> = sqlx::query_as(
        "SELECT wse.id FROM workout_session_exercises wse
         JOIN workout_session_sets wss ON wss.id = wse.workout_session_set_id
         WHERE wss.workout_session_id = ? AND wse.status = 'active' AND wse.ended_at IS NULL"
    ).bind(&session_id).fetch_optional(&mut *conn).await.unwrap();
    assert!(ex_active_no_end.is_none(), "active exercise should have ended_at set after finish");
}

// ── abandon_session ───────────────────────────────────────────────────────────

#[sqlx::test]
async fn test_abandon_session(pool: SqlitePool) {
    let (session_id, set_ids, ex_ids) = make_two_set_session(&pool).await;

    session::abandon_session(&pool, &session_id).await.unwrap();

    let mut conn = pool.acquire().await.unwrap();
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT status, ended_at FROM workout_sessions WHERE id = ?"
    ).bind(&session_id).fetch_optional(&mut *conn).await.unwrap();
    let (status, ended_at) = row.unwrap();
    assert_eq!(status, "abandoned", "session abandoned");
    assert!(ended_at.is_some(), "ended_at set");

    // Child rows NOT deleted (unlike discard)
    let set_row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM workout_session_sets WHERE id = ?"
    ).bind(&set_ids[0]).fetch_optional(&mut *conn).await.unwrap();
    assert!(set_row.is_some(), "set row preserved on abandon");

    let ex_row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM workout_session_exercises WHERE id = ?"
    ).bind(&ex_ids[0]).fetch_optional(&mut *conn).await.unwrap();
    assert!(ex_row.is_some(), "exercise row preserved on abandon");
}

// ── pause then cross-set retreat clears paused state ─────────────────────────

#[sqlx::test]
async fn test_paused_cross_set_retreat_clears_pause(pool: SqlitePool) {
    let (session_id, set_ids, ex_ids) = make_two_set_session(&pool).await;

    // Advance through set 1 into set 2
    session::advance_exercise(&pool, &session_id).await.unwrap();
    session::advance_exercise(&pool, &session_id).await.unwrap();

    // Pause set 2
    session::pause_session(&pool, &session_id, &set_ids[1]).await.unwrap();

    // Retreat across set boundary
    let retreated = session::retreat_exercise(&pool, &session_id).await.unwrap();

    // set2 fully cleared
    let s2 = retreated.sets.iter().find(|s| s.id == set_ids[1]).unwrap();
    assert!(s2.paused_at.is_none(), "set2 paused_at cleared by retreat");
    assert_eq!(s2.paused_total_sec, 0, "set2 paused_total_sec reset");
    assert!(s2.started_at.is_none(), "set2 started_at cleared");

    // set1 restarted cleanly
    let s1 = retreated.sets.iter().find(|s| s.id == set_ids[0]).unwrap();
    assert!(s1.started_at.is_some(), "set1 restarted");
    assert!(s1.paused_at.is_none(), "set1 not paused");
    assert_eq!(s1.paused_total_sec, 0, "set1 paused_total_sec reset");

    // last exercise of set1 is active
    let ex1_1 = retreated.exercises.iter().find(|e| e.id == ex_ids[1]).unwrap();
    assert_eq!(ex1_1.status, "active");

    assert_eq!(retreated.current_set_id.as_deref(), Some(set_ids[0].as_str()));
}

// ── History: completed session appears ────────────────────────────────────────

#[sqlx::test]
async fn test_history_completed_appears(pool: SqlitePool) {
    let (session_id, _, _) = make_two_set_session(&pool).await;
    session::finish_session(&pool, &session_id).await.unwrap();

    let history = history_db::list_sessions(&pool).await.unwrap();
    assert!(history.iter().any(|s| s.id == session_id), "completed session in history");
    let entry = history.iter().find(|s| s.id == session_id).unwrap();
    assert_eq!(entry.status, "completed");
    assert!(entry.set_count >= 1, "set_count populated");
    assert!(entry.exercise_count >= 1, "exercise_count populated");
}

// ── History: draft excluded ────────────────────────────────────────────────────

#[sqlx::test]
async fn test_history_draft_excluded(pool: SqlitePool) {
    let ex = exercise::create(&pool, "X", None).await.unwrap();
    let set = set_template::create(&pool, "S", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    let wt = workout_template::create(&pool, "W", None, 60, None).await.unwrap();
    workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    let draft = session::create_session_draft(&pool, &wt.id).await.unwrap();

    let history = history_db::list_sessions(&pool).await.unwrap();
    assert!(!history.iter().any(|s| s.id == draft.session.id), "draft excluded from history");
}

// ── History: abandoned excluded ───────────────────────────────────────────────

#[sqlx::test]
async fn test_history_abandoned_excluded(pool: SqlitePool) {
    let (session_id, _, _) = make_two_set_session(&pool).await;
    session::abandon_session(&pool, &session_id).await.unwrap();

    let history = history_db::list_sessions(&pool).await.unwrap();
    assert!(!history.iter().any(|s| s.id == session_id), "abandoned excluded from history");
}

// ── History: denormalized names stable after exercise delete ─────────────────

#[sqlx::test]
async fn test_history_denormalized_names_stable(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Burpee", None).await.unwrap();
    let set = set_template::create(&pool, "S", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();
    let wt = workout_template::create(&pool, "W", None, 60, None).await.unwrap();
    workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    let draft = session::create_session_draft(&pool, &wt.id).await.unwrap();
    session::start_session(&pool, &draft.session.id).await.unwrap();
    session::finish_session(&pool, &draft.session.id).await.unwrap();

    exercise::delete_with_unlink(&pool, &ex.id, true).await.unwrap();

    let mut conn = pool.acquire().await.unwrap();
    let exercises = history_db::get_exercises_for_set(&mut conn, &draft.sets[0].id).await.unwrap();
    assert!(!exercises.is_empty(), "exercise row preserved");
    assert_eq!(exercises[0].display_name, "Burpee", "display_name stable after exercise delete");
}

// ── History: detail returns ordered sets and exercises ────────────────────────

#[sqlx::test]
async fn test_history_detail_ordered(pool: SqlitePool) {
    let (session_id, set_ids, ex_ids) = make_two_set_session(&pool).await;
    session::finish_session(&pool, &session_id).await.unwrap();

    let session_row = history_db::get_session_row(&pool, &session_id).await.unwrap().unwrap();
    assert_eq!(session_row.id, session_id);

    let mut conn = pool.acquire().await.unwrap();
    let sets = history_db::get_session_sets(&mut conn, &session_id).await.unwrap();
    assert_eq!(sets.len(), 2, "two sets");
    assert_eq!(sets[0].id, set_ids[0], "set order preserved");
    assert_eq!(sets[1].id, set_ids[1]);

    let exs0 = history_db::get_exercises_for_set(&mut conn, &set_ids[0]).await.unwrap();
    assert_eq!(exs0.len(), 2, "two exercises in set 1");
    assert_eq!(exs0[0].id, ex_ids[0], "exercise order preserved");
    assert_eq!(exs0[1].id, ex_ids[1]);
}

// ── Fork: targeted set ref points to new template ────────────────────────────

#[sqlx::test]
async fn test_fork_targeted_ref_reppoints(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Push-up", None).await.unwrap();
    let set = set_template::create(&pool, "Push Set", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "W", None, 60, None).await.unwrap();
    let ref1 = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    let new_ref = workout_template::clone_set_from_workout(&pool, &ref1.id).await.unwrap();

    // The returned ref must point at a NEW set template (not the original)
    assert_ne!(new_ref.set_template_id, set.id, "forked ref must point at clone, not original");
    // And it records the original for provenance
    assert_eq!(
        new_ref.source_set_template_id.as_deref(),
        Some(set.id.as_str()),
        "source_set_template_id must record the original"
    );
    // The ref ID itself is new
    assert_ne!(new_ref.id, ref1.id, "fork produces a new ref row");
    // Order index preserved
    assert_eq!(new_ref.order_index, ref1.order_index);
}

// ── Fork: sibling set ref still points to original ───────────────────────────

#[sqlx::test]
async fn test_fork_sibling_ref_unchanged(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Squat", None).await.unwrap();
    let set = set_template::create(&pool, "Leg Set", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "W", None, 60, None).await.unwrap();
    // Add the same set twice
    let ref1 = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();
    let ref2 = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    // Fork the first occurrence only
    workout_template::clone_set_from_workout(&pool, &ref1.id).await.unwrap();

    // Re-fetch the workout to inspect its current set refs
    let detail = workout_template::get(&pool, &wt.id).await.unwrap();

    // ref2 must still point at the original set
    let surviving_ref2 = detail.set_refs.iter().find(|r| r.id == ref2.id)
        .expect("ref2 must still exist");
    assert_eq!(surviving_ref2.set_template_id, set.id, "sibling ref still points at original");
    assert!(surviving_ref2.source_set_template_id.is_none(), "sibling ref is not a fork");

    // The forked ref must point at something different
    let forked_ref = detail.set_refs.iter().find(|r| r.id != ref2.id)
        .expect("forked ref must exist");
    assert_ne!(forked_ref.set_template_id, set.id, "forked ref points at clone");
    assert!(forked_ref.source_set_template_id.is_some(), "forked ref has source_set_template_id");
}

// ── Fork: editing original after fork does not affect forked ref's cards ─────

#[sqlx::test]
async fn test_fork_original_edits_do_not_affect_clone(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Lunge", None).await.unwrap();
    let set = set_template::create(&pool, "Cardio Set", None).await.unwrap();
    let card = set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "W", None, 60, None).await.unwrap();
    let ref1 = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    let new_ref = workout_template::clone_set_from_workout(&pool, &ref1.id).await.unwrap();
    let cloned_set_id = new_ref.set_template_id.clone();

    // Count cards in the clone before editing original
    let cloned_detail_before = set_template::get(&pool, &cloned_set_id).await.unwrap();
    assert_eq!(cloned_detail_before.cards.len(), 1, "clone starts with 1 card");

    // Add a card to the ORIGINAL set
    let ex2 = exercise::create(&pool, "Jump", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex2.id), None, None, None, None).await.unwrap();

    // Remove the original card from the ORIGINAL set
    set_template::remove_card(&pool, &card.id).await.unwrap();

    // Verify original set now has 1 card (the new one)
    let original_detail = set_template::get(&pool, &set.id).await.unwrap();
    assert_eq!(original_detail.cards.len(), 1);
    assert_eq!(original_detail.cards[0].exercise_id.as_deref(), Some(ex2.id.as_str()));

    // The clone must be UNAFFECTED — still has the original card
    let cloned_detail_after = set_template::get(&pool, &cloned_set_id).await.unwrap();
    assert_eq!(cloned_detail_after.cards.len(), 1, "clone card count unchanged");
    assert_eq!(
        cloned_detail_after.cards[0].exercise_id.as_deref(),
        Some(ex.id.as_str()),
        "clone still has the original exercise, not the new one from the original set"
    );
}

// ── Workout-local fork model ─────────────────────────────────────────────────

#[sqlx::test]
async fn test_fork_creates_local_set(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Squat", None).await.unwrap();
    let set = set_template::create(&pool, "Global Set", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "My Workout", None, 60, None).await.unwrap();
    let set_ref = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();

    let new_ref = workout_template::clone_set_from_workout(&pool, &set_ref.id).await.unwrap();

    // The forked set must be owned by the workout
    let forked = set_template::get(&pool, &new_ref.set_template_id).await.unwrap();
    assert_eq!(
        forked.owning_workout_template_id.as_deref(),
        Some(wt.id.as_str()),
        "forked set must be owned by the workout"
    );
}

#[sqlx::test]
async fn test_fork_hidden_from_global_library(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Press", None).await.unwrap();
    let set = set_template::create(&pool, "My Set", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "Workout", None, 60, None).await.unwrap();
    let set_ref = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();
    workout_template::clone_set_from_workout(&pool, &set_ref.id).await.unwrap();

    // Global library must only show the original
    let global_sets = set_template::list(&pool).await.unwrap();
    assert_eq!(global_sets.len(), 1, "only the original global set should appear");
    assert_eq!(global_sets[0].id, set.id, "it must be the original");
}

#[sqlx::test]
async fn test_fork_loadable_via_workout(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Row", None).await.unwrap();
    let set = set_template::create(&pool, "Pull Set", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "Workout", None, 60, None).await.unwrap();
    let set_ref = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();
    let new_ref = workout_template::clone_set_from_workout(&pool, &set_ref.id).await.unwrap();

    // The forked set should be accessible directly (for editing from workout flow)
    let forked = set_template::get(&pool, &new_ref.set_template_id).await.unwrap();
    assert_eq!(forked.cards.len(), 1, "forked set has the card from the original");
}

#[sqlx::test]
async fn test_export_forked_set_creates_global(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Curl", None).await.unwrap();
    let set = set_template::create(&pool, "Arm Set", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "Workout", None, 60, None).await.unwrap();
    let set_ref = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();
    let new_ref = workout_template::clone_set_from_workout(&pool, &set_ref.id).await.unwrap();

    let exported = workout_template::export_forked_set(&pool, &new_ref.set_template_id, "Exported Arm Set")
        .await
        .unwrap();

    assert_eq!(exported.name, "Exported Arm Set");
    assert_eq!(exported.owning_workout_template_id, None, "exported set must be global");

    // Global library must now show the original + the export (not the local fork)
    let global_sets = set_template::list(&pool).await.unwrap();
    assert_eq!(global_sets.len(), 2, "original + export in global library");
    let names: Vec<&str> = global_sets.iter().map(|s| s.name.as_str()).collect();
    assert!(names.contains(&"Arm Set"), "original present");
    assert!(names.contains(&"Exported Arm Set"), "export present");
}

#[sqlx::test]
async fn test_export_rejects_already_global_set(pool: SqlitePool) {
    let set = set_template::create(&pool, "Global", None).await.unwrap();
    let result = workout_template::export_forked_set(&pool, &set.id, "New Name").await;
    assert!(
        matches!(result, Err(AppError::Validation(_))),
        "exporting a global set should fail with Validation: {:?}",
        result
    );
}

#[sqlx::test]
async fn test_delete_workout_cleans_up_local_sets(pool: SqlitePool) {
    let ex = exercise::create(&pool, "Deadlift", None).await.unwrap();
    let set = set_template::create(&pool, "Lift Set", None).await.unwrap();
    set_template::add_card(&pool, &set.id, "concrete", Some(&ex.id), None, None, None, None).await.unwrap();

    let wt = workout_template::create(&pool, "My Workout", None, 60, None).await.unwrap();
    let set_ref = workout_template::add_set_ref(&pool, &wt.id, &set.id).await.unwrap();
    let new_ref = workout_template::clone_set_from_workout(&pool, &set_ref.id).await.unwrap();
    let forked_set_id = new_ref.set_template_id.clone();

    // Verify fork exists
    let forked = set_template::get(&pool, &forked_set_id).await.unwrap();
    assert_eq!(forked.owning_workout_template_id.as_deref(), Some(wt.id.as_str()));

    // Delete the workout
    workout_template::delete(&pool, &wt.id).await.unwrap();

    // Local fork must be gone
    let result = set_template::get(&pool, &forked_set_id).await;
    assert!(
        matches!(result, Err(AppError::NotFound(_))),
        "forked set must be deleted with its owning workout: {:?}",
        result
    );

    // Original global set must still exist
    let global = set_template::list(&pool).await.unwrap();
    assert_eq!(global.len(), 1, "original global set remains");
    assert_eq!(global[0].id, set.id);
}

// ── performed_duration_sec: advance stores duration ──────────────────────────

#[sqlx::test]
async fn test_advance_stores_performed_duration(pool: SqlitePool) {
    let (session_id, _, ex_ids) = make_two_set_session(&pool).await;
    // ex_ids[0] is active after start_session

    let advanced = session::advance_exercise(&pool, &session_id).await.unwrap();

    let ex0 = advanced.exercises.iter().find(|e| e.id == ex_ids[0]).unwrap();
    assert_eq!(ex0.status, "completed");
    assert!(
        ex0.performed_duration_sec.is_some(),
        "performed_duration_sec must be set after advance"
    );
    assert!(
        ex0.performed_duration_sec.unwrap() >= 0,
        "performed_duration_sec must be non-negative"
    );

    // The newly active exercise has no performed_duration_sec yet
    let ex1 = advanced.exercises.iter().find(|e| e.id == ex_ids[1]).unwrap();
    assert_eq!(ex1.status, "active");
    assert!(
        ex1.performed_duration_sec.is_none(),
        "active exercise must not yet have performed_duration_sec"
    );
}

// ── performed_duration_sec: skip stores duration ─────────────────────────────

#[sqlx::test]
async fn test_skip_stores_performed_duration(pool: SqlitePool) {
    let (session_id, _, ex_ids) = make_two_set_session(&pool).await;

    let skipped = session::skip_exercise(&pool, &session_id, &ex_ids[0]).await.unwrap();

    let ex0 = skipped.exercises.iter().find(|e| e.id == ex_ids[0]).unwrap();
    assert_eq!(ex0.status, "skipped");
    assert!(
        ex0.performed_duration_sec.is_some(),
        "performed_duration_sec must be set after skip"
    );
    assert!(ex0.performed_duration_sec.unwrap() >= 0);
}

// ── performed_duration_sec: finish stores duration for active exercise ────────

#[sqlx::test]
async fn test_finish_stores_performed_duration(pool: SqlitePool) {
    let (session_id, _, ex_ids) = make_two_set_session(&pool).await;

    session::finish_session(&pool, &session_id).await.unwrap();

    // After finish, verify via direct DB query that the active exercise got a duration
    let mut conn = pool.acquire().await.unwrap();
    let row: Option<(Option<i64>,)> = sqlx::query_as(
        "SELECT performed_duration_sec FROM workout_session_exercises WHERE id = ?"
    )
    .bind(&ex_ids[0])
    .fetch_optional(&mut *conn)
    .await
    .unwrap();

    let (performed,) = row.unwrap();
    assert!(
        performed.is_some(),
        "performed_duration_sec must be set after finish"
    );
    assert!(performed.unwrap() >= 0);
}

// ── performed_duration_sec: pause time excluded ───────────────────────────────

#[sqlx::test]
async fn test_pause_time_excluded_from_performed_duration(pool: SqlitePool) {
    let (session_id, set_ids, ex_ids) = make_two_set_session(&pool).await;

    // Pause immediately after start
    session::pause_session(&pool, &session_id, &set_ids[0]).await.unwrap();
    // Resume immediately (paused_total_sec ≈ 0 due to 1s unixepoch resolution in SQLite)
    session::resume_session(&pool, &session_id, &set_ids[0]).await.unwrap();

    // Pause again
    session::pause_session(&pool, &session_id, &set_ids[0]).await.unwrap();
    // Resume again (implicit resume will also fire on advance)
    session::resume_session(&pool, &session_id, &set_ids[0]).await.unwrap();

    // Advance — this triggers implicit resume (no-op since already resumed) then completes ex0
    let advanced = session::advance_exercise(&pool, &session_id).await.unwrap();

    let ex0 = advanced.exercises.iter().find(|e| e.id == ex_ids[0]).unwrap();
    assert_eq!(ex0.status, "completed");
    assert!(ex0.performed_duration_sec.is_some());
    // The duration should be roughly 0 (wall time) minus pause overhead.
    // Critically it must not be negative and must not exceed the raw wall clock delta.
    assert!(ex0.performed_duration_sec.unwrap() >= 0, "duration never negative");

    // Verify paused_offset_sec was set to 0 at exercise start (set started fresh)
    assert_eq!(ex0.paused_offset_sec, 0, "paused_offset_sec at exercise start was 0");
}

// ── performed_duration_sec: corrective Prev clears duration ──────────────────

#[sqlx::test]
async fn test_prev_clears_performed_duration(pool: SqlitePool) {
    let (session_id, _, ex_ids) = make_two_set_session(&pool).await;

    // Advance to ex1 — this completes ex0 and stores its performed_duration_sec
    session::advance_exercise(&pool, &session_id).await.unwrap();

    // Retreat — ex1 goes back to pending, ex0 gets reactivated
    let retreated = session::retreat_exercise(&pool, &session_id).await.unwrap();

    // ex1 (which was active briefly) must have performed_duration_sec cleared
    let ex1 = retreated.exercises.iter().find(|e| e.id == ex_ids[1]).unwrap();
    assert_eq!(ex1.status, "pending");
    assert!(
        ex1.performed_duration_sec.is_none(),
        "performed_duration_sec must be cleared when exercise is pended by Prev"
    );

    // ex0 (reactivated) must also have no stored duration yet (fresh attempt)
    let ex0 = retreated.exercises.iter().find(|e| e.id == ex_ids[0]).unwrap();
    assert_eq!(ex0.status, "active");
    assert!(
        ex0.performed_duration_sec.is_none(),
        "reactivated exercise must not carry over prior performed_duration_sec"
    );

    // Advance again — now ex0 completes a second time and gets a fresh duration
    let readv = session::advance_exercise(&pool, &session_id).await.unwrap();
    let ex0_second = readv.exercises.iter().find(|e| e.id == ex_ids[0]).unwrap();
    assert_eq!(ex0_second.status, "completed");
    assert!(
        ex0_second.performed_duration_sec.is_some(),
        "second attempt stores performed_duration_sec"
    );
}
