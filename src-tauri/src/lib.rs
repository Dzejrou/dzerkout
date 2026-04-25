mod commands;
mod db;
mod domain;
mod error;
#[cfg(test)]
mod tests;

use commands::{exercises::*, history::{get_session_detail, list_session_history}, sessions::*, set_templates::*, workout_templates::*};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("app data dir not found");
            std::fs::create_dir_all(&app_data_dir)?;
            let pool = tauri::async_runtime::block_on(db::init_pool(&app_data_dir))
                .expect("failed to initialize database");
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // exercises
            list_exercises,
            create_exercise,
            update_exercise,
            get_exercise_references,
            delete_exercise,
            // set templates
            list_set_templates,
            get_set_template,
            create_set_template,
            update_set_template,
            delete_set_template,
            clone_set_template,
            add_card,
            update_card,
            remove_card,
            reorder_cards,
            // workout templates
            list_workout_templates,
            get_workout_template,
            create_workout_template,
            update_workout_template,
            delete_workout_template,
            add_set_ref,
            remove_set_ref,
            reorder_set_refs,
            clone_set_from_workout,
            upsert_card_assignment,
            delete_card_assignment,
            export_forked_set,
            // sessions
            get_active_session,
            create_session_draft,
            start_session,
            pause_session,
            resume_session,
            advance_exercise,
            retreat_exercise,
            skip_exercise,
            start_next_set,
            finish_session,
            abandon_session,
            discard_session,
            // history
            list_session_history,
            get_session_detail,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
