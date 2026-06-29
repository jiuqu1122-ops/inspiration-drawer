// src-tauri/src/native_drop.rs
// Windows-only OLE drag/drop receiver implemented with winapi.
// This avoids version conflicts between Tauri's windows-rs dependencies and a separate windows crate.

#[cfg(target_os = "windows")]
mod win {
    use serde::Serialize;
    use std::cell::RefCell;
    use std::ffi::OsStr;
    use std::fs;
    use std::mem;
    use std::os::windows::ffi::OsStrExt;
    use std::path::PathBuf;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicU32, Ordering};

    use tauri::{AppHandle, Emitter, Manager};

    use winapi::ctypes::c_void;
    use winapi::shared::guiddef::{GUID, REFIID};
    use winapi::shared::minwindef::{BOOL, DWORD, HGLOBAL, TRUE, UINT, ULONG};
    use winapi::shared::ntdef::HRESULT;
    use winapi::shared::windef::{HWND, POINTL};
    use winapi::shared::winerror::{E_NOINTERFACE, E_POINTER, S_OK};
    use winapi::um::objidl::{IDataObject, FORMATETC, STGMEDIUM};
    use winapi::um::objidlbase::{ISequentialStream, IStream};
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
    const TYMED_ISTREAM_VALUE: DWORD = 4;
    const FILEDESCRIPTORW_SIZE: usize = 592;
    const FILEDESCRIPTORA_SIZE: usize = 332;
    const FILEDESCRIPTOR_FILENAME_OFFSET: usize = 72;
    const FILEDESCRIPTOR_SIZE_HIGH_OFFSET: usize = 64;
    const FILEDESCRIPTOR_SIZE_LOW_OFFSET: usize = 68;
    const MAX_VIRTUAL_FILE_BYTES: usize = 128 * 1024 * 1024;

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
        // We intentionally keep the Box leaked for the process lifetime. These targets are
        // registered once and live until app exit; dropping them during OLE shutdown can leave
        // dangling raw pointers inside Windows drag/drop bookkeeping.
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
        _pt: *const POINTL,
        effect: *mut DWORD,
    ) -> HRESULT {
        if !effect.is_null() {
            *effect = DROPEFFECT_COPY_VALUE;
        }

        if !data_object.is_null() {
            let target = target_from_idrop(this);
            let mut payload = parse_data_object(data_object, &target.app);
            payload.source = target.label.clone();

            if !payload.paths.is_empty()
                || !payload.web_images.is_empty()
                || !payload.texts.is_empty()
            {
                let _ = target.app.emit("native-drop", payload);
            }
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

        let handle = app.handle().clone();

        // These match the titles in tauri.conf.json. FindWindowW also finds hidden windows.
        register_window_by_title(handle.clone(), "edge", "灵感抽屉-触发条")?;
        register_window_by_title(handle, "main", "灵感抽屉")?;

        Ok(())
    }

    pub fn refresh_edge_native_drop(app_handle: &AppHandle) -> Result<(), String> {
        unsafe {
            let _ = OleInitialize(null_mut());
        }

        // 只刷新 edge/悬浮方块，不碰 main，避免在拖拽过程中反复重注册 WebView2 主窗口导致卡死。
        // 这个命令由前端在“触发入口定位完成后”主动调用，而不是在 position_edge 内部自动调用。
        register_window_by_title(app_handle.clone(), "edge", "灵感抽屉-触发条")?;
        Ok(())
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

    fn parse_data_object(data: *const IDataObject, app: &AppHandle) -> NativeDropPayload {
        let mut payload = NativeDropPayload {
            source: String::new(),
            paths: Vec::new(),
            web_images: Vec::new(),
            texts: Vec::new(),
        };

        payload.paths.extend(read_hdrop_paths(data));

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

        // Some browsers/sites do not provide a URL when dragging an image. They provide a
        // virtual file through FileGroupDescriptorW + FileContents instead. Save that stream to
        // app data, then pass it to the existing frontend path handling flow.
        if payload.paths.is_empty() && payload.web_images.is_empty() {
            payload.paths.extend(read_virtual_file_paths(data, app));
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
        get_medium(data, cf_format, lindex, TYMED_HGLOBAL_VALUE)
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

    #[derive(Debug, Clone)]
    struct VirtualFileDescriptor {
        name: String,
        size: Option<usize>,
    }

    fn read_virtual_file_paths(data: *const IDataObject, app: &AppHandle) -> Vec<String> {
        let descriptors = read_file_group_descriptors(data);
        if descriptors.is_empty() {
            return Vec::new();
        }

        let out_dir = virtual_drop_dir(app);
        let mut paths = Vec::new();
        for (idx, descriptor) in descriptors.iter().enumerate() {
            let Some(bytes) = read_file_contents(data, idx as i32, descriptor.size) else {
                continue;
            };
            if bytes.is_empty() || bytes.len() > MAX_VIRTUAL_FILE_BYTES {
                continue;
            }

            let safe_name = virtual_file_name(&descriptor.name, &bytes, idx);
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let out_path = unique_path(out_dir.join(format!("{}_{}", stamp, safe_name)));
            if fs::write(&out_path, &bytes).is_ok() {
                paths.push(out_path.to_string_lossy().to_string());
            }
        }

        dedupe(paths)
    }

    fn virtual_drop_dir(app: &AppHandle) -> PathBuf {
        let base = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("inspiration-drawer"));
        let dir = base.join("web_drops");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn read_file_group_descriptors(data: *const IDataObject) -> Vec<VirtualFileDescriptor> {
        let mut out = Vec::new();

        if let Some(format) = register_clipboard_format("FileGroupDescriptorW") {
            if let Some(mut medium) = get_hglobal_medium(data, format, -1) {
                let descriptors = unsafe { hglobal_to_bytes(medium_hglobal(&mut medium)) }
                    .map(|bytes| parse_file_group_descriptor_w(&bytes))
                    .unwrap_or_default();
                unsafe { ReleaseStgMedium(&mut medium) };
                out.extend(descriptors);
            }
        }

        if out.is_empty() {
            if let Some(format) = register_clipboard_format("FileGroupDescriptor") {
                if let Some(mut medium) = get_hglobal_medium(data, format, -1) {
                    let descriptors = unsafe { hglobal_to_bytes(medium_hglobal(&mut medium)) }
                        .map(|bytes| parse_file_group_descriptor_a(&bytes))
                        .unwrap_or_default();
                    unsafe { ReleaseStgMedium(&mut medium) };
                    out.extend(descriptors);
                }
            }
        }

        out
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
        let safe_count = count.min(64);
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
            let size = read_descriptor_size(descriptor);
            out.push(VirtualFileDescriptor {
                name: if name.trim().is_empty() {
                    format!("web_image_{}", idx + 1)
                } else {
                    name
                },
                size,
            });
        }

        out
    }

    fn read_descriptor_size(descriptor: &[u8]) -> Option<usize> {
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
        let size = ((high << 32) | low) as usize;
        if size == 0 || size > MAX_VIRTUAL_FILE_BYTES {
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

    fn read_file_contents(
        data: *const IDataObject,
        lindex: i32,
        expected_size: Option<usize>,
    ) -> Option<Vec<u8>> {
        let format = register_clipboard_format("FileContents")?;
        let mut medium = get_medium(
            data,
            format,
            lindex,
            TYMED_HGLOBAL_VALUE | TYMED_ISTREAM_VALUE,
        )?;
        let bytes = unsafe {
            if medium.tymed == TYMED_HGLOBAL_VALUE {
                hglobal_to_bytes(medium_hglobal(&mut medium))
            } else if medium.tymed == TYMED_ISTREAM_VALUE {
                let stream = medium_istream(&mut medium);
                istream_to_bytes(stream, expected_size)
            } else {
                None
            }
        };
        unsafe { ReleaseStgMedium(&mut medium) };
        bytes
    }

    unsafe fn medium_istream(medium: &mut STGMEDIUM) -> *mut IStream {
        *(*medium.u).pstm()
    }

    unsafe fn istream_to_bytes(
        stream: *mut IStream,
        expected_size: Option<usize>,
    ) -> Option<Vec<u8>> {
        if stream.is_null() {
            return None;
        }

        let mut out = Vec::new();
        let mut remaining = expected_size
            .unwrap_or(MAX_VIRTUAL_FILE_BYTES)
            .min(MAX_VIRTUAL_FILE_BYTES);
        let mut buffer = vec![0u8; 64 * 1024];

        while remaining > 0 {
            let want = buffer.len().min(remaining);
            let mut read: ULONG = 0;
            let hr = ((*(*stream).lpVtbl).parent.Read)(
                stream as *mut ISequentialStream,
                buffer.as_mut_ptr() as *mut c_void,
                want as ULONG,
                &mut read,
            );
            if hr < 0 || read == 0 {
                break;
            }
            let read_usize = read as usize;
            out.extend_from_slice(&buffer[..read_usize]);
            remaining = remaining.saturating_sub(read_usize);
            if expected_size.is_some() && out.len() >= expected_size.unwrap_or(0) {
                break;
            }
        }

        if out.is_empty() {
            None
        } else {
            Some(out)
        }
    }

    fn virtual_file_name(raw_name: &str, bytes: &[u8], idx: usize) -> String {
        let mut name = sanitize_virtual_file_name(raw_name);
        if name.is_empty() {
            name = format!("web_image_{}", idx + 1);
        }
        if !has_extension(&name) {
            name.push('.');
            name.push_str(infer_extension(bytes));
        }
        name
    }

    fn sanitize_virtual_file_name(name: &str) -> String {
        let cleaned: String = name
            .chars()
            .map(|c| match c {
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
                c if c.is_control() => '_',
                c => c,
            })
            .collect();
        cleaned.trim().trim_matches('.').chars().take(120).collect()
    }

    fn has_extension(name: &str) -> bool {
        PathBuf::from(name)
            .extension()
            .and_then(|e| e.to_str())
            .is_some()
    }

    fn infer_extension(bytes: &[u8]) -> &'static str {
        if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
            "png"
        } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            "jpg"
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            "gif"
        } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            "webp"
        } else if bytes.starts_with(b"BM") {
            "bmp"
        } else if bytes.starts_with(b"%PDF") {
            "pdf"
        } else {
            "bin"
        }
    }

    fn unique_path(path: PathBuf) -> PathBuf {
        if !path.exists() {
            return path;
        }
        let parent = path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(std::env::temp_dir);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("web_drop")
            .to_string();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_string());
        for i in 1..1000 {
            let file_name = match &ext {
                Some(ext) if !ext.is_empty() => format!("{}_{}.{}", stem, i, ext),
                _ => format!("{}_{}", stem, i),
            };
            let candidate = parent.join(file_name);
            if !candidate.exists() {
                return candidate;
            }
        }
        path
    }

    unsafe fn hglobal_to_utf16_string(hglobal: HGLOBAL) -> Option<String> {
        let ptr = GlobalLock(hglobal);
        if ptr.is_null() {
            return None;
        }

        let size_bytes = GlobalSize(hglobal);
        if size_bytes == 0 {
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
        if size == 0 {
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
        let lower_text = text.to_lowercase();

        for attr in ["src=", "data-src=", "href="] {
            let mut search_from = 0usize;
            while let Some(rel_idx) = lower_text[search_from..].find(attr) {
                let idx = search_from + rel_idx + attr.len();
                let trimmed = text[idx..].trim_start();
                if let Some(first) = trimmed.chars().next() {
                    if first == '"' || first == '\'' {
                        if let Some(end) = trimmed[1..].find(first) {
                            out.push(trimmed[1..(1 + end)].to_string());
                            search_from = idx + 1 + end;
                            continue;
                        }
                    }
                }
                search_from = idx;
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
        let lower = url.trim().to_lowercase();
        lower.starts_with("data:image/")
            || lower.ends_with(".png")
            || lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".gif")
            || lower.ends_with(".webp")
            || lower.ends_with(".bmp")
            || lower.ends_with(".svg")
            || lower.contains(".png?")
            || lower.contains(".jpg?")
            || lower.contains(".jpeg?")
            || lower.contains(".gif?")
            || lower.contains(".webp?")
            || lower.contains(".bmp?")
            || lower.contains(".svg?")
            || lower.contains("format=jpg")
            || lower.contains("format=jpeg")
            || lower.contains("format=png")
            || lower.contains("image")
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
pub use win::{init_native_drop, refresh_edge_native_drop};

#[cfg(not(target_os = "windows"))]
pub fn init_native_drop(_app: &tauri::App) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn refresh_edge_native_drop(_app_handle: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}
