// src-tauri/src/native_drop.rs
// Windows-only OLE drag/drop receiver implemented with winapi.
// This avoids version conflicts between Tauri's windows-rs dependencies and a separate windows crate.

#[cfg(target_os = "windows")]
mod win {
    use crate::virtual_drop;
    use serde::Serialize;
    use std::cell::RefCell;
    use std::ffi::OsStr;
    use std::mem;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::Instant;

    use tauri::{AppHandle, Emitter};

    use winapi::ctypes::c_void;
    use winapi::shared::guiddef::{GUID, REFIID};
    use winapi::shared::minwindef::{BOOL, DWORD, HGLOBAL, TRUE, UINT, ULONG};
    use winapi::shared::ntdef::HRESULT;
    use winapi::shared::windef::{HWND, POINTL};
    use winapi::shared::winerror::{E_NOINTERFACE, E_POINTER, S_OK};
    use winapi::um::objidl::{IDataObject, FORMATETC, STGMEDIUM};
    use winapi::um::ole2::{OleInitialize, RegisterDragDrop, RevokeDragDrop};
    use winapi::um::oleidl::{IDropTarget, IDropTargetVtbl};
    use winapi::um::shellapi::{DragQueryFileW, HDROP};
    use winapi::um::unknwnbase::{IUnknown, IUnknownVtbl};
    use winapi::um::winbase::{GlobalLock, GlobalSize, GlobalUnlock};
    use winapi::um::winuser::{EnumChildWindows, FindWindowW, RegisterClipboardFormatW};

    const DROPEFFECT_COPY_VALUE: DWORD = 1;
    const CF_UNICODETEXT_VALUE: u16 = 13;
    const CF_HDROP_VALUE: u16 = 15;
    const DVASPECT_CONTENT_VALUE: DWORD = 1;
    const TYMED_HGLOBAL_VALUE: DWORD = 1;
    const MAX_NATIVE_DROP_TEXT_BYTES: usize = 8 * 1024 * 1024;
    const EDGE_WINDOW_TITLE: &str =
        "\u{7075}\u{611f}\u{62bd}\u{5c49}-\u{89e6}\u{53d1}\u{6761}";
    const MAIN_WINDOW_TITLE: &str = "\u{7075}\u{611f}\u{62bd}\u{5c49}";

    #[link(name = "ole32")]
    extern "system" {
        fn ReleaseStgMedium(pmedium: *mut STGMEDIUM);
    }

    // IID_IUnknown = 00000000-0000-0000-C000-000000000046
    const IID_IUNKNOWN_LOCAL: GUID = GUID {
        Data1: 0x00000000,
        Data2: 0x0000,
        Data3: 0x0000,
        Data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };

    // IID_IDropTarget = 00000122-0000-0000-C000-000000000046
    const IID_IDROPTARGET_LOCAL: GUID = GUID {
        Data1: 0x00000122,
        Data2: 0x0000,
        Data3: 0x0000,
        Data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };

    #[derive(Debug, Clone, Serialize)]
    pub struct NativeWebImage {
        pub url: String,
        pub name: Option<String>,
    }

    #[derive(Debug, Clone, Serialize)]
    pub struct NativeDropPayload {
        pub source: String,
        pub paths: Vec<String>,
        pub web_images: Vec<NativeWebImage>,
        pub texts: Vec<String>,
    }

    #[repr(C)]
    struct DrawerDropTarget {
        lp_vtbl: *const IDropTargetVtbl,
        ref_count: AtomicU32,
        app: AppHandle,
        label: String,
    }

    struct RegisteredTarget {
        hwnd: HWND,
        _target: *mut IDropTarget,
    }

    impl Drop for RegisteredTarget {
        fn drop(&mut self) {
            unsafe {
                let _ = RevokeDragDrop(self.hwnd);
            }
        }
    }

    thread_local! {
        static REGISTERED_TARGETS: RefCell<Vec<RegisteredTarget>> = RefCell::new(Vec::new());
    }

    static DROP_TARGET_VTBL: IDropTargetVtbl = IDropTargetVtbl {
        parent: IUnknownVtbl {
            QueryInterface: drop_target_query_interface,
            AddRef: drop_target_add_ref,
            Release: drop_target_release,
        },
        DragEnter: drop_target_drag_enter,
        DragOver: drop_target_drag_over,
        DragLeave: drop_target_drag_leave,
        Drop: drop_target_drop,
    };

    unsafe extern "system" fn drop_target_query_interface(
        this: *mut IUnknown,
        riid: REFIID,
        ppv: *mut *mut c_void,
    ) -> HRESULT {
        if ppv.is_null() {
            return E_POINTER;
        }

        *ppv = null_mut();

        if riid.is_null() {
            return E_NOINTERFACE;
        }

        if guid_eq(&*riid, &IID_IUNKNOWN_LOCAL) || guid_eq(&*riid, &IID_IDROPTARGET_LOCAL) {
            *ppv = this as *mut c_void;
            drop_target_add_ref(this);
            S_OK
        } else {
            E_NOINTERFACE
        }
    }

    unsafe extern "system" fn drop_target_add_ref(this: *mut IUnknown) -> ULONG {
        if this.is_null() {
            return 0;
        }
        let target = this as *mut DrawerDropTarget;
        (*target).ref_count.fetch_add(1, Ordering::Relaxed) + 1
    }

    unsafe extern "system" fn drop_target_release(this: *mut IUnknown) -> ULONG {
        if this.is_null() {
            return 0;
        }
        let target = this as *mut DrawerDropTarget;
        let prev = (*target).ref_count.fetch_sub(1, Ordering::Release);
        // These targets are intentionally leaked for the process lifetime. OLE may keep
        // callback pointers during shutdown, so freeing them here is more dangerous.
        prev.saturating_sub(1)
    }

    unsafe extern "system" fn drop_target_drag_enter(
        this: *mut IDropTarget,
        _data_object: *const IDataObject,
        _key_state: DWORD,
        _pt: *const POINTL,
        effect: *mut DWORD,
    ) -> HRESULT {
        if !effect.is_null() {
            *effect = DROPEFFECT_COPY_VALUE;
        }
        let target = target_from_idrop(this);
        let _ = target.app.emit("native-drag-enter", target.label.clone());
        S_OK
    }

    unsafe extern "system" fn drop_target_drag_over(
        _this: *mut IDropTarget,
        _key_state: DWORD,
        _pt: *const POINTL,
        effect: *mut DWORD,
    ) -> HRESULT {
        if !effect.is_null() {
            *effect = DROPEFFECT_COPY_VALUE;
        }
        S_OK
    }

    unsafe extern "system" fn drop_target_drag_leave(this: *mut IDropTarget) -> HRESULT {
        let target = target_from_idrop(this);
        let _ = target.app.emit("native-drag-leave", target.label.clone());
        S_OK
    }

    unsafe extern "system" fn drop_target_drop(
        this: *mut IDropTarget,
        data_object: *const IDataObject,
        _key_state: DWORD,
        pt: *const POINTL,
        effect: *mut DWORD,
    ) -> HRESULT {
        let callback_started = Instant::now();

        if !effect.is_null() {
            *effect = DROPEFFECT_COPY_VALUE;
        }

        if !data_object.is_null() {
            let target = target_from_idrop(this);
            let mut payload = parse_data_object(data_object);
            payload.source = target.label.clone();

            if !payload.paths.is_empty() || !payload.web_images.is_empty() {
                let _ = target.app.emit("native-drop", payload);
            } else {
                let formats = virtual_drop::inspect_formats(data_object);
                let source_formats = formats.names();
                if formats.file_descriptor && formats.file_contents {
                    let drop_position = if pt.is_null() {
                        None
                    } else {
                        Some(((*pt).x, (*pt).y))
                    };
                    if let Err(err) = virtual_drop::enqueue_from_drop(
                        &target.app,
                        data_object,
                        target.label.clone(),
                        source_formats,
                        drop_position,
                    ) {
                        eprintln!("virtual drop enqueue failed: {err}");
                    }
                } else if !payload.texts.is_empty() {
                    let _ = target.app.emit("native-drop", payload);
                }
            }

            virtual_drop::diagnostics::warn_slow_drop(&target.label, callback_started.elapsed());
        }

        S_OK
    }

    unsafe fn target_from_idrop<'a>(this: *mut IDropTarget) -> &'a mut DrawerDropTarget {
        &mut *(this as *mut DrawerDropTarget)
    }

    fn guid_eq(a: &GUID, b: &GUID) -> bool {
        a.Data1 == b.Data1 && a.Data2 == b.Data2 && a.Data3 == b.Data3 && a.Data4 == b.Data4
    }

    pub fn init_native_drop(app: &tauri::App) -> Result<(), String> {
        unsafe {
            let _ = OleInitialize(null_mut());
        }
        virtual_drop::init(app.handle().clone());

        let handle = app.handle().clone();

        register_window_by_title(handle.clone(), "edge", EDGE_WINDOW_TITLE)?;
        register_window_by_title(handle, "main", MAIN_WINDOW_TITLE)?;

        Ok(())
    }

    pub fn refresh_edge_native_drop(app_handle: &AppHandle) -> Result<(), String> {
        unsafe {
            let _ = OleInitialize(null_mut());
        }

        register_window_by_title(app_handle.clone(), "edge", EDGE_WINDOW_TITLE)?;
        Ok(())
    }

    pub fn cancel_virtual_drop(job_id: &str) -> Result<(), String> {
        virtual_drop::cancel(job_id)
    }

    fn register_window_by_title(app: AppHandle, label: &str, title: &str) -> Result<(), String> {
        let title_w = to_wide_null(title);
        let hwnd = unsafe { FindWindowW(null_mut(), title_w.as_ptr()) };
        if hwnd.is_null() {
            return Err(format!("native drop: window not found by title: {title}"));
        }

        register_single_hwnd(app.clone(), label.to_string(), hwnd, label)?;

        let mut child_hwnds: Vec<HWND> = Vec::new();
        unsafe {
            let _ = EnumChildWindows(
                hwnd,
                Some(enum_child_windows_proc),
                &mut child_hwnds as *mut Vec<HWND> as isize,
            );
        }

        for (idx, child) in child_hwnds.into_iter().enumerate() {
            let child_label = format!("{label}/child/{idx}");
            let _ = register_single_hwnd(app.clone(), label.to_string(), child, &child_label);
        }

        Ok(())
    }

    unsafe extern "system" fn enum_child_windows_proc(hwnd: HWND, lparam: isize) -> BOOL {
        let child_hwnds = &mut *(lparam as *mut Vec<HWND>);
        child_hwnds.push(hwnd);
        TRUE
    }

    fn register_single_hwnd(
        app: AppHandle,
        label: String,
        hwnd: HWND,
        debug_label: &str,
    ) -> Result<(), String> {
        unsafe {
            let _ = RevokeDragDrop(hwnd);

            let target = Box::new(DrawerDropTarget {
                lp_vtbl: &DROP_TARGET_VTBL,
                ref_count: AtomicU32::new(1),
                app,
                label,
            });

            let raw_target = Box::into_raw(target) as *mut IDropTarget;
            let hr = RegisterDragDrop(hwnd, raw_target);
            if hr < 0 {
                return Err(format!(
                    "RegisterDragDrop({debug_label}) failed: HRESULT=0x{:08X}",
                    hr as u32
                ));
            }

            REGISTERED_TARGETS.with(|targets| {
                targets.borrow_mut().push(RegisteredTarget {
                    hwnd,
                    _target: raw_target,
                });
            });
        }

        Ok(())
    }

    fn parse_data_object(data: *const IDataObject) -> NativeDropPayload {
        let mut payload = NativeDropPayload {
            source: String::new(),
            paths: Vec::new(),
            web_images: Vec::new(),
            texts: Vec::new(),
        };

        payload.paths.extend(read_hdrop_paths(data));
        if !payload.paths.is_empty() {
            return payload;
        }

        let mut candidates: Vec<String> = Vec::new();
        for format_name in [
            "HTML Format",
            "text/html",
            "UniformResourceLocatorW",
            "UniformResourceLocator",
            "text/uri-list",
        ] {
            if let Some(value) = read_registered_hglobal_text(data, format_name) {
                candidates.push(value);
            }
        }

        if let Some(text) = read_cf_unicode_text(data) {
            candidates.push(text.clone());
            if !looks_like_image_url(&text) && !text.trim().is_empty() {
                payload.texts.push(text);
            }
        }

        let mut seen = std::collections::HashSet::<String>::new();
        for raw in candidates {
            for url in extract_urls_from_drag_text(&raw) {
                if looks_like_image_url(&url) && seen.insert(url.clone()) {
                    payload.web_images.push(NativeWebImage { url, name: None });
                }
            }
        }

        payload
    }

    unsafe fn medium_hglobal(medium: &mut STGMEDIUM) -> HGLOBAL {
        *(*medium.u).hGlobal()
    }

    fn read_hdrop_paths(data: *const IDataObject) -> Vec<String> {
        let mut paths = Vec::new();
        if let Some(mut medium) = get_hglobal_medium(data, CF_HDROP_VALUE, -1) {
            unsafe {
                let hglobal = medium_hglobal(&mut medium);
                let hdrop = hglobal as HDROP;
                let count = DragQueryFileW(hdrop, 0xFFFFFFFF, null_mut(), 0);
                for i in 0..count {
                    let len = DragQueryFileW(hdrop, i, null_mut(), 0);
                    if len == 0 {
                        continue;
                    }
                    let mut buffer = vec![0u16; len as usize + 1];
                    let copied =
                        DragQueryFileW(hdrop, i, buffer.as_mut_ptr(), buffer.len() as UINT);
                    if copied > 0 {
                        buffer.truncate(copied as usize);
                        let path = String::from_utf16_lossy(&buffer);
                        if !path.trim().is_empty() {
                            paths.push(path);
                        }
                    }
                }
                ReleaseStgMedium(&mut medium);
            }
        }
        dedupe(paths)
    }

    fn read_cf_unicode_text(data: *const IDataObject) -> Option<String> {
        read_hglobal_utf16(data, CF_UNICODETEXT_VALUE, -1)
    }

    fn read_registered_hglobal_text(data: *const IDataObject, name: &str) -> Option<String> {
        let format = register_clipboard_format(name)?;

        if let Some(text) = read_hglobal_utf16(data, format, -1) {
            return Some(text);
        }
        if let Some(text) = read_hglobal_ansi_or_utf8(data, format, -1) {
            return Some(text);
        }

        None
    }

    fn get_hglobal_medium(
        data: *const IDataObject,
        cf_format: u16,
        lindex: i32,
    ) -> Option<STGMEDIUM> {
        let mut medium = get_medium(data, cf_format, lindex, TYMED_HGLOBAL_VALUE)?;
        if medium.tymed != TYMED_HGLOBAL_VALUE {
            unsafe { ReleaseStgMedium(&mut medium) };
            return None;
        }
        Some(medium)
    }

    fn get_medium(
        data: *const IDataObject,
        cf_format: u16,
        lindex: i32,
        tymed: DWORD,
    ) -> Option<STGMEDIUM> {
        if data.is_null() {
            return None;
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
            let hr = ((*(*(data as *mut IDataObject)).lpVtbl).GetData)(
                data as *mut IDataObject,
                &mut format,
                &mut medium,
            );
            if hr < 0 {
                None
            } else {
                Some(medium)
            }
        }
    }

    fn read_hglobal_utf16(data: *const IDataObject, cf_format: u16, lindex: i32) -> Option<String> {
        let mut medium = get_hglobal_medium(data, cf_format, lindex)?;
        let text = unsafe { hglobal_to_utf16_string(medium_hglobal(&mut medium)) };
        unsafe { ReleaseStgMedium(&mut medium) };
        text
    }

    fn read_hglobal_ansi_or_utf8(
        data: *const IDataObject,
        cf_format: u16,
        lindex: i32,
    ) -> Option<String> {
        let mut medium = get_hglobal_medium(data, cf_format, lindex)?;
        let text = unsafe { hglobal_to_bytes(medium_hglobal(&mut medium)) }.and_then(|bytes| {
            if bytes.is_empty() {
                return None;
            }
            let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
            let slice = &bytes[..end];
            Some(String::from_utf8_lossy(slice).to_string())
        });
        unsafe { ReleaseStgMedium(&mut medium) };
        text
    }

    unsafe fn hglobal_to_utf16_string(hglobal: HGLOBAL) -> Option<String> {
        let ptr = GlobalLock(hglobal);
        if ptr.is_null() {
            return None;
        }

        let size_bytes = GlobalSize(hglobal);
        if size_bytes == 0 || size_bytes > MAX_NATIVE_DROP_TEXT_BYTES {
            let _ = GlobalUnlock(hglobal);
            return None;
        }

        let len_u16 = size_bytes / 2;
        let slice = std::slice::from_raw_parts(ptr as *const u16, len_u16);
        let end = slice.iter().position(|c| *c == 0).unwrap_or(slice.len());
        let text = String::from_utf16_lossy(&slice[..end]);
        let _ = GlobalUnlock(hglobal);
        let text = text.trim_matches('\u{feff}').trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    }

    unsafe fn hglobal_to_bytes(hglobal: HGLOBAL) -> Option<Vec<u8>> {
        let ptr = GlobalLock(hglobal);
        if ptr.is_null() {
            return None;
        }
        let size = GlobalSize(hglobal);
        if size == 0 || size > MAX_NATIVE_DROP_TEXT_BYTES {
            let _ = GlobalUnlock(hglobal);
            return None;
        }
        let slice = std::slice::from_raw_parts(ptr as *const u8, size);
        let bytes = slice.to_vec();
        let _ = GlobalUnlock(hglobal);
        Some(bytes)
    }

    fn register_clipboard_format(name: &str) -> Option<u16> {
        let wide = to_wide_null(name);
        let id = unsafe { RegisterClipboardFormatW(wide.as_ptr()) };
        if id == 0 {
            None
        } else {
            Some(id as u16)
        }
    }

    fn extract_urls_from_drag_text(input: &str) -> Vec<String> {
        let mut out = Vec::new();
        let text = decode_html_entities(input);
        let lower_text: String = text.chars().map(|c| c.to_ascii_lowercase()).collect();

        for attr in ["src=", "data-src=", "href="] {
            let mut search_from = 0usize;
            while search_from < lower_text.len() {
                let Some(haystack) = lower_text.get(search_from..) else {
                    break;
                };
                let Some(rel_idx) = haystack.find(attr) else {
                    break;
                };
                let idx = search_from + rel_idx + attr.len();
                let Some(after_attr) = text.get(idx..) else {
                    break;
                };
                let trimmed = after_attr.trim_start();
                if let Some(first) = trimmed.chars().next() {
                    if first == '"' || first == '\'' {
                        if let Some(after_quote) = trimmed.get(1..) {
                            if let Some(end) = after_quote.find(first) {
                                if let Some(value) = trimmed.get(1..(1 + end)) {
                                    out.push(value.to_string());
                                }
                                search_from = idx.saturating_add(1 + end).min(lower_text.len());
                                continue;
                            }
                        }
                    }
                }
                search_from = idx.saturating_add(1).min(lower_text.len());
            }
        }

        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('#') || line.is_empty() {
                continue;
            }
            if line.starts_with("http://")
                || line.starts_with("https://")
                || line.starts_with("data:image/")
            {
                out.push(line.trim_matches(['\'', '"']).to_string());
            }
        }

        for token in
            text.split(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == '<' || c == '>')
        {
            let token = token.trim_matches([')', '(', ',', ';']);
            if token.starts_with("http://")
                || token.starts_with("https://")
                || token.starts_with("data:image/")
            {
                out.push(token.to_string());
            }
        }

        dedupe(
            out.into_iter()
                .map(normalize_url_candidate)
                .filter(|s| !s.is_empty())
                .collect(),
        )
    }

    fn looks_like_image_url(url: &str) -> bool {
        let lower = url.trim().to_ascii_lowercase();
        lower.starts_with("data:image/")
            || lower.ends_with(".png")
            || lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".gif")
            || lower.ends_with(".webp")
            || lower.ends_with(".avif")
            || lower.ends_with(".bmp")
            || lower.ends_with(".svg")
            || lower.contains(".png?")
            || lower.contains(".png#")
            || lower.contains(".jpg?")
            || lower.contains(".jpg#")
            || lower.contains(".jpeg?")
            || lower.contains(".jpeg#")
            || lower.contains(".gif?")
            || lower.contains(".gif#")
            || lower.contains(".webp?")
            || lower.contains(".webp#")
            || lower.contains(".avif?")
            || lower.contains(".avif#")
            || lower.contains(".bmp?")
            || lower.contains(".bmp#")
            || lower.contains(".svg?")
            || lower.contains(".svg#")
            || lower.contains("format=jpg")
            || lower.contains("format=jpeg")
            || lower.contains("format=png")
            || lower.contains("format=webp")
            || lower.contains("format=gif")
            || lower.contains("format=avif")
            || lower.contains("image")
            || looks_like_image_endpoint(&lower)
    }

    fn looks_like_image_endpoint(lower_url: &str) -> bool {
        let Some(rest) = lower_url
            .strip_prefix("https://")
            .or_else(|| lower_url.strip_prefix("http://"))
        else {
            return false;
        };
        let host_end = rest
            .find(|c| matches!(c, '/' | '?' | '#'))
            .unwrap_or(rest.len());
        let host = &rest[..host_end];
        let suffix = &rest[host_end..];

        if (host == "mm.bing.net" || host.ends_with(".mm.bing.net"))
            && (suffix.contains("/th/id/") || suffix.contains("pid=imgdetmain"))
        {
            return true;
        }
        if host == "huabanimg.com"
            || host.ends_with(".huabanimg.com")
            || host.contains("hbimg")
        {
            return true;
        }
        if (host == "huaban.com" || host.ends_with(".huaban.com"))
            && looks_like_huaban_pin_suffix(suffix)
        {
            return true;
        }

        suffix.contains("imgurl=")
            || suffix.contains("mediaurl=")
            || suffix.contains("imageurl=")
            || suffix.contains("thumbnail=")
            || suffix.contains("/image/")
            || suffix.contains("/images/")
            || suffix.contains("/img/")
            || suffix.contains("/thumb/")
            || suffix.contains("/thumbnail/")
    }

    fn looks_like_huaban_pin_suffix(suffix: &str) -> bool {
        let path = suffix.split(['?', '#']).next().unwrap_or(suffix);
        let mut parts = path.trim_start_matches('/').split('/');
        matches!(parts.next(), Some("pins"))
            && parts
                .next()
                .map(|pin_id| !pin_id.is_empty() && pin_id.chars().all(|ch| ch.is_ascii_digit()))
                .unwrap_or(false)
    }

    fn normalize_url_candidate(value: String) -> String {
        value
            .trim()
            .trim_matches(['\'', '"'])
            .trim_end_matches([')', ',', ';'])
            .replace("&amp;", "&")
    }

    fn decode_html_entities(value: &str) -> String {
        value
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .replace("&#34;", "\"")
            .replace("&#39;", "'")
            .replace("&apos;", "'")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
    }

    fn dedupe<T: std::hash::Hash + Eq + Clone>(items: Vec<T>) -> Vec<T> {
        let mut seen = std::collections::HashSet::<T>::new();
        let mut out = Vec::new();
        for item in items {
            if seen.insert(item.clone()) {
                out.push(item);
            }
        }
        out
    }

    fn to_wide_null(value: &str) -> Vec<u16> {
        OsStr::new(value)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }
}

#[cfg(target_os = "windows")]
pub use win::{cancel_virtual_drop, init_native_drop, refresh_edge_native_drop};

#[cfg(not(target_os = "windows"))]
pub fn init_native_drop(_app: &tauri::App) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn refresh_edge_native_drop(_app_handle: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn cancel_virtual_drop(_job_id: &str) -> Result<(), String> {
    Err("virtual drop is only available on Windows".to_string())
}
