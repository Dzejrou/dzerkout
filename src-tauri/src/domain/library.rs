use std::collections::{HashMap, HashSet};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::{
    db::{exercises as db_ex, set_templates as db_sets, workout_templates as db_wt},
    domain::types::VALID_EXERCISE_TAGS,
    error::AppError,
};

// ── JSON schema structs ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryExport {
    pub schema: String,
    pub version: u32,
    pub exported_at: String,
    pub exercises: Vec<ExportedExercise>,
    pub set_templates: Vec<ExportedSetTemplate>,
    pub workout_templates: Vec<ExportedWorkoutTemplate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedExercise {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedSetTemplate {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    /// null = global library set; non-null = owned by a workout template
    pub owning_workout_template_id: Option<String>,
    pub cards: Vec<ExportedCard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedCard {
    pub id: String,
    pub order_index: i64,
    /// "concrete" | "placeholder"
    pub card_type: String,
    pub exercise_id: Option<String>,
    pub placeholder_tag: Option<String>,
    pub placeholder_label: Option<String>,
    pub duration_hint_sec: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedWorkoutTemplate {
    pub id: String,
    pub name: String,
    pub notes: Option<String>,
    pub default_exercise_duration_sec: i64,
    pub rest_between_sets_sec: Option<i64>,
    pub set_refs: Vec<ExportedSetRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedSetRef {
    pub id: String,
    pub set_template_id: String,
    pub order_index: i64,
    pub set_name: String,
    pub source_set_template_id: Option<String>,
    pub assignments: Vec<ExportedAssignment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedAssignment {
    pub id: String,
    pub set_template_card_id: String,
    pub exercise_id: Option<String>,
    pub display_label: Option<String>,
    pub duration_hint_sec: Option<i64>,
    pub notes: Option<String>,
}

/// Counts returned to the caller after a successful import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub exercises_created: u32,
    pub exercises_updated: u32,
    pub sets_created: u32,
    pub sets_updated: u32,
    pub workouts_created: u32,
    pub workouts_updated: u32,
}

// ── Export ────────────────────────────────────────────────────────────────────

pub async fn export_full_library(pool: &SqlitePool) -> Result<String, AppError> {
    // Exercises + tags
    let exercise_rows = db_ex::find_all(pool).await?;
    let mut tags_map = db_ex::fetch_all_tags(pool).await?;
    let exercises: Vec<ExportedExercise> = exercise_rows
        .into_iter()
        .map(|row| ExportedExercise {
            tags: tags_map.remove(&row.id).unwrap_or_default(),
            id: row.id,
            name: row.name,
            notes: row.notes,
        })
        .collect();

    let mut conn = pool.acquire().await?;

    // All set templates (global + workout-local), with their cards
    let set_rows = db_sets::find_all_for_export(&mut conn).await?;
    let mut set_templates: Vec<ExportedSetTemplate> = Vec::with_capacity(set_rows.len());
    for row in &set_rows {
        let cards = db_sets::find_cards(&mut conn, &row.id).await?;
        set_templates.push(ExportedSetTemplate {
            id: row.id.clone(),
            name: row.name.clone(),
            notes: row.notes.clone(),
            owning_workout_template_id: row.owning_workout_template_id.clone(),
            cards: cards
                .into_iter()
                .map(|c| ExportedCard {
                    id: c.id,
                    order_index: c.order_index,
                    card_type: c.card_type,
                    exercise_id: c.exercise_id,
                    placeholder_tag: c.placeholder_tag,
                    placeholder_label: c.placeholder_label,
                    duration_hint_sec: c.duration_hint_sec,
                    notes: c.notes,
                })
                .collect(),
        });
    }

    // Workout templates with set_refs and nested assignments
    let wt_rows = db_wt::find_all_rows(pool).await?;
    let mut workout_templates: Vec<ExportedWorkoutTemplate> = Vec::with_capacity(wt_rows.len());
    for row in &wt_rows {
        let set_refs = db_wt::find_set_refs(&mut conn, &row.id).await?;
        let assignments = db_wt::find_assignments_for_workout(&mut conn, &row.id).await?;

        // Group assignments by set_ref_id for efficient lookup
        let mut asgn_by_ref: HashMap<&str, Vec<&_>> = HashMap::new();
        for a in &assignments {
            asgn_by_ref
                .entry(&a.workout_template_set_ref_id)
                .or_default()
                .push(a);
        }

        let exported_refs = set_refs
            .iter()
            .map(|r| ExportedSetRef {
                id: r.id.clone(),
                set_template_id: r.set_template_id.clone(),
                order_index: r.order_index,
                set_name: r.set_name.clone(),
                source_set_template_id: r.source_set_template_id.clone(),
                assignments: asgn_by_ref
                    .get(r.id.as_str())
                    .map(|asgns| {
                        asgns
                            .iter()
                            .map(|a| ExportedAssignment {
                                id: a.id.clone(),
                                set_template_card_id: a.set_template_card_id.clone(),
                                exercise_id: a.exercise_id.clone(),
                                display_label: a.display_label.clone(),
                                duration_hint_sec: a.duration_hint_sec,
                                notes: a.notes.clone(),
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            })
            .collect();

        workout_templates.push(ExportedWorkoutTemplate {
            id: row.id.clone(),
            name: row.name.clone(),
            notes: row.notes.clone(),
            default_exercise_duration_sec: row.default_exercise_duration_sec,
            rest_between_sets_sec: row.rest_between_sets_sec,
            set_refs: exported_refs,
        });
    }

    let export = LibraryExport {
        schema: "dzerkout.library".to_string(),
        version: 1,
        exported_at: Utc::now().to_rfc3339(),
        exercises,
        set_templates,
        workout_templates,
    };

    serde_json::to_string_pretty(&export)
        .map_err(|e| AppError::Database(format!("serialization error: {e}")))
}

// ── Import ────────────────────────────────────────────────────────────────────

pub async fn import_library_json(pool: &SqlitePool, json: &str) -> Result<ImportResult, AppError> {
    // ── Parse ─────────────────────────────────────────────────────────────────
    let lib: LibraryExport = serde_json::from_str(json)
        .map_err(|e| AppError::Validation(format!("invalid JSON: {e}")))?;

    if lib.schema != "dzerkout.library" {
        return Err(AppError::Validation(format!(
            "unknown schema '{}'; expected 'dzerkout.library'",
            lib.schema
        )));
    }
    if lib.version != 1 {
        return Err(AppError::Validation(format!(
            "unsupported version {}; only version 1 is supported",
            lib.version
        )));
    }

    // ── Pre-validation (in-memory) ────────────────────────────────────────────

    let import_exercise_ids: HashSet<&str> =
        lib.exercises.iter().map(|e| e.id.as_str()).collect();
    let import_set_ids: HashSet<&str> =
        lib.set_templates.iter().map(|s| s.id.as_str()).collect();

    // card_id -> owning set_template_id (from import data)
    let mut card_to_set: HashMap<&str, &str> = HashMap::new();
    for st in &lib.set_templates {
        for card in &st.cards {
            card_to_set.insert(card.id.as_str(), st.id.as_str());
        }
    }

    // Validate exercise tags
    for ex in &lib.exercises {
        for tag in &ex.tags {
            if !VALID_EXERCISE_TAGS.contains(&tag.as_str()) {
                return Err(AppError::Validation(format!(
                    "exercise '{}': invalid tag '{tag}'. Valid tags: {}",
                    ex.name,
                    VALID_EXERCISE_TAGS.join(", ")
                )));
            }
        }
    }

    // Validate card types / required fields
    for st in &lib.set_templates {
        for card in &st.cards {
            match card.card_type.as_str() {
                "concrete" => {
                    if card.exercise_id.is_none() {
                        return Err(AppError::Validation(format!(
                            "set '{}' card '{}': concrete card is missing exercise_id",
                            st.name, card.id
                        )));
                    }
                }
                "placeholder" => {
                    if card.placeholder_tag.is_none() {
                        return Err(AppError::Validation(format!(
                            "set '{}' card '{}': placeholder card is missing placeholder_tag",
                            st.name, card.id
                        )));
                    }
                }
                other => {
                    return Err(AppError::Validation(format!(
                        "set '{}' card '{}': unknown card_type '{other}'",
                        st.name, card.id
                    )));
                }
            }
        }
    }

    // Validate assignments: card must belong to the set referenced by set_ref
    for wt in &lib.workout_templates {
        for ref_ in &wt.set_refs {
            for a in &ref_.assignments {
                if let Some(card_set_id) = card_to_set.get(a.set_template_card_id.as_str()) {
                    if *card_set_id != ref_.set_template_id.as_str() {
                        return Err(AppError::Validation(format!(
                            "workout '{}' set_ref '{}': assignment card '{}' belongs to set '{}', \
                             but set_ref points to '{}'",
                            wt.name,
                            ref_.id,
                            a.set_template_card_id,
                            card_set_id,
                            ref_.set_template_id
                        )));
                    }
                }
                // Cards not in the import payload are assumed to already exist in the DB;
                // FK constraints at write time will catch true dangling references.
            }
        }
    }

    // ── Open transaction + DB-side validation ──────────────────────────────────
    let mut tx = pool.begin().await?;

    let existing_exercise_ids: HashSet<String> = sqlx::query!("SELECT id FROM exercises")
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|r| r.id)
        .collect();

    let existing_set_ids: HashSet<String> = sqlx::query!("SELECT id FROM set_templates")
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|r| r.id)
        .collect();

    // Build the full universe of resolvable IDs (import + DB)
    let available_exercise_ids: HashSet<&str> = import_exercise_ids
        .iter()
        .copied()
        .chain(existing_exercise_ids.iter().map(|s: &String| s.as_str()))
        .collect();

    let available_set_ids: HashSet<&str> = import_set_ids
        .iter()
        .copied()
        .chain(existing_set_ids.iter().map(|s: &String| s.as_str()))
        .collect();

    // Validate concrete card exercise references
    for st in &lib.set_templates {
        for card in &st.cards {
            if card.card_type == "concrete" {
                let eid = card.exercise_id.as_deref().unwrap(); // already validated non-None above
                if !available_exercise_ids.contains(eid) {
                    return Err(AppError::Validation(format!(
                        "set '{}' card '{}': exercise_id '{eid}' not found in import or DB",
                        st.name, card.id
                    )));
                }
            }
        }
    }

    // Validate set_ref set_template references
    for wt in &lib.workout_templates {
        for ref_ in &wt.set_refs {
            if !available_set_ids.contains(ref_.set_template_id.as_str()) {
                return Err(AppError::Validation(format!(
                    "workout '{}' set_ref '{}': set_template_id '{}' not found in import or DB",
                    wt.name, ref_.id, ref_.set_template_id
                )));
            }
        }
    }

    let existing_workout_ids: HashSet<String> =
        sqlx::query!("SELECT id FROM workout_templates")
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .map(|r| r.id)
            .collect();

    // ── DB-side validation: assignment cards not in import payload ───────────────
    // The in-memory card_to_set map only covers cards present in the JSON.
    // For assignments pointing at cards already in the DB, verify ownership here.
    let import_card_ids: HashSet<&str> = card_to_set.keys().copied().collect();
    for wt in &lib.workout_templates {
        for ref_ in &wt.set_refs {
            for a in &ref_.assignments {
                let card_id = a.set_template_card_id.as_str();
                if !import_card_ids.contains(card_id) {
                    let row = sqlx::query!(
                        "SELECT set_template_id FROM set_template_cards WHERE id = ?",
                        card_id
                    )
                    .fetch_optional(&mut *tx)
                    .await?;

                    match row {
                        None => {
                            return Err(AppError::Validation(format!(
                                "workout '{}' set_ref '{}': assignment card '{}' not found \
                                 in import or DB",
                                wt.name, ref_.id, card_id
                            )));
                        }
                        Some(r) => {
                            if r.set_template_id != ref_.set_template_id {
                                return Err(AppError::Validation(format!(
                                    "workout '{}' set_ref '{}': assignment card '{}' belongs \
                                     to set '{}', but set_ref points to '{}'",
                                    wt.name,
                                    ref_.id,
                                    card_id,
                                    r.set_template_id,
                                    ref_.set_template_id
                                )));
                            }
                        }
                    }
                }
            }
        }
    }

    // ── Writes ─────────────────────────────────────────────────────────────────
    // Write order is FK-safe:
    //   exercises → workout template headers → set templates (may FK → workouts)
    //   → set template cards → set refs → assignments

    let mut result = ImportResult {
        exercises_created: 0,
        exercises_updated: 0,
        sets_created: 0,
        sets_updated: 0,
        workouts_created: 0,
        workouts_updated: 0,
    };

    // 1. Exercises
    for ex in &lib.exercises {
        let existed = existing_exercise_ids.contains(&ex.id);
        sqlx::query!(
            "INSERT INTO exercises (id, name, notes) VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, notes = excluded.notes",
            ex.id,
            ex.name,
            ex.notes
        )
        .execute(&mut *tx)
        .await?;

        // Replace tags wholesale (same as the domain update path)
        sqlx::query!("DELETE FROM exercise_tags WHERE exercise_id = ?", ex.id)
            .execute(&mut *tx)
            .await?;
        for tag in &ex.tags {
            sqlx::query!(
                "INSERT INTO exercise_tags (exercise_id, tag) VALUES (?, ?)",
                ex.id,
                tag
            )
            .execute(&mut *tx)
            .await?;
        }

        if existed {
            result.exercises_updated += 1;
        } else {
            result.exercises_created += 1;
        }
    }

    // 2. Workout template headers — must precede set_templates because
    //    set_templates.owning_workout_template_id FK references workout_templates.id.
    for wt in &lib.workout_templates {
        let existed = existing_workout_ids.contains(&wt.id);
        sqlx::query!(
            "INSERT INTO workout_templates
                 (id, name, notes, default_exercise_duration_sec, rest_between_sets_sec)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name                          = excluded.name,
               notes                         = excluded.notes,
               default_exercise_duration_sec = excluded.default_exercise_duration_sec,
               rest_between_sets_sec         = excluded.rest_between_sets_sec",
            wt.id,
            wt.name,
            wt.notes,
            wt.default_exercise_duration_sec,
            wt.rest_between_sets_sec
        )
        .execute(&mut *tx)
        .await?;

        if existed {
            result.workouts_updated += 1;
        } else {
            result.workouts_created += 1;
        }
    }

    // 3. Set templates (header rows only; cards follow in step 4)
    for st in &lib.set_templates {
        let existed = existing_set_ids.contains(&st.id);
        sqlx::query!(
            "INSERT INTO set_templates (id, name, notes, owning_workout_template_id)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               notes = excluded.notes,
               owning_workout_template_id = excluded.owning_workout_template_id",
            st.id,
            st.name,
            st.notes,
            st.owning_workout_template_id
        )
        .execute(&mut *tx)
        .await?;

        if existed {
            result.sets_updated += 1;
        } else {
            result.sets_created += 1;
        }
    }

    // 4. Set template cards — two-phase upsert to avoid UNIQUE(set_template_id, order_index)
    //    violations when final indices overlap with existing rows during the write.
    //    Phase 1: upsert each card at a temporary order_index well above real data.
    //    Phase 2: assign final sequential indices.
    for st in &lib.set_templates {
        for (i, card) in st.cards.iter().enumerate() {
            let temp_idx = 1_000_000_i64 + i as i64;
            sqlx::query!(
                "INSERT INTO set_template_cards
                     (id, set_template_id, card_type, order_index, exercise_id,
                      placeholder_tag, placeholder_label, duration_hint_sec, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   set_template_id    = excluded.set_template_id,
                   card_type          = excluded.card_type,
                   order_index        = excluded.order_index,
                   exercise_id        = excluded.exercise_id,
                   placeholder_tag    = excluded.placeholder_tag,
                   placeholder_label  = excluded.placeholder_label,
                   duration_hint_sec  = excluded.duration_hint_sec,
                   notes              = excluded.notes",
                card.id,
                st.id,
                card.card_type,
                temp_idx,
                card.exercise_id,
                card.placeholder_tag,
                card.placeholder_label,
                card.duration_hint_sec,
                card.notes
            )
            .execute(&mut *tx)
            .await?;
        }
        for (i, card) in st.cards.iter().enumerate() {
            let final_idx = i as i64;
            sqlx::query!(
                "UPDATE set_template_cards SET order_index = ? WHERE id = ?",
                final_idx,
                card.id
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    // 5. Set refs — two-phase upsert for UNIQUE(workout_template_id, order_index)
    //    (workout template headers already written in step 2)
    for wt in &lib.workout_templates {
        for (i, ref_) in wt.set_refs.iter().enumerate() {
            let temp_idx = 1_000_000_i64 + i as i64;
            sqlx::query!(
                "INSERT INTO workout_template_set_refs
                     (id, workout_template_id, set_template_id, order_index,
                      source_set_template_id)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   workout_template_id    = excluded.workout_template_id,
                   set_template_id        = excluded.set_template_id,
                   order_index            = excluded.order_index,
                   source_set_template_id = excluded.source_set_template_id",
                ref_.id,
                wt.id,
                ref_.set_template_id,
                temp_idx,
                ref_.source_set_template_id
            )
            .execute(&mut *tx)
            .await?;
        }
        for (i, ref_) in wt.set_refs.iter().enumerate() {
            let final_idx = i as i64;
            sqlx::query!(
                "UPDATE workout_template_set_refs SET order_index = ? WHERE id = ?",
                final_idx,
                ref_.id
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    // 6. Card assignments — conflict on the natural (set_ref, card) unique pair
    for wt in &lib.workout_templates {
        for ref_ in &wt.set_refs {
            for a in &ref_.assignments {
                sqlx::query!(
                    "INSERT INTO workout_template_card_assignments
                         (id, workout_template_set_ref_id, set_template_card_id,
                          exercise_id, display_label, duration_hint_sec, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(workout_template_set_ref_id, set_template_card_id)
                     DO UPDATE SET
                       exercise_id       = excluded.exercise_id,
                       display_label     = excluded.display_label,
                       duration_hint_sec = excluded.duration_hint_sec,
                       notes             = excluded.notes",
                    a.id,
                    ref_.id,
                    a.set_template_card_id,
                    a.exercise_id,
                    a.display_label,
                    a.duration_hint_sec,
                    a.notes
                )
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    tx.commit().await?;
    Ok(result)
}
