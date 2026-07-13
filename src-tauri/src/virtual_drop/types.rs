use serde::Serialize;
use std::path::PathBuf;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use winapi::um::objidlbase::IStream;
use winapi::um::unknwnbase::IUnknown;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VirtualDropStatus {
    Queued,
    Inspecting,
    Reading,
    Writing,
    Completed,
    Failed,
    Cancelled,
    TimedOut,
}

impl VirtualDropStatus {
    pub fn event_name(self) -> &'static str {
        match self {
            Self::Queued => "virtual-drop://queued",
            Self::Inspecting => "virtual-drop://metadata",
            Self::Reading | Self::Writing => "virtual-drop://progress",
            Self::Completed => "virtual-drop://completed",
            Self::Failed => "virtual-drop://failed",
            Self::Cancelled => "virtual-drop://cancelled",
            Self::TimedOut => "virtual-drop://timed-out",
        }
    }
}

pub struct MarshaledComStream {
    ptr: *mut IStream,
}

// This pointer is the COM marshaling stream produced by
// CoMarshalInterThreadInterfaceInStream. Passing that stream to another thread
// is the intended COM handoff mechanism; the raw IDataObject is never moved.
unsafe impl Send for MarshaledComStream {}

impl MarshaledComStream {
    pub unsafe fn new(ptr: *mut IStream) -> Self {
        Self { ptr }
    }

    pub fn take_raw(&mut self) -> *mut IStream {
        let ptr = self.ptr;
        self.ptr = null_mut();
        ptr
    }
}

impl Drop for MarshaledComStream {
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

pub struct VirtualDropJob {
    pub id: String,
    pub marshaled_data_object: MarshaledComStream,
    pub created_at: Instant,
    pub target_directory: PathBuf,
    pub drop_position: Option<(i32, i32)>,
    pub source: String,
    pub source_formats: Vec<String>,
    pub cancel: CancellationToken,
}

#[derive(Clone)]
pub struct ActiveVirtualDrop {
    pub job_id: String,
    pub started_at: Instant,
    pub runtime: JobRuntime,
    pub cancel: CancellationToken,
    pub staging_dir: PathBuf,
}

#[derive(Clone)]
pub struct CancellationToken {
    inner: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.inner.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.inner.load(Ordering::SeqCst)
    }
}

#[derive(Debug, Clone)]
pub struct VirtualFileDescriptor {
    pub index: usize,
    pub name: String,
    pub declared_size: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct CompletedVirtualFile {
    pub path: PathBuf,
    pub file_name: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VirtualDropTerminalState {
    Completed,
    Failed,
    Cancelled,
    TimedOut,
}

#[derive(Clone)]
pub struct JobRuntime {
    last_progress_ms: Arc<AtomicU64>,
}

impl JobRuntime {
    pub fn new() -> Self {
        Self {
            last_progress_ms: Arc::new(AtomicU64::new(now_ms())),
        }
    }

    pub fn mark_progress(&self) {
        self.last_progress_ms.store(now_ms(), Ordering::SeqCst);
    }

    pub fn last_progress_ms(&self) -> u64 {
        self.last_progress_ms.load(Ordering::SeqCst)
    }
}

#[derive(Clone, Serialize)]
pub struct VirtualDropEventPayload {
    pub job_id: String,
    pub status: VirtualDropStatus,
    pub file_name: Option<String>,
    pub loaded: u64,
    pub total: Option<u64>,
    pub progress: Option<f64>,
    pub message: Option<String>,
    pub path: Option<String>,
    pub paths: Vec<String>,
    pub source: Option<String>,
    pub drop_position: Option<(i32, i32)>,
}

#[derive(Clone, Serialize)]
pub struct NativeWebImage {
    pub url: String,
    pub name: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct NativeDropPayload {
    pub source: String,
    pub paths: Vec<String>,
    pub web_images: Vec<NativeWebImage>,
    pub texts: Vec<String>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}
