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
    use url::Url;

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
        pub fallback_urls: Vec<String>,
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

            let formats = virtual_drop::inspect_formats(data_object);
            let has_virtual_file = formats.file_descriptor && formats.file_contents;
            let needs_web_file_fallback = payload.paths.is_empty()
                && has_virtual_file
                && payload
                    .web_images
                    .iter()
                    .any(|image| should_use_virtual_file_fallback(&image.url));
            let has_primary_payload = !payload.paths.is_empty() || !payload.web_images.is_empty();
            if has_primary_payload {
                let _ = target.app.emit("native-drop", payload.clone());
            }

            if (!has_primary_payload && has_virtual_file) || needs_web_file_fallback {
                let drop_position = if pt.is_null() {
                    None
                } else {
                    Some(((*pt).x, (*pt).y))
                };
                let source = if needs_web_file_fallback {
                    format!("{}/web-fallback", target.label)
                } else {
                    target.label.clone()
                };
                if let Err(err) = virtual_drop::enqueue_from_drop(
                    &target.app,
                    data_object,
                    source,
                    formats.names(),
                    drop_position,
                ) {
                    eprintln!("virtual drop enqueue failed: {err}");
                }
            } else if !has_primary_payload && !payload.texts.is_empty() {
                let _ = target.app.emit("native-drop", payload);
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

        if let Some(mut urls) = candidates
            .iter()
            .map(|raw| extract_urls_from_drag_text(raw))
            .find(|urls| !urls.is_empty())
        {
            let url = urls.remove(0);
            payload.web_images.push(NativeWebImage {
                url,
                name: None,
                fallback_urls: urls.into_iter().take(6).collect(),
            });
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

    #[derive(Debug)]
    struct DragUrlCandidate {
        value: String,
        priority: i32,
        order: usize,
    }

    fn extract_urls_from_drag_text(input: &str) -> Vec<String> {
        let text = decode_drag_text(input);
        let mut candidates = Vec::<DragUrlCandidate>::new();
        let mut order = 0usize;
        let mut push = |value: String, priority: i32| {
            if !value.trim().is_empty() {
                order += 1;
                candidates.push(DragUrlCandidate {
                    value,
                    priority,
                    order,
                });
            }
        };

        for (name, priority) in [
            ("data-objurl", 120),
            ("objurl", 120),
            ("data-imgurl", 115),
            ("imgurl", 115),
            ("data-image-url", 115),
            ("imageurl", 115),
            ("data-original", 110),
            ("data-original-src", 110),
            ("data-hover-url", 105),
            ("hover-url", 105),
            ("data-middle-url", 105),
            ("middle-url", 105),
            ("data-lazy-src", 90),
            ("data-src", 85),
            ("src", 75),
            ("data-thumburl", 65),
            ("thumburl", 65),
            ("data-thumbnail", 65),
            ("thumbnail", 65),
            ("href", 10),
        ] {
            for value in extract_named_assignment_values(&text, name, b'=') {
                push(value, priority);
            }
        }

        for (name, priority) in [("data-srcset", 80), ("srcset", 80)] {
            for value in extract_named_assignment_values(&text, name, b'=') {
                for (index, url) in extract_srcset_urls(&value).into_iter().enumerate() {
                    push(url, priority + index as i32);
                }
            }
        }

        for (name, priority) in [
            ("objurl", 120),
            ("imgurl", 115),
            ("imageurl", 115),
            ("original", 110),
            ("originalurl", 110),
            ("hoverurl", 105),
            ("middleurl", 105),
            ("replaceurl", 100),
            ("src", 75),
            ("thumburl", 65),
            ("thumbnail", 65),
        ] {
            for value in extract_named_assignment_values(&text, name, b':') {
                push(value, priority);
            }
        }

        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with('#')
                && (line.starts_with("http://")
                    || line.starts_with("https://")
                    || line.to_ascii_lowercase().starts_with("http%")
                    || line.starts_with("data:image/"))
            {
                push(line.to_string(), 30);
            }
        }

        for value in extract_embedded_urls(&text) {
            push(value, 0);
        }

        let mut ranked = candidates
            .into_iter()
            .filter_map(|candidate| {
                let value = normalize_url_candidate(candidate.value);
                let score = image_candidate_score(&value, candidate.priority);
                (score >= 55).then_some((value, score, candidate.order))
            })
            .collect::<Vec<_>>();
        ranked.sort_by(|left, right| right.1.cmp(&left.1).then(left.2.cmp(&right.2)));

        let mut seen = std::collections::HashSet::<String>::new();
        ranked
            .into_iter()
            .filter_map(|(value, _, _)| seen.insert(value.clone()).then_some(value))
            .collect()
    }

    fn decode_drag_text(value: &str) -> String {
        let mut current = decode_html_entities(value);
        for _ in 0..3 {
            let decoded = current
                .replace("\\u003a", ":")
                .replace("\\u003A", ":")
                .replace("\\u002f", "/")
                .replace("\\u002F", "/")
                .replace("\\u0026", "&")
                .replace("\\u003d", "=")
                .replace("\\u003D", "=")
                .replace("\\u003f", "?")
                .replace("\\u003F", "?")
                .replace("\\u0025", "%")
                .replace("\\u0023", "#")
                .replace("\\/", "/")
                .replace("\\\"", "\"")
                .replace("\\'", "'");
            if decoded == current {
                break;
            }
            current = decoded;
        }
        current
    }

    fn extract_named_assignment_values(input: &str, name: &str, delimiter: u8) -> Vec<String> {
        let lower = input.to_ascii_lowercase();
        let bytes = input.as_bytes();
        let lower_bytes = lower.as_bytes();
        let name_bytes = name.as_bytes();
        let mut values = Vec::new();
        let mut search_from = 0usize;

        while search_from < lower_bytes.len() {
            let Some(relative) = lower.get(search_from..).and_then(|tail| tail.find(name)) else {
                break;
            };
            let start = search_from + relative;
            let end = start + name_bytes.len();
            search_from = end;

            if start > 0 && is_assignment_name_byte(lower_bytes[start - 1]) {
                continue;
            }
            if end < lower_bytes.len() && is_assignment_name_byte(lower_bytes[end]) {
                continue;
            }

            let mut cursor = end;
            if matches!(bytes.get(cursor).copied(), Some(b'\'' | b'"')) {
                cursor += 1;
            }
            while matches!(bytes.get(cursor).copied(), Some(byte) if byte.is_ascii_whitespace()) {
                cursor += 1;
            }
            if bytes.get(cursor).copied() != Some(delimiter) {
                continue;
            }
            cursor += 1;
            while matches!(bytes.get(cursor).copied(), Some(byte) if byte.is_ascii_whitespace()) {
                cursor += 1;
            }

            let quote = bytes
                .get(cursor)
                .copied()
                .filter(|byte| matches!(byte, b'\'' | b'"'));
            if quote.is_some() {
                cursor += 1;
            }
            let value_start = cursor;
            while cursor < bytes.len() {
                let byte = bytes[cursor];
                if quote
                    .map(|expected| byte == expected)
                    .unwrap_or_else(|| byte.is_ascii_whitespace() || matches!(byte, b'>' | b'}'))
                {
                    break;
                }
                cursor += 1;
            }
            if cursor > value_start {
                values.push(input[value_start..cursor].to_string());
            }
            search_from = cursor.saturating_add(1);
        }

        values
    }

    fn is_assignment_name_byte(byte: u8) -> bool {
        byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-')
    }

    fn extract_srcset_urls(value: &str) -> Vec<String> {
        let mut segments = Vec::new();
        let mut start = 0usize;
        for (index, _) in value.match_indices(',') {
            let remainder = value[index + 1..].trim_start();
            if remainder.starts_with("http://")
                || remainder.starts_with("https://")
                || remainder.starts_with("data:")
                || remainder.starts_with("//")
            {
                segments.push(&value[start..index]);
                start = index + 1;
            }
        }
        segments.push(&value[start..]);
        segments
            .into_iter()
            .filter_map(|segment| segment.split_whitespace().next())
            .filter(|url| !url.is_empty())
            .map(str::to_string)
            .collect()
    }

    fn extract_embedded_urls(input: &str) -> Vec<String> {
        let lower = input.to_ascii_lowercase();
        let mut matches = Vec::<(usize, String)>::new();
        for prefix in [
            "https://",
            "http://",
            "data:image/",
            "https%3a%2f%2f",
            "http%3a%2f%2f",
            "https%25",
            "http%25",
        ] {
            let mut search_from = 0usize;
            while search_from < lower.len() {
                let Some(relative) = lower.get(search_from..).and_then(|tail| tail.find(prefix))
                else {
                    break;
                };
                let start = search_from + relative;
                let mut end = start + prefix.len();
                while let Some(byte) = input.as_bytes().get(end) {
                    if byte.is_ascii_whitespace()
                        || matches!(byte, b'\'' | b'"' | b'<' | b'>' | b'\\' | b')' | b'}')
                    {
                        break;
                    }
                    end += 1;
                }
                matches.push((start, input[start..end].to_string()));
                search_from = end.max(start + 1);
            }
        }
        matches.sort_by_key(|(index, _)| *index);
        matches.into_iter().map(|(_, value)| value).collect()
    }

    fn image_candidate_score(value: &str, priority: i32) -> i32 {
        if value.is_empty() || is_baidu_search_page_url(value) {
            return -10000;
        }
        let lower = value.to_ascii_lowercase();
        if lower.starts_with("data:image/") {
            return if value.len() < 160 || value.contains("R0lGODlhAQABA") {
                priority - 200
            } else {
                priority + 90
            };
        }

        let mut score = priority;
        if has_image_extension_in_url(&lower) {
            score += 100;
        }
        if looks_like_image_endpoint(&lower) {
            score += 80;
        }
        if is_baidu_image_cdn_url(&lower) {
            score += 200;
        }
        if image_like_url_host(&lower) {
            score += 60;
        }
        if lower.starts_with("https://") {
            score += 5;
        }
        if ["blank", "transparent", "placeholder", "loading"]
            .iter()
            .any(|token| lower.contains(token))
        {
            score -= 80;
        }
        score
    }

    fn is_baidu_search_page_url(value: &str) -> bool {
        Url::parse(value)
            .ok()
            .map(|parsed| {
                parsed.host_str() == Some("image.baidu.com")
                    && (parsed.path().starts_with("/search/index")
                        || parsed.path().starts_with("/search/detail"))
            })
            .unwrap_or(false)
    }

    fn image_like_url_host(lower_url: &str) -> bool {
        Url::parse(lower_url)
            .ok()
            .and_then(|parsed| parsed.host_str().map(is_image_like_host))
            .unwrap_or(false)
    }

    fn should_use_virtual_file_fallback(value: &str) -> bool {
        Url::parse(value)
            .ok()
            .and_then(|parsed| parsed.host_str().map(str::to_ascii_lowercase))
            .map(|host| {
                host == "699pic.com"
                    || host.ends_with(".699pic.com")
                    || host == "90sjimg.com"
                    || host.ends_with(".90sjimg.com")
            })
            .unwrap_or(false)
    }

    fn is_baidu_image_cdn_url(lower_url: &str) -> bool {
        Url::parse(lower_url)
            .ok()
            .and_then(|parsed| {
                let host = parsed.host_str()?;
                Some(is_baidu_image_cdn(host, parsed.path()))
            })
            .unwrap_or(false)
    }

    fn looks_like_image_url(url: &str) -> bool {
        let lower = url.trim().to_ascii_lowercase();
        lower.starts_with("data:image/")
            || has_image_extension_in_url(&lower)
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
            || contains_image_format_parameter(&lower)
            || (image_like_url_host(&lower) && !is_baidu_search_page_url(&lower))
            || looks_like_image_endpoint(&lower)
    }

    fn extract_nested_image_url(value: &str) -> Option<String> {
        let parsed = Url::parse(value.trim()).ok()?;
        let mut candidates = Vec::new();
        for (key, param_value) in parsed.query_pairs() {
            if !is_nested_image_url_param(&key) {
                continue;
            }
            let decoded = decode_url_component_loose(&param_value)
                .trim()
                .trim_matches(['\'', '"'])
                .to_string();
            if decoded.starts_with("http://") || decoded.starts_with("https://") {
                candidates.push(decoded);
            }
        }
        candidates.into_iter().find(|candidate| {
            looks_like_image_url(candidate) || has_image_extension_in_url(candidate)
        })
    }

    fn is_nested_image_url_param(key: &str) -> bool {
        matches!(
            key.to_ascii_lowercase().as_str(),
            "objurl"
                | "imgurl"
                | "imageurl"
                | "mediaurl"
                | "thumbnail"
                | "thumburl"
                | "picurl"
                | "hoverurl"
                | "middleurl"
                | "originalurl"
                | "replaceurl"
                | "src"
        )
    }

    fn decode_url_component_loose(value: &str) -> String {
        let mut current = value.to_string();
        for _ in 0..3 {
            let decoded = percent_decode_once(&current);
            if decoded == current {
                break;
            }
            current = decoded;
        }
        current
    }

    fn percent_decode_once(value: &str) -> String {
        let bytes = value.as_bytes();
        let mut out = Vec::with_capacity(bytes.len());
        let mut index = 0usize;
        let mut changed = false;
        while index < bytes.len() {
            if bytes[index] == b'%' && index + 2 < bytes.len() {
                if let (Some(high), Some(low)) =
                    (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
                {
                    out.push((high << 4) | low);
                    index += 3;
                    changed = true;
                    continue;
                }
            }
            out.push(bytes[index]);
            index += 1;
        }
        if changed {
            String::from_utf8_lossy(&out).to_string()
        } else {
            value.to_string()
        }
    }

    fn hex_value(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }

    fn has_image_extension_in_url(value: &str) -> bool {
        let lower = value.to_ascii_lowercase();
        [
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg",
        ]
        .iter()
        .any(|ext| {
            lower
                .find(ext)
                .map(|idx| {
                    let next = lower.as_bytes().get(idx + ext.len()).copied();
                    matches!(
                        next,
                        None | Some(b'/')
                            | Some(b'?')
                            | Some(b'#')
                            | Some(b'!')
                            | Some(b'&')
                            | Some(b':')
                    )
                })
                .unwrap_or(false)
        })
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
        if is_baidu_image_cdn(host, suffix) {
            return true;
        }
        if host == "huabanimg.com" || host.ends_with(".huabanimg.com") || host.contains("hbimg") {
            return true;
        }
        if (host == "huaban.com" || host.ends_with(".huaban.com"))
            && looks_like_huaban_pin_suffix(suffix)
        {
            return true;
        }
        if is_image_like_host(host) && contains_image_format_parameter(suffix) {
            return true;
        }

        suffix.contains("imgurl=")
            || suffix.contains("mediaurl=")
            || suffix.contains("imageurl=")
            || suffix.contains("thumbnail=")
            || contains_image_format_parameter(suffix)
            || suffix.contains("/image/")
            || suffix.contains("/images/")
            || suffix.contains("/img/")
            || suffix.contains("/thumb/")
            || suffix.contains("/thumbnail/")
    }

    fn is_baidu_image_cdn(host: &str, suffix: &str) -> bool {
        host.strip_prefix("img")
            .and_then(|rest| rest.strip_suffix(".baidu.com"))
            .map(|middle| middle.is_empty() || middle.chars().all(|ch| ch.is_ascii_digit()))
            .unwrap_or(false)
            && suffix.starts_with("/it/")
    }

    fn is_image_like_host(host: &str) -> bool {
        host.starts_with("img") || host.contains(".img.") || host.contains("image")
    }

    fn contains_image_format_parameter(value: &str) -> bool {
        value.split(['?', '&', ';']).any(|part| {
            let Some((raw_key, raw_value)) = part.split_once('=') else {
                return false;
            };
            let key = raw_key
                .rsplit('/')
                .next()
                .unwrap_or(raw_key)
                .trim()
                .to_ascii_lowercase();
            matches!(
                key.as_str(),
                "format"
                    | "fmt"
                    | "f"
                    | "type"
                    | "mime"
                    | "mimetype"
                    | "content-type"
                    | "filetype"
                    | "ext"
            ) && has_image_format_hint(raw_value)
        })
    }

    fn has_image_format_hint(value: &str) -> bool {
        let lower = value.to_ascii_lowercase();
        if lower.contains("image/") || lower.contains("image%2f") {
            return true;
        }
        lower
            .split(|ch: char| !ch.is_ascii_alphanumeric())
            .any(|token| {
                matches!(
                    token,
                    "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "bmp" | "svg"
                )
            })
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
        let mut normalized = decode_drag_text(&value)
            .trim()
            .trim_matches(['\'', '"'])
            .trim_end_matches([')', '}', ']', '\\', ',', ';'])
            .to_string();
        let lower = normalized.to_ascii_lowercase();
        let encoded_protocol = lower.starts_with("http%") || lower.starts_with("https%");
        if encoded_protocol {
            normalized = decode_url_component_loose(&normalized);
            normalized = trim_baidu_detail_query_tail(normalized);
        }
        if normalized.starts_with("//") {
            normalized = format!("https:{normalized}");
        }
        extract_nested_image_url(&normalized).unwrap_or(normalized)
    }

    fn trim_baidu_detail_query_tail(value: String) -> String {
        let lower = value.to_ascii_lowercase();
        ["&os=", "&pd=", "&pi=", "&pn=", "&rn=", "&simid=", "&tn=", "&width=", "&word=", "&z="]
            .iter()
            .filter_map(|marker| lower.find(marker))
            .min()
            .map(|index| value[..index].to_string())
            .unwrap_or(value)
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

    #[cfg(test)]
    mod tests {
        use super::{extract_urls_from_drag_text, should_use_virtual_file_fallback};

        #[test]
        fn extracts_percent_encoded_baidu_data_objurl_before_placeholder() {
            let html = r#"<a href="https://image.baidu.com/search/index?tn=baiduimage&word=s"><img src="https://image.baidu.com/static/blank.gif" data-objurl="https%3A%2F%2Fimg95.699pic.com%2Fxsj%2F0p%2Fb3%2Fur.jpg%21%2Ffh%2F300"></a>"#;
            let urls = extract_urls_from_drag_text(html);
            assert_eq!(
                urls.first().map(String::as_str),
                Some("https://img95.699pic.com/xsj/0p/b3/ur.jpg!/fh/300")
            );
        }

        #[test]
        fn extracts_escaped_baidu_objurl_json() {
            let html = r#"<div data-state=\"{\\\"objURL\\\":\\\"https:\\/\\/img2.baidu.com\\/it\\/u=3840004386,1451325835&amp;fm=253&amp;fmt=auto&amp;f=JPEG?w=500&amp;h=700\\\"}\"></div>"#;
            let urls = extract_urls_from_drag_text(html);
            assert_eq!(
                urls.first().map(String::as_str),
                Some("https://img2.baidu.com/it/u=3840004386,1451325835&fm=253&fmt=auto&f=JPEG?w=500&h=700")
            );
        }

        #[test]
        fn prefers_accessible_baidu_cached_tile_over_source_image() {
            let html = r#"<a href="https://image.baidu.com/search/detail?tn=baiduimagedetail"><img src="https://img2.baidu.com/it/u=3840004386,1451325835&amp;fm=253&amp;fmt=auto&amp;f=JPEG?w=500&amp;h=700" data-objurl="https://img95.699pic.com/xsj/0p/b3/ur.jpg!/fh/300"></a>"#;
            let urls = extract_urls_from_drag_text(html);
            assert_eq!(
                urls.first().map(String::as_str),
                Some("https://img2.baidu.com/it/u=3840004386,1451325835&fm=253&fmt=auto&f=JPEG?w=500&h=700")
            );
        }

        #[test]
        fn rejects_plain_baidu_search_page() {
            let urls = extract_urls_from_drag_text(
                "https://image.baidu.com/search/index?tn=baiduimage&word=s",
            );
            assert!(urls.is_empty());
        }

        #[test]
        fn decodes_detached_double_encoded_baidu_objurl() {
            let raw = "https%253A%252F%252Fku.90sjimg.com%252Felement_origin_min_pic%252F17%252F08%252F14%252Ff07d382fe836fbf9657581b5ac57ca51.jpg&os=828300594%2C37046194&pd=image_content&pn=5&tn=baiduimagedetail";
            let urls = extract_urls_from_drag_text(raw);
            assert_eq!(
                urls.first().map(String::as_str),
                Some("https://ku.90sjimg.com/element_origin_min_pic/17/08/14/f07d382fe836fbf9657581b5ac57ca51.jpg")
            );
        }

        #[test]
        fn uses_virtual_file_fallback_for_blocked_image_hosts() {
            assert!(should_use_virtual_file_fallback(
                "https://img95.699pic.com/xsj/0p/b3/ur.jpg!/fh/300"
            ));
            assert!(should_use_virtual_file_fallback(
                "https://ku.90sjimg.com/example.jpg"
            ));
            assert!(!should_use_virtual_file_fallback(
                "https://img2.baidu.com/it/u=1,2&f=JPEG"
            ));
        }
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
