use std::ffi::OsStr;
use std::mem;
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use std::ptr::null_mut;

use winapi::ctypes::c_void;
use winapi::shared::minwindef::{DWORD, HGLOBAL, UINT};
use winapi::shared::ntdef::HRESULT;
use winapi::um::objidl::{IDataObject, FORMATETC, STGMEDIUM};
use winapi::um::objidlbase::IStream;
use winapi::um::winbase::{GlobalLock, GlobalSize, GlobalUnlock};
use winapi::um::winuser::RegisterClipboardFormatW;

use super::limits::MAX_VIRTUAL_FILE_COUNT;
use super::types::VirtualFileDescriptor;

pub const CF_UNICODETEXT_VALUE: u16 = 13;
pub const CF_HDROP_VALUE: u16 = 15;
pub const DVASPECT_CONTENT_VALUE: DWORD = 1;
pub const TYMED_HGLOBAL_VALUE: DWORD = 1;
pub const TYMED_FILE_VALUE: DWORD = 2;
pub const TYMED_ISTREAM_VALUE: DWORD = 4;
pub const FILEDESCRIPTORW_SIZE: usize = 592;
pub const FILEDESCRIPTORA_SIZE: usize = 332;
pub const FILEDESCRIPTOR_FILENAME_OFFSET: usize = 72;
pub const FILEDESCRIPTOR_SIZE_HIGH_OFFSET: usize = 64;
pub const FILEDESCRIPTOR_SIZE_LOW_OFFSET: usize = 68;

#[link(name = "ole32")]
extern "system" {
    fn ReleaseStgMedium(pmedium: *mut STGMEDIUM);
}

#[derive(Default, Debug, Clone)]
pub struct DropDataFormats {
    pub hdrop: bool,
    pub file_descriptor: bool,
    pub file_contents: bool,
    pub text_uri_list: bool,
    pub text_html: bool,
    pub html_format: bool,
    pub unicode_text: bool,
}

impl DropDataFormats {
    pub fn names(&self) -> Vec<String> {
        let mut names = Vec::new();
        if self.hdrop {
            names.push("CF_HDROP".to_string());
        }
        if self.file_descriptor {
            names.push("CFSTR_FILEDESCRIPTORW".to_string());
        }
        if self.file_contents {
            names.push("CFSTR_FILECONTENTS".to_string());
        }
        if self.text_uri_list {
            names.push("text/uri-list".to_string());
        }
        if self.text_html {
            names.push("text/html".to_string());
        }
        if self.html_format {
            names.push("HTML Format".to_string());
        }
        if self.unicode_text {
            names.push("UnicodeText".to_string());
        }
        names
    }
}

pub struct StgMediumGuard {
    medium: STGMEDIUM,
}

impl StgMediumGuard {
    pub fn new(medium: STGMEDIUM) -> Self {
        Self { medium }
    }

    pub fn tymed(&self) -> DWORD {
        self.medium.tymed
    }

    pub unsafe fn hglobal(&mut self) -> HGLOBAL {
        *(*self.medium.u).hGlobal()
    }

    pub unsafe fn istream(&mut self) -> *mut IStream {
        *(*self.medium.u).pstm()
    }

    pub unsafe fn file_name(&mut self) -> Option<PathBuf> {
        let ptr = *(*self.medium.u).lpszFileName();
        if ptr.is_null() {
            return None;
        }
        let mut len = 0usize;
        while *ptr.add(len) != 0 {
            len += 1;
        }
        if len == 0 {
            return None;
        }
        let slice = std::slice::from_raw_parts(ptr, len);
        Some(PathBuf::from(String::from_utf16_lossy(slice)))
    }
}

impl Drop for StgMediumGuard {
    fn drop(&mut self) {
        unsafe {
            ReleaseStgMedium(&mut self.medium);
        }
    }
}

pub fn inspect_formats(data: *const IDataObject) -> DropDataFormats {
    DropDataFormats {
        hdrop: query_get_data(data, CF_HDROP_VALUE, -1, TYMED_HGLOBAL_VALUE),
        file_descriptor: register_clipboard_format("FileGroupDescriptorW")
            .map(|format| query_get_data(data, format, -1, TYMED_HGLOBAL_VALUE))
            .unwrap_or(false)
            || register_clipboard_format("FileGroupDescriptor")
                .map(|format| query_get_data(data, format, -1, TYMED_HGLOBAL_VALUE))
                .unwrap_or(false),
        file_contents: register_clipboard_format("FileContents")
            .map(|format| {
                query_get_data(
                    data,
                    format,
                    0,
                    TYMED_HGLOBAL_VALUE | TYMED_ISTREAM_VALUE | TYMED_FILE_VALUE,
                )
            })
            .unwrap_or(false),
        text_uri_list: register_clipboard_format("text/uri-list")
            .map(|format| query_get_data(data, format, -1, TYMED_HGLOBAL_VALUE))
            .unwrap_or(false),
        text_html: register_clipboard_format("text/html")
            .map(|format| query_get_data(data, format, -1, TYMED_HGLOBAL_VALUE))
            .unwrap_or(false),
        html_format: register_clipboard_format("HTML Format")
            .map(|format| query_get_data(data, format, -1, TYMED_HGLOBAL_VALUE))
            .unwrap_or(false),
        unicode_text: query_get_data(data, CF_UNICODETEXT_VALUE, -1, TYMED_HGLOBAL_VALUE),
    }
}

pub fn query_get_data(data: *const IDataObject, cf_format: u16, lindex: i32, tymed: DWORD) -> bool {
    if data.is_null() {
        return false;
    }
    unsafe {
        let mut format = FORMATETC {
            cfFormat: cf_format,
            ptd: null_mut(),
            dwAspect: DVASPECT_CONTENT_VALUE,
            lindex,
            tymed,
        };
        let hr = ((*(*(data as *mut IDataObject)).lpVtbl).QueryGetData)(
            data as *mut IDataObject,
            &mut format,
        );
        hr >= 0
    }
}

pub fn get_data(
    data: *mut IDataObject,
    cf_format: u16,
    lindex: i32,
    tymed: DWORD,
) -> Result<StgMediumGuard, HRESULT> {
    if data.is_null() {
        return Err(-1);
    }
    unsafe {
        let mut format = FORMATETC {
            cfFormat: cf_format,
            ptd: null_mut(),
            dwAspect: DVASPECT_CONTENT_VALUE,
            lindex,
            tymed,
        };
        let mut medium: STGMEDIUM = mem::zeroed();
        let hr = ((*(*data).lpVtbl).GetData)(data, &mut format, &mut medium);
        if hr < 0 {
            Err(hr)
        } else {
            Ok(StgMediumGuard::new(medium))
        }
    }
}

pub fn read_file_group_descriptors(
    data: *mut IDataObject,
) -> Result<Vec<VirtualFileDescriptor>, String> {
    let mut out = Vec::new();

    if let Some(format) = register_clipboard_format("FileGroupDescriptorW") {
        if let Ok(mut medium) = get_data(data, format, -1, TYMED_HGLOBAL_VALUE) {
            let bytes = unsafe {
                hglobal_to_bytes_limited(
                    medium.hglobal(),
                    4 + FILEDESCRIPTORW_SIZE * MAX_VIRTUAL_FILE_COUNT,
                )
            }?;
            out.extend(parse_file_group_descriptor_w(&bytes));
        }
    }

    if out.is_empty() {
        if let Some(format) = register_clipboard_format("FileGroupDescriptor") {
            if let Ok(mut medium) = get_data(data, format, -1, TYMED_HGLOBAL_VALUE) {
                let bytes = unsafe {
                    hglobal_to_bytes_limited(
                        medium.hglobal(),
                        4 + FILEDESCRIPTORA_SIZE * MAX_VIRTUAL_FILE_COUNT,
                    )
                }?;
                out.extend(parse_file_group_descriptor_a(&bytes));
            }
        }
    }

    if out.is_empty() {
        Err("FileGroupDescriptor is empty or unavailable".to_string())
    } else {
        Ok(out)
    }
}

pub fn register_clipboard_format(name: &str) -> Option<u16> {
    let wide = to_wide_null(name);
    let id = unsafe { RegisterClipboardFormatW(wide.as_ptr()) };
    if id == 0 {
        None
    } else {
        Some(id as u16)
    }
}

pub unsafe fn hglobal_size(hglobal: HGLOBAL) -> usize {
    GlobalSize(hglobal)
}

pub unsafe fn hglobal_to_bytes_limited(
    hglobal: HGLOBAL,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    let size = GlobalSize(hglobal);
    if size == 0 {
        return Err("HGLOBAL is empty".to_string());
    }
    if size > max_bytes {
        return Err(format!("HGLOBAL exceeds limit: {size} > {max_bytes}"));
    }
    let ptr = GlobalLock(hglobal);
    if ptr.is_null() {
        return Err("GlobalLock failed".to_string());
    }
    let slice = std::slice::from_raw_parts(ptr as *const u8, size);
    let bytes = slice.to_vec();
    let _ = GlobalUnlock(hglobal);
    Ok(bytes)
}

fn parse_file_group_descriptor_w(bytes: &[u8]) -> Vec<VirtualFileDescriptor> {
    parse_file_group_descriptor(bytes, FILEDESCRIPTORW_SIZE, true)
}

fn parse_file_group_descriptor_a(bytes: &[u8]) -> Vec<VirtualFileDescriptor> {
    parse_file_group_descriptor(bytes, FILEDESCRIPTORA_SIZE, false)
}

fn parse_file_group_descriptor(
    bytes: &[u8],
    descriptor_size: usize,
    wide_name: bool,
) -> Vec<VirtualFileDescriptor> {
    if bytes.len() < 4 {
        return Vec::new();
    }
    let count = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    let safe_count = count.min(MAX_VIRTUAL_FILE_COUNT);
    let mut out = Vec::new();

    for idx in 0..safe_count {
        let start = 4 + idx * descriptor_size;
        let end = start + descriptor_size;
        if end > bytes.len() {
            break;
        }
        let descriptor = &bytes[start..end];
        let name = if wide_name {
            read_utf16_name_at(descriptor, FILEDESCRIPTOR_FILENAME_OFFSET, 260)
        } else {
            read_ansi_name_at(descriptor, FILEDESCRIPTOR_FILENAME_OFFSET, 260)
        };
        out.push(VirtualFileDescriptor {
            index: idx,
            name: if name.trim().is_empty() {
                format!("web_image_{}", idx + 1)
            } else {
                name
            },
            declared_size: read_descriptor_size(descriptor),
        });
    }

    out
}

fn read_descriptor_size(descriptor: &[u8]) -> Option<u64> {
    if descriptor.len() < FILEDESCRIPTOR_SIZE_LOW_OFFSET + 4 {
        return None;
    }
    let high = u32::from_le_bytes([
        descriptor[FILEDESCRIPTOR_SIZE_HIGH_OFFSET],
        descriptor[FILEDESCRIPTOR_SIZE_HIGH_OFFSET + 1],
        descriptor[FILEDESCRIPTOR_SIZE_HIGH_OFFSET + 2],
        descriptor[FILEDESCRIPTOR_SIZE_HIGH_OFFSET + 3],
    ]) as u64;
    let low = u32::from_le_bytes([
        descriptor[FILEDESCRIPTOR_SIZE_LOW_OFFSET],
        descriptor[FILEDESCRIPTOR_SIZE_LOW_OFFSET + 1],
        descriptor[FILEDESCRIPTOR_SIZE_LOW_OFFSET + 2],
        descriptor[FILEDESCRIPTOR_SIZE_LOW_OFFSET + 3],
    ]) as u64;
    let size = (high << 32) | low;
    if size == 0 {
        None
    } else {
        Some(size)
    }
}

fn read_utf16_name_at(bytes: &[u8], offset: usize, max_units: usize) -> String {
    if bytes.len() <= offset {
        return String::new();
    }
    let mut units = Vec::new();
    let available = ((bytes.len() - offset) / 2).min(max_units);
    for i in 0..available {
        let at = offset + i * 2;
        let unit = u16::from_le_bytes([bytes[at], bytes[at + 1]]);
        if unit == 0 {
            break;
        }
        units.push(unit);
    }
    String::from_utf16_lossy(&units)
}

fn read_ansi_name_at(bytes: &[u8], offset: usize, max_bytes: usize) -> String {
    if bytes.len() <= offset {
        return String::new();
    }
    let available = (bytes.len() - offset).min(max_bytes);
    let raw = &bytes[offset..offset + available];
    let end = raw.iter().position(|b| *b == 0).unwrap_or(raw.len());
    String::from_utf8_lossy(&raw[..end]).to_string()
}

fn to_wide_null(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[allow(dead_code)]
pub fn data_object_ptr_debug(data: *mut IDataObject) -> *mut c_void {
    data as *mut c_void
}

#[allow(dead_code)]
pub fn drag_query_file_count_cast(value: u32) -> UINT {
    value as UINT
}
