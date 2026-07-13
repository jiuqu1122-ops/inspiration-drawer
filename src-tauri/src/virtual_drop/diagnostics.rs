use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use super::types::VirtualDropEventPayload;

pub fn log(job_id: &str, message: impl AsRef<str>) {
    eprintln!("[virtual-drop:{job_id}] {}", message.as_ref());
}

pub fn log_global(message: impl AsRef<str>) {
    eprintln!("[virtual-drop] {}", message.as_ref());
}

pub fn log_duration(job_id: &str, label: &str, started: Instant) -> Duration {
    let elapsed = started.elapsed();
    log(
        job_id,
        format!("{label} duration={}ms", elapsed.as_millis()),
    );
    elapsed
}

pub fn warn_slow_drop(source: &str, elapsed: Duration) {
    let millis = elapsed.as_millis();
    if millis > 500 {
        eprintln!("[native-drop:{source}] critical Drop callback duration={millis}ms");
    } else if millis > 100 {
        eprintln!("[native-drop:{source}] warning Drop callback duration={millis}ms");
    } else if millis > 50 {
        eprintln!("[native-drop:{source}] slow Drop callback duration={millis}ms");
    }
}

pub fn emit_status(app: &AppHandle, payload: VirtualDropEventPayload) {
    let event_name = payload.status.event_name();
    let _ = app.emit(event_name, payload.clone());
    let _ = app.emit("virtual-drop://status", payload);
}
