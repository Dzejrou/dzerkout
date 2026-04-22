use sqlx::SqlitePool;
use tauri::State;
use crate::{
    domain::{
        set_template,
        types::{SetTemplateRow, SetTemplateSummaryRow, SetTemplateCardRow, SetTemplateDetail},
    },
    error::AppError,
};

#[tauri::command]
pub async fn list_set_templates(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<SetTemplateSummaryRow>, AppError> {
    set_template::list(&pool).await
}

#[tauri::command]
pub async fn get_set_template(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<SetTemplateDetail, AppError> {
    set_template::get(&pool, &id).await
}

#[tauri::command]
pub async fn create_set_template(
    pool: State<'_, SqlitePool>,
    name: String,
    notes: Option<String>,
) -> Result<SetTemplateRow, AppError> {
    set_template::create(&pool, &name, notes.as_deref()).await
}

#[tauri::command]
pub async fn update_set_template(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
    notes: Option<String>,
) -> Result<SetTemplateRow, AppError> {
    set_template::update(&pool, &id, &name, notes.as_deref()).await
}

#[tauri::command]
pub async fn delete_set_template(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), AppError> {
    set_template::delete(&pool, &id).await
}

#[tauri::command]
pub async fn clone_set_template(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<SetTemplateRow, AppError> {
    set_template::clone_set(&pool, &id).await
}

#[tauri::command]
pub async fn add_card(
    pool: State<'_, SqlitePool>,
    set_id: String,
    card_type: String,
    exercise_id: Option<String>,
    placeholder_tag: Option<String>,
    placeholder_label: Option<String>,
    duration_hint_sec: Option<i64>,
    notes: Option<String>,
) -> Result<SetTemplateCardRow, AppError> {
    set_template::add_card(
        &pool,
        &set_id,
        &card_type,
        exercise_id.as_deref(),
        placeholder_tag.as_deref(),
        placeholder_label.as_deref(),
        duration_hint_sec,
        notes.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn update_card(
    pool: State<'_, SqlitePool>,
    card_id: String,
    exercise_id: Option<String>,
    placeholder_tag: Option<String>,
    placeholder_label: Option<String>,
    duration_hint_sec: Option<i64>,
    notes: Option<String>,
) -> Result<SetTemplateCardRow, AppError> {
    set_template::update_card(
        &pool,
        &card_id,
        exercise_id.as_deref(),
        placeholder_tag.as_deref(),
        placeholder_label.as_deref(),
        duration_hint_sec,
        notes.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn remove_card(pool: State<'_, SqlitePool>, card_id: String) -> Result<(), AppError> {
    set_template::remove_card(&pool, &card_id).await
}

#[tauri::command]
pub async fn reorder_cards(
    pool: State<'_, SqlitePool>,
    set_id: String,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    set_template::reorder_cards(&pool, &set_id, ordered_ids).await
}
