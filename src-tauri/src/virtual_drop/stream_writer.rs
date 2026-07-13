use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::ptr::null_mut;
use std::time::{Duration, Instant};

use winapi::ctypes::c_void;
use winapi::shared::minwindef::{DWORD, HGLOBAL, ULONG};
use winapi::um::combaseapi::{CoDisableCallCancellation, CoEnableCallCancellation};
use winapi::um::objidl::IDataObject;
use winapi::um::objidlbase::{ISequentialStream, IStream};
use winapi::um::winbase::{GlobalLock, GlobalUnlock};

use super::data_object_reader::{
    get_data, hglobal_size, register_clipboard_format, TYMED_FILE_VALUE, TYMED_HGLOBAL_VALUE,
    TYMED_ISTREAM_VALUE,
};
use super::diagnostics;
use super::filename::{
    partial_path_for, safe_virtual_file_name, unique_path, validate_completed_image,
    with_detected_extension,
};
use super::limits::{
    MAX_VIRTUAL_DROP_TOTAL_BYTES, MAX_VIRTUAL_FILE_BYTES, STREAM_CHUNK_BYTES,
    VIRTUAL_DROP_IDLE_TIMEOUT_SECS, VIRTUAL_DROP_TIMEOUT_SECS,
};
use super::types::{
    CancellationToken, CompletedVirtualFile, JobRuntime, VirtualDropStatus, VirtualFileDescriptor,
};

#[derive(Debug)]
pub enum VirtualDropReadError {
    Failed(String),
    Cancelled,
    TimedOut(String),
}

impl VirtualDropReadError {
    pub fn status(&self) -> VirtualDropStatus {
        match self {
            Self::Cancelled => VirtualDropStatus::Cancelled,
            Self::TimedOut(_) => VirtualDropStatus::TimedOut,
            Self::Failed(_) => VirtualDropStatus::Failed,
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::Cancelled => "virtual drop cancelled".to_string(),
            Self::TimedOut(reason) => reason.clone(),
            Self::Failed(reason) => reason.clone(),
        }
    }
}

impl From<std::io::Error> for VirtualDropReadError {
    fn from(value: std::io::Error) -> Self {
        Self::Failed(value.to_string())
    }
}

pub struct WriteFileOptions<'a, F>
where
    F: FnMut(VirtualDropStatus, &str, u64, Option<u64>),
{
    pub job_id: &'a str,
    pub job_started: Instant,
    pub job_dir: &'a Path,
    pub data_object: *mut IDataObject,
    pub descriptor: &'a VirtualFileDescriptor,
    pub total_written: &'a mut u64,
    pub cancel: &'a CancellationToken,
    pub runtime: &'a JobRuntime,
    pub on_progress: F,
}

pub fn write_virtual_file<F>(
    mut options: WriteFileOptions<'_, F>,
) -> Result<CompletedVirtualFile, VirtualDropReadError>
where
    F: FnMut(VirtualDropStatus, &str, u64, Option<u64>),
{
    check_cancel_and_timeout(options.cancel, options.job_started, options.runtime)?;

    if let Some(size) = options.descriptor.declared_size {
        if size > MAX_VIRTUAL_FILE_BYTES {
            return Err(VirtualDropReadError::Failed(format!(
                "declared file size exceeds limit: {size} > {MAX_VIRTUAL_FILE_BYTES}"
            )));
        }
        if options.total_written.saturating_add(size) > MAX_VIRTUAL_DROP_TOTAL_BYTES {
            return Err(VirtualDropReadError::Failed(format!(
                "declared virtual drop total exceeds limit: {} > {}",
                options.total_written.saturating_add(size),
                MAX_VIRTUAL_DROP_TOTAL_BYTES
            )));
        }
    }

    fs::create_dir_all(options.job_dir)?;
    let base_name = safe_virtual_file_name(&options.descriptor.name, options.descriptor.index);
    let raw_final = unique_path(options.job_dir.join(&base_name));
    let partial = partial_path_for(&raw_final);
    let _ = fs::remove_file(&partial);

    let format = register_clipboard_format("FileContents").ok_or_else(|| {
        VirtualDropReadError::Failed("FileContents format unavailable".to_string())
    })?;

    let get_data_started = Instant::now();
    let mut medium = {
        let _cancel_guard = ComCallCancellation::new();
        get_data(
            options.data_object,
            format,
            options.descriptor.index as i32,
            TYMED_HGLOBAL_VALUE | TYMED_ISTREAM_VALUE | TYMED_FILE_VALUE,
        )
    }
    .map_err(|hr| {
        VirtualDropReadError::Failed(format!(
            "IDataObject::GetData(FileContents, lindex={}) failed: HRESULT=0x{:08X}",
            options.descriptor.index, hr as u32
        ))
    })?;
    diagnostics::log_duration(options.job_id, "GetData(FileContents)", get_data_started);

    let selected_tymed = medium.tymed();
    diagnostics::log(
        options.job_id,
        format!(
            "reading descriptor index={} name={} declared_size={:?} tymed={}",
            options.descriptor.index,
            options.descriptor.name,
            options.descriptor.declared_size,
            tymed_name(selected_tymed)
        ),
    );

    let read_result = unsafe {
        if selected_tymed == TYMED_HGLOBAL_VALUE {
            let hglobal = medium.hglobal();
            write_hglobal(
                options.job_id,
                hglobal,
                &partial,
                options.descriptor.declared_size,
                &mut options,
            )
        } else if selected_tymed == TYMED_ISTREAM_VALUE {
            let stream = medium.istream();
            write_istream(
                options.job_id,
                stream,
                &partial,
                options.descriptor.declared_size,
                &mut options,
            )
        } else if selected_tymed == TYMED_FILE_VALUE {
            let source_path = medium.file_name().ok_or_else(|| {
                VirtualDropReadError::Failed("TYMED_FILE did not include a file path".to_string())
            })?;
            write_tymed_file(
                options.job_id,
                &source_path,
                &partial,
                options.descriptor.declared_size,
                &mut options,
            )
        } else {
            Err(VirtualDropReadError::Failed(format!(
                "unsupported FileContents TYMED={selected_tymed}"
            )))
        }
    };

    let actual_bytes = match read_result {
        Ok(bytes) => bytes,
        Err(err) => {
            let _ = fs::remove_file(&partial);
            return Err(err);
        }
    };

    if let Err(err) = check_cancel_and_timeout(options.cancel, options.job_started, options.runtime)
    {
        let _ = fs::remove_file(&partial);
        return Err(err);
    }

    if actual_bytes == 0 {
        let _ = fs::remove_file(&partial);
        return Err(VirtualDropReadError::Failed(
            "FileContents was empty".to_string(),
        ));
    }

    flush_and_sync(&partial)?;
    let detected_ext = match validate_completed_image(&partial) {
        Ok(ext) => ext,
        Err(err) => {
            let _ = fs::remove_file(&partial);
            return Err(VirtualDropReadError::Failed(err));
        }
    };
    let final_name = with_detected_extension(base_name, detected_ext);
    let final_path = unique_path(options.job_dir.join(final_name));
    fs::rename(&partial, &final_path)?;

    *options.total_written = options.total_written.saturating_add(actual_bytes);
    diagnostics::log(
        options.job_id,
        format!(
            "committed file={} actual_bytes={} total_bytes={}",
            final_path.display(),
            actual_bytes,
            *options.total_written
        ),
    );

    Ok(CompletedVirtualFile {
        file_name: final_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("web_image")
            .to_string(),
        path: final_path,
        bytes: actual_bytes,
    })
}

unsafe fn write_hglobal<F>(
    job_id: &str,
    hglobal: HGLOBAL,
    partial: &Path,
    declared_size: Option<u64>,
    options: &mut WriteFileOptions<'_, F>,
) -> Result<u64, VirtualDropReadError>
where
    F: FnMut(VirtualDropStatus, &str, u64, Option<u64>),
{
    let size = hglobal_size(hglobal) as u64;
    diagnostics::log(job_id, format!("HGLOBAL GlobalSize={size}"));
    if size > MAX_VIRTUAL_FILE_BYTES {
        return Err(VirtualDropReadError::Failed(format!(
            "HGLOBAL exceeds file limit: {size} > {MAX_VIRTUAL_FILE_BYTES}"
        )));
    }
    if options.total_written.saturating_add(size) > MAX_VIRTUAL_DROP_TOTAL_BYTES {
        return Err(VirtualDropReadError::Failed(format!(
            "virtual drop total exceeds limit: {} > {}",
            options.total_written.saturating_add(size),
            MAX_VIRTUAL_DROP_TOTAL_BYTES
        )));
    }

    let lock = HGlobalLock::new(hglobal)?;
    let slice = std::slice::from_raw_parts(lock.ptr as *const u8, size as usize);
    let mut file = fs::File::create(partial)?;
    let mut written = 0u64;
    let write_started = Instant::now();

    while written < size {
        check_cancel_and_timeout(options.cancel, options.job_started, options.runtime)?;
        let end = (written as usize + STREAM_CHUNK_BYTES).min(slice.len());
        file.write_all(&slice[written as usize..end])?;
        written = end as u64;
        options.runtime.mark_progress();
        (options.on_progress)(
            VirtualDropStatus::Writing,
            &options.descriptor.name,
            written,
            declared_size.or(Some(size)),
        );
    }

    diagnostics::log_duration(job_id, "write HGLOBAL", write_started);
    Ok(written)
}

unsafe fn write_istream<F>(
    job_id: &str,
    stream: *mut IStream,
    partial: &Path,
    declared_size: Option<u64>,
    options: &mut WriteFileOptions<'_, F>,
) -> Result<u64, VirtualDropReadError>
where
    F: FnMut(VirtualDropStatus, &str, u64, Option<u64>),
{
    if stream.is_null() {
        return Err(VirtualDropReadError::Failed(
            "IStream pointer was null".to_string(),
        ));
    }

    let mut file = fs::File::create(partial)?;
    let mut buffer = vec![0u8; STREAM_CHUNK_BYTES];
    let mut written = 0u64;
    let mut max_read_block = Duration::from_millis(0);
    let read_started = Instant::now();

    loop {
        check_cancel_and_timeout(options.cancel, options.job_started, options.runtime)?;
        if written >= MAX_VIRTUAL_FILE_BYTES {
            return Err(VirtualDropReadError::Failed(format!(
                "IStream exceeds file limit: {written} >= {MAX_VIRTUAL_FILE_BYTES}"
            )));
        }
        if options.total_written.saturating_add(written) > MAX_VIRTUAL_DROP_TOTAL_BYTES {
            return Err(VirtualDropReadError::Failed(format!(
                "virtual drop total exceeds limit: {} > {}",
                options.total_written.saturating_add(written),
                MAX_VIRTUAL_DROP_TOTAL_BYTES
            )));
        }

        let remaining_limit = (MAX_VIRTUAL_FILE_BYTES - written).min(STREAM_CHUNK_BYTES as u64);
        let declared_remaining = declared_size.map(|size| size.saturating_sub(written));
        let want = declared_remaining
            .map(|remaining| remaining.min(remaining_limit))
            .unwrap_or(remaining_limit)
            .min(STREAM_CHUNK_BYTES as u64) as usize;
        if want == 0 {
            break;
        }

        let read_call_started = Instant::now();
        let mut read: ULONG = 0;
        let hr = {
            let _cancel_guard = ComCallCancellation::new();
            ((*(*stream).lpVtbl).parent.Read)(
                stream as *mut ISequentialStream,
                buffer.as_mut_ptr() as *mut c_void,
                want as ULONG,
                &mut read,
            )
        };
        let read_elapsed = read_call_started.elapsed();
        max_read_block = max_read_block.max(read_elapsed);
        if read_elapsed > Duration::from_millis(500) {
            diagnostics::log(
                job_id,
                format!("IStream::Read blocked {}ms", read_elapsed.as_millis()),
            );
        }

        if hr < 0 {
            return Err(VirtualDropReadError::Failed(format!(
                "IStream::Read failed: HRESULT=0x{:08X}",
                hr as u32
            )));
        }
        if read == 0 {
            break;
        }

        let read_usize = read as usize;
        if read_usize > want || read_usize > buffer.len() {
            return Err(VirtualDropReadError::Failed(format!(
                "IStream::Read returned too many bytes: {read_usize} > {want}"
            )));
        }
        file.write_all(&buffer[..read_usize])?;
        written = written.saturating_add(read as u64);
        options.runtime.mark_progress();
        (options.on_progress)(
            VirtualDropStatus::Reading,
            &options.descriptor.name,
            written,
            declared_size,
        );

        if declared_size.map(|size| written >= size).unwrap_or(false) {
            break;
        }
    }

    diagnostics::log(
        job_id,
        format!(
            "IStream read duration={}ms max_read_block={}ms actual_bytes={written}",
            read_started.elapsed().as_millis(),
            max_read_block.as_millis()
        ),
    );
    Ok(written)
}

fn write_tymed_file<F>(
    job_id: &str,
    source_path: &Path,
    partial: &Path,
    declared_size: Option<u64>,
    options: &mut WriteFileOptions<'_, F>,
) -> Result<u64, VirtualDropReadError>
where
    F: FnMut(VirtualDropStatus, &str, u64, Option<u64>),
{
    let metadata = fs::metadata(source_path)?;
    if !metadata.is_file() {
        return Err(VirtualDropReadError::Failed(format!(
            "TYMED_FILE path is not a file: {}",
            source_path.display()
        )));
    }
    let size = metadata.len();
    diagnostics::log(
        job_id,
        format!("TYMED_FILE source={} size={size}", source_path.display()),
    );
    if size > MAX_VIRTUAL_FILE_BYTES {
        return Err(VirtualDropReadError::Failed(format!(
            "TYMED_FILE exceeds file limit: {size} > {MAX_VIRTUAL_FILE_BYTES}"
        )));
    }
    if options.total_written.saturating_add(size) > MAX_VIRTUAL_DROP_TOTAL_BYTES {
        return Err(VirtualDropReadError::Failed(format!(
            "virtual drop total exceeds limit: {} > {}",
            options.total_written.saturating_add(size),
            MAX_VIRTUAL_DROP_TOTAL_BYTES
        )));
    }

    let mut input = fs::File::open(source_path)?;
    let mut output = fs::File::create(partial)?;
    let mut buffer = vec![0u8; STREAM_CHUNK_BYTES];
    let mut written = 0u64;
    let copy_started = Instant::now();
    loop {
        check_cancel_and_timeout(options.cancel, options.job_started, options.runtime)?;
        let read = input.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        written = written.saturating_add(read as u64);
        if written > MAX_VIRTUAL_FILE_BYTES {
            return Err(VirtualDropReadError::Failed(format!(
                "TYMED_FILE copied bytes exceed file limit: {written} > {MAX_VIRTUAL_FILE_BYTES}"
            )));
        }
        output.write_all(&buffer[..read])?;
        options.runtime.mark_progress();
        (options.on_progress)(
            VirtualDropStatus::Writing,
            &options.descriptor.name,
            written,
            declared_size.or(Some(size)),
        );
    }

    diagnostics::log_duration(job_id, "copy TYMED_FILE", copy_started);
    Ok(written)
}

fn check_cancel_and_timeout(
    cancel: &CancellationToken,
    job_started: Instant,
    runtime: &JobRuntime,
) -> Result<(), VirtualDropReadError> {
    if cancel.is_cancelled() {
        return Err(VirtualDropReadError::Cancelled);
    }
    if job_started.elapsed() > Duration::from_secs(VIRTUAL_DROP_TIMEOUT_SECS) {
        return Err(VirtualDropReadError::TimedOut(
            "virtual drop total timeout".to_string(),
        ));
    }
    let idle_ms = super::types::now_ms().saturating_sub(runtime.last_progress_ms());
    if idle_ms > VIRTUAL_DROP_IDLE_TIMEOUT_SECS.saturating_mul(1000) {
        return Err(VirtualDropReadError::TimedOut(format!(
            "virtual drop idle timeout after {idle_ms}ms"
        )));
    }
    Ok(())
}

fn flush_and_sync(path: &Path) -> Result<(), std::io::Error> {
    let mut file = fs::OpenOptions::new().read(true).write(true).open(path)?;
    file.flush()?;
    file.sync_all()
}

fn tymed_name(value: DWORD) -> &'static str {
    match value {
        TYMED_HGLOBAL_VALUE => "TYMED_HGLOBAL",
        TYMED_FILE_VALUE => "TYMED_FILE",
        TYMED_ISTREAM_VALUE => "TYMED_ISTREAM",
        _ => "TYMED_OTHER",
    }
}

struct HGlobalLock {
    hglobal: HGLOBAL,
    ptr: *mut c_void,
}

impl HGlobalLock {
    unsafe fn new(hglobal: HGLOBAL) -> Result<Self, VirtualDropReadError> {
        let ptr = GlobalLock(hglobal);
        if ptr.is_null() {
            Err(VirtualDropReadError::Failed(
                "GlobalLock failed".to_string(),
            ))
        } else {
            Ok(Self { hglobal, ptr })
        }
    }
}

impl Drop for HGlobalLock {
    fn drop(&mut self) {
        unsafe {
            let _ = GlobalUnlock(self.hglobal);
        }
    }
}

struct ComCallCancellation {
    enabled: bool,
}

impl ComCallCancellation {
    fn new() -> Self {
        let hr = unsafe { CoEnableCallCancellation(null_mut()) };
        Self { enabled: hr >= 0 }
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
