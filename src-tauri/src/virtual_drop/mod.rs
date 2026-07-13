#[cfg(target_os = "windows")]
pub mod com_worker;
#[cfg(target_os = "windows")]
pub mod data_object_reader;
#[cfg(target_os = "windows")]
pub mod diagnostics;
#[cfg(target_os = "windows")]
pub mod dispatcher;
#[cfg(target_os = "windows")]
pub mod filename;
#[cfg(target_os = "windows")]
pub mod limits;
#[cfg(target_os = "windows")]
pub mod stream_writer;
#[cfg(target_os = "windows")]
pub mod types;

#[cfg(target_os = "windows")]
pub use dispatcher::{
    cancel, enqueue_from_drop, init, inspect_data_object_formats as inspect_formats,
};

#[cfg(not(target_os = "windows"))]
pub fn init(_app: tauri::AppHandle) {}

#[cfg(not(target_os = "windows"))]
pub fn cancel(_job_id: &str) -> Result<(), String> {
    Err("virtual drop is only available on Windows".to_string())
}
