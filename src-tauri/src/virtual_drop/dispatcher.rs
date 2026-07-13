use std::collections::HashMap;
use std::path::PathBuf;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use winapi::um::combaseapi::{CoCancelCall, CoMarshalInterThreadInterfaceInStream};
use winapi::um::objidl::IDataObject;
use winapi::um::objidlbase::IStream;
use winapi::um::unknwnbase::IUnknown;

use super::com_worker::{worker_loop, WorkerCompletion, WorkerContext, IID_IDATAOBJECT_LOCAL};
use super::data_object_reader::{inspect_formats, DropDataFormats};
use super::diagnostics;
use super::limits::{
    MAX_BLOCKED_VIRTUAL_DROP_WORKERS, MAX_PENDING_VIRTUAL_DROP_JOBS,
    VIRTUAL_DROP_IDLE_TIMEOUT_SECS, VIRTUAL_DROP_TIMEOUT_SECS,
};
use super::types::{
    ActiveVirtualDrop, CancellationToken, MarshaledComStream, VirtualDropEventPayload,
    VirtualDropJob, VirtualDropStatus, VirtualDropTerminalState,
};

static DISPATCHER: OnceLock<Arc<VirtualDropDispatcher>> = OnceLock::new();
static JOB_COUNTER: AtomicU64 = AtomicU64::new(1);

pub fn init(app: AppHandle) {
    let _ = dispatcher(app);
}

pub fn inspect_data_object_formats(data: *const IDataObject) -> DropDataFormats {
    inspect_formats(data)
}

pub fn enqueue_from_drop(
    app: &AppHandle,
    data_object: *const IDataObject,
    source: String,
    source_formats: Vec<String>,
    drop_position: Option<(i32, i32)>,
) -> Result<String, String> {
    dispatcher(app.clone()).enqueue(data_object, source, source_formats, drop_position)
}

pub fn cancel(job_id: &str) -> Result<(), String> {
    let Some(dispatcher) = DISPATCHER.get() else {
        return Err("virtual drop dispatcher is not initialized".to_string());
    };
    dispatcher.cancel(job_id)
}

fn dispatcher(app: AppHandle) -> Arc<VirtualDropDispatcher> {
    DISPATCHER
        .get_or_init(|| Arc::new(VirtualDropDispatcher::start(app)))
        .clone()
}

pub struct VirtualDropDispatcher {
    app: AppHandle,
    tx: SyncSender<VirtualDropJob>,
    cache_root: PathBuf,
    pending_or_active: Arc<AtomicUsize>,
    thread_id: Arc<AtomicU32>,
    active: Arc<Mutex<Option<ActiveVirtualDrop>>>,
    cancellations: Arc<Mutex<HashMap<String, CancellationToken>>>,
    terminal_jobs: Arc<Mutex<HashMap<String, VirtualDropTerminalState>>>,
    paused: Arc<AtomicBool>,
    blocked_workers: Arc<AtomicUsize>,
}

impl VirtualDropDispatcher {
    fn start(app: AppHandle) -> Self {
        let cache_root = app
            .path()
            .app_cache_dir()
            .or_else(|_| app.path().app_data_dir())
            .unwrap_or_else(|_| std::env::temp_dir().join("inspiration-drawer"))
            .join("virtual-drops");
        let _ = std::fs::create_dir_all(&cache_root);

        let (tx, rx) = sync_channel(MAX_PENDING_VIRTUAL_DROP_JOBS);
        let (completion_tx, completion_rx) = std::sync::mpsc::channel::<WorkerCompletion>();
        let thread_id = Arc::new(AtomicU32::new(0));
        let active = Arc::new(Mutex::new(None));
        let terminal_jobs = Arc::new(Mutex::new(HashMap::new()));
        let pending_or_active = Arc::new(AtomicUsize::new(0));
        let cancellations = Arc::new(Mutex::new(HashMap::new()));
        let paused = Arc::new(AtomicBool::new(false));
        let blocked_workers = Arc::new(AtomicUsize::new(0));

        let worker_context = WorkerContext {
            app: app.clone(),
            thread_id: thread_id.clone(),
            active: active.clone(),
            terminal_jobs: terminal_jobs.clone(),
            completion_tx,
        };
        let _ = thread::Builder::new()
            .name("virtual-drop-com-worker".to_string())
            .spawn(move || worker_loop(rx, worker_context));

        let dispatcher = Self {
            app: app.clone(),
            tx,
            cache_root,
            pending_or_active,
            thread_id,
            active,
            cancellations,
            terminal_jobs,
            paused,
            blocked_workers,
        };

        dispatcher.spawn_completion_thread(completion_rx);
        dispatcher.spawn_watchdog();
        dispatcher
    }

    fn spawn_completion_thread(&self, completion_rx: std::sync::mpsc::Receiver<WorkerCompletion>) {
        let cancellations = self.cancellations.clone();
        let pending = self.pending_or_active.clone();
        let _ = thread::Builder::new()
            .name("virtual-drop-completion".to_string())
            .spawn(move || {
                while let Ok(completion) = completion_rx.recv() {
                    let removed = {
                        let mut cancellations =
                            cancellations.lock().unwrap_or_else(|err| err.into_inner());
                        cancellations.remove(&completion.job_id).is_some()
                    };
                    if removed {
                        decrement_pending(&pending);
                    }
                    diagnostics::log(
                        &completion.job_id,
                        format!("terminal state from worker: {:?}", completion.state),
                    );
                }
            });
    }

    fn spawn_watchdog(&self) {
        let app = self.app.clone();
        let active = self.active.clone();
        let terminal_jobs = self.terminal_jobs.clone();
        let cancellations = self.cancellations.clone();
        let pending = self.pending_or_active.clone();
        let thread_id = self.thread_id.clone();
        let paused = self.paused.clone();
        let blocked_workers = self.blocked_workers.clone();

        let _ = thread::Builder::new()
            .name("virtual-drop-watchdog".to_string())
            .spawn(move || loop {
                thread::sleep(Duration::from_secs(1));
                let snapshot = {
                    let current = active.lock().unwrap_or_else(|err| err.into_inner());
                    current.clone()
                };
                let Some(active_job) = snapshot else {
                    continue;
                };

                let already_terminal = {
                    let terminal = terminal_jobs.lock().unwrap_or_else(|err| err.into_inner());
                    terminal.contains_key(&active_job.job_id)
                };
                if already_terminal {
                    continue;
                }

                let elapsed = active_job.started_at.elapsed();
                let idle_ms = super::types::now_ms()
                    .saturating_sub(active_job.runtime.last_progress_ms());
                let timed_out = elapsed > Duration::from_secs(VIRTUAL_DROP_TIMEOUT_SECS)
                    || idle_ms > VIRTUAL_DROP_IDLE_TIMEOUT_SECS.saturating_mul(1000);
                if !timed_out {
                    continue;
                }

                active_job.cancel.cancel();
                {
                    let mut terminal = terminal_jobs.lock().unwrap_or_else(|err| err.into_inner());
                    terminal.insert(active_job.job_id.clone(), VirtualDropTerminalState::TimedOut);
                }

                let reason = if elapsed > Duration::from_secs(VIRTUAL_DROP_TIMEOUT_SECS) {
                    format!("total timeout after {}ms", elapsed.as_millis())
                } else {
                    format!("idle timeout after {idle_ms}ms")
                };
                let worker_thread_id = thread_id.load(Ordering::SeqCst);
                let cancel_hr = if worker_thread_id != 0 {
                    unsafe { CoCancelCall(worker_thread_id, 500) }
                } else {
                    -1
                };
                diagnostics::log(
                    &active_job.job_id,
                    format!(
                        "watchdog timed out job reason={} worker_thread_id={} CoCancelCall=0x{:08X}",
                        reason, worker_thread_id, cancel_hr as u32
                    ),
                );

                let _ = std::fs::remove_dir_all(&active_job.staging_dir);
                let removed = {
                    let mut cancellations =
                        cancellations.lock().unwrap_or_else(|err| err.into_inner());
                    cancellations.remove(&active_job.job_id).is_some()
                };
                if removed {
                    decrement_pending(&pending);
                }
                let blocked = blocked_workers.fetch_add(1, Ordering::SeqCst) + 1;
                if blocked >= MAX_BLOCKED_VIRTUAL_DROP_WORKERS {
                    paused.store(true, Ordering::SeqCst);
                }

                diagnostics::emit_status(
                    &app,
                    VirtualDropEventPayload {
                        job_id: active_job.job_id.clone(),
                        status: VirtualDropStatus::TimedOut,
                        file_name: None,
                        loaded: 0,
                        total: None,
                        progress: None,
                        message: Some(format!(
                            "{reason}; virtual drops are paused until restart if the COM stream does not return"
                        )),
                        path: None,
                        paths: Vec::new(),
                        source: None,
                        drop_position: None,
                    },
                );
            });
    }

    fn enqueue(
        &self,
        data_object: *const IDataObject,
        source: String,
        source_formats: Vec<String>,
        drop_position: Option<(i32, i32)>,
    ) -> Result<String, String> {
        if data_object.is_null() {
            return Err("IDataObject was null".to_string());
        }
        if self.paused.load(Ordering::SeqCst) {
            let job_id = next_job_id();
            diagnostics::emit_status(
                &self.app,
                VirtualDropEventPayload {
                    job_id: job_id.clone(),
                    status: VirtualDropStatus::Failed,
                    file_name: None,
                    loaded: 0,
                    total: None,
                    progress: None,
                    message: Some(
                        "virtual drops are paused after an uncancellable COM timeout; restart the app"
                            .to_string(),
                    ),
                    path: None,
                    paths: Vec::new(),
                    source: Some(source),
                    drop_position,
                },
            );
            return Err("virtual drops paused after COM timeout".to_string());
        }

        let pending = self.pending_or_active.load(Ordering::SeqCst);
        if pending >= MAX_PENDING_VIRTUAL_DROP_JOBS {
            let job_id = next_job_id();
            diagnostics::emit_status(
                &self.app,
                VirtualDropEventPayload {
                    job_id: job_id.clone(),
                    status: VirtualDropStatus::Failed,
                    file_name: None,
                    loaded: 0,
                    total: None,
                    progress: None,
                    message: Some(format!(
                        "too many pending virtual drops: {pending} >= {MAX_PENDING_VIRTUAL_DROP_JOBS}"
                    )),
                    path: None,
                    paths: Vec::new(),
                    source: Some(source),
                    drop_position,
                },
            );
            return Err("virtual drop queue is full".to_string());
        }

        let job_id = next_job_id();
        let marshal_started = Instant::now();
        let mut stream: *mut IStream = null_mut();
        let hr = unsafe {
            CoMarshalInterThreadInterfaceInStream(
                &IID_IDATAOBJECT_LOCAL,
                data_object as *mut IUnknown,
                &mut stream,
            )
        };
        let marshal_elapsed = marshal_started.elapsed();
        diagnostics::log(
            &job_id,
            format!(
                "marshal duration={}ms HRESULT=0x{:08X} formats={}",
                marshal_elapsed.as_millis(),
                hr as u32,
                source_formats.join(",")
            ),
        );
        if hr < 0 || stream.is_null() {
            diagnostics::emit_status(
                &self.app,
                VirtualDropEventPayload {
                    job_id: job_id.clone(),
                    status: VirtualDropStatus::Failed,
                    file_name: None,
                    loaded: 0,
                    total: None,
                    progress: None,
                    message: Some(format!(
                        "failed to marshal IDataObject: HRESULT=0x{:08X}",
                        hr as u32
                    )),
                    path: None,
                    paths: Vec::new(),
                    source: Some(source),
                    drop_position,
                },
            );
            return Err(format!(
                "CoMarshalInterThreadInterfaceInStream failed: HRESULT=0x{:08X}",
                hr as u32
            ));
        }

        let cancel = CancellationToken::new();
        {
            let mut cancellations = self
                .cancellations
                .lock()
                .unwrap_or_else(|err| err.into_inner());
            cancellations.insert(job_id.clone(), cancel.clone());
        }
        self.pending_or_active.fetch_add(1, Ordering::SeqCst);

        let target_directory = self.cache_root.join(&job_id);
        let job = VirtualDropJob {
            id: job_id.clone(),
            marshaled_data_object: unsafe { MarshaledComStream::new(stream) },
            created_at: Instant::now(),
            target_directory,
            drop_position,
            source: source.clone(),
            source_formats: source_formats.clone(),
            cancel,
        };

        match self.tx.try_send(job) {
            Ok(()) => {
                diagnostics::emit_status(
                    &self.app,
                    VirtualDropEventPayload {
                        job_id: job_id.clone(),
                        status: VirtualDropStatus::Queued,
                        file_name: None,
                        loaded: 0,
                        total: None,
                        progress: None,
                        message: Some("queued virtual web image import".to_string()),
                        path: None,
                        paths: Vec::new(),
                        source: Some(source),
                        drop_position,
                    },
                );
                Ok(job_id)
            }
            Err(TrySendError::Full(job)) => {
                drop(job);
                self.finish_job(&job_id);
                diagnostics::emit_status(
                    &self.app,
                    VirtualDropEventPayload {
                        job_id: job_id.clone(),
                        status: VirtualDropStatus::Failed,
                        file_name: None,
                        loaded: 0,
                        total: None,
                        progress: None,
                        message: Some("virtual drop queue is full".to_string()),
                        path: None,
                        paths: Vec::new(),
                        source: Some(source),
                        drop_position,
                    },
                );
                Err("virtual drop queue is full".to_string())
            }
            Err(TrySendError::Disconnected(job)) => {
                drop(job);
                self.finish_job(&job_id);
                Err("virtual drop COM worker is not available".to_string())
            }
        }
    }

    fn cancel(&self, job_id: &str) -> Result<(), String> {
        let token = {
            let cancellations = self
                .cancellations
                .lock()
                .unwrap_or_else(|err| err.into_inner());
            cancellations.get(job_id).cloned()
        };
        let Some(token) = token else {
            return Err(format!("virtual drop job not found: {job_id}"));
        };
        token.cancel();
        diagnostics::log(job_id, "cancel requested by UI");
        Ok(())
    }

    fn finish_job(&self, job_id: &str) {
        let removed = {
            let mut cancellations = self
                .cancellations
                .lock()
                .unwrap_or_else(|err| err.into_inner());
            cancellations.remove(job_id).is_some()
        };
        if removed {
            self.pending_or_active.fetch_sub(1, Ordering::SeqCst);
        }
    }
}

fn next_job_id() -> String {
    let counter = JOB_COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("vd-{}-{counter}", super::types::now_ms())
}

fn decrement_pending(pending: &AtomicUsize) {
    let _ = pending.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |value| {
        Some(value.saturating_sub(1))
    });
}

#[allow(dead_code)]
pub fn formats_for_debug(data: *const IDataObject) -> Vec<String> {
    inspect_formats(data).names()
}
