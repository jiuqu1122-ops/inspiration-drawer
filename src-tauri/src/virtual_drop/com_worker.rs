use std::collections::HashMap;
use std::mem;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use winapi::ctypes::c_void;
use winapi::shared::guiddef::GUID;
use winapi::shared::winerror::S_OK;
use winapi::um::combaseapi::{
    CoDisableCallCancellation, CoEnableCallCancellation, CoGetInterfaceAndReleaseStream,
};
use winapi::um::objidl::IDataObject;
use winapi::um::ole2::OleInitialize;
use winapi::um::processthreadsapi::GetCurrentThreadId;
use winapi::um::unknwnbase::IUnknown;
use winapi::um::winuser::{DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE};

use super::data_object_reader::read_file_group_descriptors;
use super::diagnostics;
use super::stream_writer::{write_virtual_file, VirtualDropReadError, WriteFileOptions};
use super::types::{
    ActiveVirtualDrop, CompletedVirtualFile, JobRuntime, NativeDropPayload,
    VirtualDropEventPayload, VirtualDropJob, VirtualDropStatus, VirtualDropTerminalState,
};

#[link(name = "ole32")]
extern "system" {
    fn OleUninitialize();
}

// IID_IDataObject = 0000010e-0000-0000-C000-000000000046
pub const IID_IDATAOBJECT_LOCAL: GUID = GUID {
    Data1: 0x0000010e,
    Data2: 0x0000,
    Data3: 0x0000,
    Data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
};

pub struct WorkerContext {
    pub app: AppHandle,
    pub thread_id: Arc<AtomicU32>,
    pub active: Arc<Mutex<Option<ActiveVirtualDrop>>>,
    pub terminal_jobs: Arc<Mutex<HashMap<String, VirtualDropTerminalState>>>,
    pub completion_tx: Sender<WorkerCompletion>,
}

pub struct WorkerCompletion {
    pub job_id: String,
    pub state: VirtualDropTerminalState,
}

pub fn worker_loop(rx: Receiver<VirtualDropJob>, context: WorkerContext) {
    let init_hr = unsafe { OleInitialize(null_mut()) };
    if init_hr < 0 {
        diagnostics::log_global(format!(
            "COM worker OleInitialize failed: HRESULT=0x{:08X}",
            init_hr as u32
        ));
    } else {
        diagnostics::log_global(format!(
            "COM worker started thread_id={} ole_hr=0x{:08X}",
            unsafe { GetCurrentThreadId() },
            init_hr as u32
        ));
    }
    context
        .thread_id
        .store(unsafe { GetCurrentThreadId() }, Ordering::SeqCst);

    loop {
        pump_messages();
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(job) => {
                pump_messages();
                process_job(job, &context);
                pump_messages();
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    if init_hr >= 0 {
        unsafe { OleUninitialize() };
    }
}

fn process_job(job: VirtualDropJob, context: &WorkerContext) {
    let runtime = JobRuntime::new();
    let active = ActiveVirtualDrop {
        job_id: job.id.clone(),
        started_at: Instant::now(),
        runtime: runtime.clone(),
        cancel: job.cancel.clone(),
        staging_dir: job.target_directory.clone(),
    };
    {
        let mut current = context.active.lock().unwrap_or_else(|err| err.into_inner());
        *current = Some(active);
    }

    let _ = process_job_inner(job, context, runtime);

    {
        let mut current = context.active.lock().unwrap_or_else(|err| err.into_inner());
        *current = None;
    }
}

fn process_job_inner(
    mut job: VirtualDropJob,
    context: &WorkerContext,
    runtime: JobRuntime,
) -> Result<(), (String, VirtualDropTerminalState)> {
    if is_terminal(context, &job.id).is_some() {
        return Err((job.id, VirtualDropTerminalState::TimedOut));
    }

    diagnostics::emit_status(
        &context.app,
        VirtualDropEventPayload {
            job_id: job.id.clone(),
            status: VirtualDropStatus::Inspecting,
            file_name: None,
            loaded: 0,
            total: None,
            progress: None,
            message: Some(format!(
                "Inspecting virtual drop formats: {}",
                job.source_formats.join(", ")
            )),
            path: None,
            paths: Vec::new(),
            source: Some(job.source.clone()),
            drop_position: job.drop_position,
        },
    );

    let marshal_stream = job.marshaled_data_object.take_raw();
    let mut data_object_out: *mut c_void = null_mut();
    let unmarshal_started = Instant::now();
    let hr = {
        let _cancel_guard = ComCallCancellation::new();
        unsafe {
            CoGetInterfaceAndReleaseStream(
                marshal_stream,
                &IID_IDATAOBJECT_LOCAL,
                &mut data_object_out,
            )
        }
    };
    diagnostics::log_duration(&job.id, "CoGetInterfaceAndReleaseStream", unmarshal_started);

    if hr < 0 || data_object_out.is_null() {
        let message = format!(
            "CoGetInterfaceAndReleaseStream failed: HRESULT=0x{:08X}",
            hr as u32
        );
        emit_terminal(
            context,
            &job,
            VirtualDropStatus::Failed,
            VirtualDropTerminalState::Failed,
            message,
        );
        return Err((job.id, VirtualDropTerminalState::Failed));
    }

    let data_guard = DataObjectGuard::new(data_object_out as *mut IDataObject);
    let data_object = data_guard.as_ptr();

    let descriptor_started = Instant::now();
    let descriptors = match read_file_group_descriptors(data_object) {
        Ok(value) => value,
        Err(err) => {
            diagnostics::log_duration(&job.id, "read FileGroupDescriptor", descriptor_started);
            emit_terminal(
                context,
                &job,
                VirtualDropStatus::Failed,
                VirtualDropTerminalState::Failed,
                err,
            );
            return Err((job.id, VirtualDropTerminalState::Failed));
        }
    };
    diagnostics::log_duration(&job.id, "read FileGroupDescriptor", descriptor_started);
    diagnostics::log(
        &job.id,
        format!(
            "descriptor_count={} source_formats={}",
            descriptors.len(),
            job.source_formats.join(",")
        ),
    );

    diagnostics::emit_status(
        &context.app,
        VirtualDropEventPayload {
            job_id: job.id.clone(),
            status: VirtualDropStatus::Inspecting,
            file_name: descriptors
                .first()
                .map(|descriptor| descriptor.name.clone()),
            loaded: 0,
            total: descriptors
                .iter()
                .filter_map(|descriptor| descriptor.declared_size)
                .try_fold(0u64, |acc, value| acc.checked_add(value)),
            progress: None,
            message: Some(format!("Found {} virtual file(s)", descriptors.len())),
            path: None,
            paths: Vec::new(),
            source: Some(job.source.clone()),
            drop_position: job.drop_position,
        },
    );

    let mut completed = Vec::<CompletedVirtualFile>::new();
    let mut total_written = 0u64;
    for descriptor in descriptors {
        if let Some(state) = is_terminal(context, &job.id) {
            cleanup_job_dir(&job.target_directory);
            return Err((job.id, state));
        }
        if job.cancel.is_cancelled() {
            cleanup_job_dir(&job.target_directory);
            emit_terminal(
                context,
                &job,
                VirtualDropStatus::Cancelled,
                VirtualDropTerminalState::Cancelled,
                "virtual drop cancelled".to_string(),
            );
            return Err((job.id, VirtualDropTerminalState::Cancelled));
        }

        let app = context.app.clone();
        let job_id = job.id.clone();
        let source = job.source.clone();
        let drop_position = job.drop_position;
        let write_result = write_virtual_file(WriteFileOptions {
            job_id: &job.id,
            job_started: job.created_at,
            job_dir: &job.target_directory,
            data_object,
            descriptor: &descriptor,
            total_written: &mut total_written,
            cancel: &job.cancel,
            runtime: &runtime,
            on_progress: move |status, file_name, loaded, total| {
                let progress = total.and_then(|total| {
                    if total == 0 {
                        None
                    } else {
                        Some((loaded as f64 / total as f64).clamp(0.0, 1.0))
                    }
                });
                diagnostics::emit_status(
                    &app,
                    VirtualDropEventPayload {
                        job_id: job_id.clone(),
                        status,
                        file_name: Some(file_name.to_string()),
                        loaded,
                        total,
                        progress,
                        message: None,
                        path: None,
                        paths: Vec::new(),
                        source: Some(source.clone()),
                        drop_position,
                    },
                );
            },
        });

        match write_result {
            Ok(file) => completed.push(file),
            Err(err) => {
                cleanup_job_dir(&job.target_directory);
                let status = err.status();
                let state = match err {
                    VirtualDropReadError::Cancelled => VirtualDropTerminalState::Cancelled,
                    VirtualDropReadError::TimedOut(_) => VirtualDropTerminalState::TimedOut,
                    VirtualDropReadError::Failed(_) => VirtualDropTerminalState::Failed,
                };
                emit_terminal(context, &job, status, state, err.message());
                return Err((job.id, state));
            }
        }
    }

    if completed.is_empty() {
        cleanup_job_dir(&job.target_directory);
        emit_terminal(
            context,
            &job,
            VirtualDropStatus::Failed,
            VirtualDropTerminalState::Failed,
            "no virtual file was completed".to_string(),
        );
        return Err((job.id, VirtualDropTerminalState::Failed));
    }

    if let Some(state) = is_terminal(context, &job.id) {
        cleanup_job_dir(&job.target_directory);
        return Err((job.id, state));
    }

    let paths: Vec<String> = completed
        .iter()
        .map(|file| file.path.to_string_lossy().to_string())
        .collect();
    let total_bytes = completed.iter().map(|file| file.bytes).sum::<u64>();
    mark_terminal(context, &job.id, VirtualDropTerminalState::Completed);
    diagnostics::emit_status(
        &context.app,
        VirtualDropEventPayload {
            job_id: job.id.clone(),
            status: VirtualDropStatus::Completed,
            file_name: completed.first().map(|file| file.file_name.clone()),
            loaded: total_bytes,
            total: Some(total_bytes),
            progress: Some(1.0),
            message: Some(format!("Completed {} virtual file(s)", completed.len())),
            path: paths.first().cloned(),
            paths: paths.clone(),
            source: Some(job.source.clone()),
            drop_position: job.drop_position,
        },
    );

    let _ = context.app.emit(
        "native-drop",
        NativeDropPayload {
            source: job.source.clone(),
            paths,
            web_images: Vec::new(),
            texts: Vec::new(),
        },
    );
    let _ = context.completion_tx.send(WorkerCompletion {
        job_id: job.id.clone(),
        state: VirtualDropTerminalState::Completed,
    });

    Ok(())
}

fn emit_terminal(
    context: &WorkerContext,
    job: &VirtualDropJob,
    status: VirtualDropStatus,
    state: VirtualDropTerminalState,
    message: String,
) {
    mark_terminal(context, &job.id, state);
    diagnostics::emit_status(
        &context.app,
        VirtualDropEventPayload {
            job_id: job.id.clone(),
            status,
            file_name: None,
            loaded: 0,
            total: None,
            progress: None,
            message: Some(message),
            path: None,
            paths: Vec::new(),
            source: Some(job.source.clone()),
            drop_position: job.drop_position,
        },
    );
    let _ = context.completion_tx.send(WorkerCompletion {
        job_id: job.id.clone(),
        state,
    });
}

fn mark_terminal(context: &WorkerContext, job_id: &str, state: VirtualDropTerminalState) {
    let mut terminal = context
        .terminal_jobs
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    terminal.insert(job_id.to_string(), state);
}

fn is_terminal(context: &WorkerContext, job_id: &str) -> Option<VirtualDropTerminalState> {
    let terminal = context
        .terminal_jobs
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    terminal.get(job_id).copied()
}

fn cleanup_job_dir(path: &std::path::Path) {
    let _ = std::fs::remove_dir_all(path);
}

fn pump_messages() {
    unsafe {
        let mut msg: MSG = mem::zeroed();
        while PeekMessageW(&mut msg, null_mut(), 0, 0, PM_REMOVE) != 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

struct DataObjectGuard {
    ptr: *mut IDataObject,
}

impl DataObjectGuard {
    fn new(ptr: *mut IDataObject) -> Self {
        Self { ptr }
    }

    fn as_ptr(&self) -> *mut IDataObject {
        self.ptr
    }
}

impl Drop for DataObjectGuard {
    fn drop(&mut self) {
        if self.ptr.is_null() {
            return;
        }
        unsafe {
            let unknown = self.ptr as *mut IUnknown;
            ((*(*unknown).lpVtbl).Release)(unknown);
        }
        self.ptr = null_mut();
    }
}

struct ComCallCancellation {
    enabled: bool,
}

impl ComCallCancellation {
    fn new() -> Self {
        let hr = unsafe { CoEnableCallCancellation(null_mut()) };
        Self {
            enabled: hr >= 0 || hr == S_OK,
        }
    }
}

impl Drop for ComCallCancellation {
    fn drop(&mut self) {
        if self.enabled {
            unsafe {
                let _ = CoDisableCallCancellation(null_mut());
            }
        }
    }
}
