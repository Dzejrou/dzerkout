use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::{db::stats as db_stats, error::AppError};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum StatsRange {
    All,
    Days30,
    Days7,
}

impl StatsRange {
    pub fn parse(s: &str) -> Result<Self, AppError> {
        match s {
            "all"  => Ok(StatsRange::All),
            "30d"  => Ok(StatsRange::Days30),
            "7d"   => Ok(StatsRange::Days7),
            other => Err(AppError::Validation(format!(
                "unknown range '{other}'; valid: all, 30d, 7d"
            ))),
        }
    }

    /// ISO 8601 lower bound for `ended_at`, or None for no lower bound.
    pub fn cutoff_iso(&self) -> Option<String> {
        match self {
            StatsRange::All => None,
            StatsRange::Days30 => Some(
                (Utc::now() - Duration::days(30)).to_rfc3339(),
            ),
            StatsRange::Days7 => Some(
                (Utc::now() - Duration::days(7)).to_rfc3339(),
            ),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsSummary {
    pub completed_workouts: i64,
    pub total_workout_duration_sec: i64,
    pub total_exercise_duration_sec: i64,
    pub total_sets: i64,
    pub total_exercises: i64,
    pub skipped_exercises: i64,
    pub last_completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagStat {
    pub tag: String,
    pub exercise_count: i64,
    pub duration_sec: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseStat {
    pub exercise_key: String,
    pub display_name: String,
    pub exercise_count: i64,
    pub duration_sec: i64,
    pub skipped_count: i64,
    pub last_performed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataStat {
    pub key: String,
    pub exercise_count: i64,
    pub duration_sec: i64,
    pub completed_count: i64,
    pub skipped_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsPayload {
    pub range: String,
    pub summary: StatsSummary,
    pub tags: Vec<TagStat>,
    pub exercises: Vec<ExerciseStat>,
    pub by_category: Vec<MetadataStat>,
    pub by_equipment: Vec<MetadataStat>,
    pub by_primary_muscle: Vec<MetadataStat>,
    pub by_pose_type: Vec<MetadataStat>,
    pub by_source: Vec<MetadataStat>,
}

// ── Query ─────────────────────────────────────────────────────────────────────

fn map_metadata(rows: Vec<db_stats::MetadataStatRow>) -> Vec<MetadataStat> {
    rows.into_iter()
        .map(|r| MetadataStat {
            key:             r.key,
            exercise_count:  r.exercise_count,
            duration_sec:    r.duration_sec,
            completed_count: r.completed_count,
            skipped_count:   r.skipped_count,
        })
        .collect()
}

pub async fn get_stats(pool: &SqlitePool, range_str: &str) -> Result<StatsPayload, AppError> {
    let range = StatsRange::parse(range_str)?;
    let cutoff = range.cutoff_iso();
    let cutoff_ref = cutoff.as_deref();

    let session_row      = db_stats::fetch_session_summary(pool, cutoff_ref).await?;
    let exercise_row     = db_stats::fetch_exercise_summary(pool, cutoff_ref).await?;
    let tag_rows         = db_stats::fetch_tag_stats(pool, cutoff_ref).await?;
    let exercise_rows    = db_stats::fetch_exercise_stats(pool, cutoff_ref).await?;
    let category_rows    = db_stats::fetch_category_stats(pool, cutoff_ref).await?;
    let equipment_rows   = db_stats::fetch_equipment_stats(pool, cutoff_ref).await?;
    let muscle_rows      = db_stats::fetch_primary_muscle_stats(pool, cutoff_ref).await?;
    let pose_type_rows   = db_stats::fetch_pose_type_stats(pool, cutoff_ref).await?;
    let source_rows      = db_stats::fetch_source_stats(pool, cutoff_ref).await?;

    let summary = StatsSummary {
        completed_workouts:       session_row.completed_workouts,
        total_workout_duration_sec: session_row.total_workout_duration_sec,
        total_exercise_duration_sec: exercise_row.total_exercise_duration_sec,
        total_sets:               exercise_row.total_sets,
        total_exercises:          exercise_row.total_exercises,
        skipped_exercises:        exercise_row.skipped_exercises,
        last_completed_at:        session_row.last_completed_at,
    };

    let tags = tag_rows
        .into_iter()
        .map(|r| TagStat {
            tag:            r.tag,
            exercise_count: r.exercise_count,
            duration_sec:   r.duration_sec,
        })
        .collect();

    let exercises = exercise_rows
        .into_iter()
        .map(|r| ExerciseStat {
            exercise_key:     r.exercise_key,
            display_name:     r.display_name,
            exercise_count:   r.exercise_count,
            duration_sec:     r.duration_sec,
            skipped_count:    r.skipped_count,
            last_performed_at: r.last_performed_at,
        })
        .collect();

    Ok(StatsPayload {
        range:            range_str.to_string(),
        summary,
        tags,
        exercises,
        by_category:      map_metadata(category_rows),
        by_equipment:     map_metadata(equipment_rows),
        by_primary_muscle: map_metadata(muscle_rows),
        by_pose_type:     map_metadata(pose_type_rows),
        by_source:        map_metadata(source_rows),
    })
}
