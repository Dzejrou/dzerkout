mod commands;
mod db;
mod domain;
mod error;
#[cfg(test)]
mod tests;

use commands::{exercises::*, file_io::{plugin as file_io_plugin, read_text_from_uri, write_text_to_uri}, history::{get_session_detail, list_session_history}, library::{clear_local_data, export_library_json, import_library_json, reset_local_data}, sessions::*, set_templates::*, stats::get_stats, workout_templates::*};
use domain::library::seed_if_empty;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(file_io_plugin())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("app data dir not found");
            std::fs::create_dir_all(&app_data_dir)?;
            let pool = tauri::async_runtime::block_on(db::init_pool(&app_data_dir))
                .expect("failed to initialize database");
            tauri::async_runtime::block_on(
                seed_if_empty(&pool, include_str!("../seeds/default_library.json"))
            )
            .expect("bundled library seed import failed");
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // library
            export_library_json,
            import_library_json,
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
            // file I/O (dialog path → content:// URI on Android)
            write_text_to_uri,
            read_text_from_uri,
            // maintenance
            reset_local_data,
            clear_local_data,
            // stats
            get_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
