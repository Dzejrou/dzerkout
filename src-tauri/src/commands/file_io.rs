#[cfg(target_os = "android")]
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, State};

// ── State wrapper ─────────────────────────────────────────────────────────────

#[cfg(not(target_os = "android"))]
pub struct FileIo<R: Runtime>(std::marker::PhantomData<R>);

// PhantomData<R> holds no actual data, so Send+Sync are trivially safe on desktop.
#[cfg(not(target_os = "android"))]
unsafe impl<R: Runtime> Send for FileIo<R> {}
#[cfg(not(target_os = "android"))]
unsafe impl<R: Runtime> Sync for FileIo<R> {}

#[cfg(target_os = "android")]
pub struct FileIo<R: Runtime>(tauri::plugin::PluginHandle<R>);

// ── Plugin (registers Kotlin class on Android, manages state) ─────────────────

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("file-io")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    _api.register_android_plugin("com.dzerkout.app", "FileIoPlugin")?;
                app.manage(FileIo(handle));
            }
            #[cfg(not(target_os = "android"))]
            app.manage(FileIo::<R>(std::marker::PhantomData));
            Ok(())
        })
        .build()
}

// ── Desktop implementation ────────────────────────────────────────────────────

#[cfg(not(target_os = "android"))]
impl<R: Runtime> FileIo<R> {
    fn write(&self, path: &str, content: &str) -> Result<(), String> {
        std::fs::write(path, content.as_bytes()).map_err(|e| e.to_string())
    }

    fn read(&self, path: &str) -> Result<String, String> {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    }
}

// ── Android implementation ────────────────────────────────────────────────────

#[cfg(target_os = "android")]
impl<R: Runtime> FileIo<R> {
    fn write(&self, uri: &str, content: &str) -> Result<(), String> {
        #[derive(Serialize)]
        struct Payload<'a> {
            uri: &'a str,
            content: &'a str,
        }
        self.0
            .run_mobile_plugin::<()>("writeUri", Payload { uri, content })
            .map_err(|e| e.to_string())
    }

    fn read(&self, uri: &str) -> Result<String, String> {
        #[derive(Serialize)]
        struct Payload<'a> {
            uri: &'a str,
        }
        #[derive(Deserialize)]
        struct Response {
            content: String,
        }
        self.0
            .run_mobile_plugin::<Response>("readUri", Payload { uri })
            .map(|r| r.content)
            .map_err(|e| e.to_string())
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn write_text_to_uri<R: Runtime>(
    _app: AppHandle<R>,
    file_io: State<'_, FileIo<R>>,
    path: String,
    content: String,
) -> Result<(), String> {
    file_io.inner().write(&path, &content)
}

#[tauri::command]
pub async fn read_text_from_uri<R: Runtime>(
    _app: AppHandle<R>,
    file_io: State<'_, FileIo<R>>,
    path: String,
) -> Result<String, String> {
    file_io.inner().read(&path)
}
