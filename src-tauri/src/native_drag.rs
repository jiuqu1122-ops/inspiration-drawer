// Windows-only OLE drag source and CF_HDROP clipboard helpers.

#[cfg(target_os = "windows")]
mod win {
    use std::mem;
    use std::os::windows::ffi::OsStrExt;
    use std::path::PathBuf;
    use std::ptr::{copy_nonoverlapping, null_mut};
    use std::sync::atomic::{AtomicU32, Ordering};

    use winapi::ctypes::c_void;
    use winapi::shared::guiddef::{GUID, REFIID};
    use winapi::shared::minwindef::{BOOL, DWORD, FALSE, HGLOBAL, TRUE, UINT, ULONG};
    use winapi::shared::ntdef::HRESULT;
    use winapi::shared::windef::POINT;
    use winapi::shared::winerror::{
        DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS, DV_E_FORMATETC,
        E_NOINTERFACE, E_NOTIMPL, E_POINTER, OLE_E_ADVISENOTSUPPORTED, S_FALSE, S_OK,
    };
    use winapi::um::objidl::{
        DATADIR_GET, FORMATETC, IDataObject, IDataObjectVtbl, IEnumFORMATETC, IEnumFORMATETCVtbl,
        STGMEDIUM,
    };
    use winapi::um::oleidl::DROPEFFECT_COPY;
    use winapi::um::unknwnbase::{IUnknown, IUnknownVtbl};
    use winapi::um::winbase::{
        GlobalAlloc, GlobalFree, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT,
    };
    use winapi::um::winuser::{
        CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
        CF_HDROP, MK_LBUTTON,
    };

    use crate::local_path_from_url_like;

    const DVASPECT_CONTENT_VALUE: DWORD = 1;
    const TYMED_HGLOBAL_VALUE: DWORD = 1;

    #[repr(C)]
    struct DropFiles {
        p_files: DWORD,
        pt: POINT,
        f_nc: BOOL,
        f_wide: BOOL,
    }

    #[repr(C)]
    struct IDropSourceLocal {
        lp_vtbl: *const IDropSourceLocalVtbl,
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct IDropSourceLocalVtbl {
        parent: IUnknownVtbl,
        QueryContinueDrag: unsafe extern "system" fn(*mut IDropSourceLocal, BOOL, DWORD) -> HRESULT,
        GiveFeedback: unsafe extern "system" fn(*mut IDropSourceLocal, DWORD) -> HRESULT,
    }

    #[repr(C)]
    struct FileDataObject {
        lp_vtbl: *const IDataObjectVtbl,
        ref_count: AtomicU32,
        paths: Vec<PathBuf>,
    }

    #[repr(C)]
    struct FormatEtcEnumerator {
        lp_vtbl: *const IEnumFORMATETCVtbl,
        ref_count: AtomicU32,
        index: usize,
        formats: Vec<FORMATETC>,
    }

    #[repr(C)]
    struct FileDropSource {
        lp_vtbl: *const IDropSourceLocalVtbl,
        ref_count: AtomicU32,
    }

    #[link(name = "ole32")]
    extern "system" {
        fn OleInitialize(pv_reserved: *mut c_void) -> HRESULT;
        fn OleUninitialize();
        fn DoDragDrop(
            data_object: *mut IDataObject,
            drop_source: *mut IDropSourceLocal,
            ok_effects: DWORD,
            effect: *mut DWORD,
        ) -> HRESULT;
    }

    #[link(name = "shell32")]
    extern "system" {
        fn ILCreateFromPathW(path: *const u16) -> *mut c_void;
        fn ILFree(pidl: *mut c_void);
        fn ILGetSize(pidl: *const c_void) -> u32;
        fn SHCreateDataObject(
            pidl_folder: *const c_void,
            cidl: UINT,
            apidl: *const *const c_void,
            data_object_inner: *mut IDataObject,
            riid: REFIID,
            ppv: *mut *mut c_void,
        ) -> HRESULT;
    }

    const IID_IUNKNOWN_LOCAL: GUID = GUID {
        Data1: 0x00000000,
        Data2: 0x0000,
        Data3: 0x0000,
        Data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };

    const IID_IDATAOBJECT_LOCAL: GUID = GUID {
        Data1: 0x0000010e,
        Data2: 0x0000,
        Data3: 0x0000,
        Data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };

    const IID_IDROPSOURCE_LOCAL: GUID = GUID {
        Data1: 0x00000121,
        Data2: 0x0000,
        Data3: 0x0000,
        Data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };

    const IID_IENUMFORMATETC_LOCAL: GUID = GUID {
        Data1: 0x00000103,
        Data2: 0x0000,
        Data3: 0x0000,
        Data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };

    static DATA_OBJECT_VTBL: IDataObjectVtbl = IDataObjectVtbl {
        parent: IUnknownVtbl {
            QueryInterface: data_object_query_interface,
            AddRef: data_object_add_ref,
            Release: data_object_release,
        },
        GetData: data_object_get_data,
        GetDataHere: data_object_get_data_here,
        QueryGetData: data_object_query_get_data,
        GetCanonicalFormatEtc: data_object_get_canonical_format_etc,
        SetData: data_object_set_data,
        EnumFormatEtc: data_object_enum_format_etc,
        DAdvise: data_object_d_advise,
        DUnadvise: data_object_d_unadvise,
        EnumDAdvise: data_object_enum_d_advise,
    };

    static FORMAT_ETC_ENUMERATOR_VTBL: IEnumFORMATETCVtbl = IEnumFORMATETCVtbl {
        parent: IUnknownVtbl {
            QueryInterface: format_etc_enumerator_query_interface,
            AddRef: format_etc_enumerator_add_ref,
            Release: format_etc_enumerator_release,
        },
        Next: format_etc_enumerator_next,
        Skip: format_etc_enumerator_skip,
        Reset: format_etc_enumerator_reset,
        Clone: format_etc_enumerator_clone,
    };

    static DROP_SOURCE_VTBL: IDropSourceLocalVtbl = IDropSourceLocalVtbl {
        parent: IUnknownVtbl {
            QueryInterface: drop_source_query_interface,
            AddRef: drop_source_add_ref,
            Release: drop_source_release,
        },
        QueryContinueDrag: drop_source_query_continue_drag,
        GiveFeedback: drop_source_give_feedback,
    };

    fn guid_eq(a: &GUID, b: &GUID) -> bool {
        a.Data1 == b.Data1 && a.Data2 == b.Data2 && a.Data3 == b.Data3 && a.Data4 == b.Data4
    }

    fn normalize_paths(paths: Vec<String>) -> Result<Vec<PathBuf>, String> {
        let mut out = Vec::new();
        for raw in paths {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                continue;
            }
            let path = local_path_from_url_like(trimmed).unwrap_or_else(|| PathBuf::from(trimmed));
            if path.exists() {
                out.push(strip_windows_verbatim_path(path.canonicalize().unwrap_or(path)));
            }
        }
        if out.is_empty() {
            Err("no existing files to drag or copy".to_string())
        } else {
            Ok(out)
        }
    }

    fn strip_windows_verbatim_path(path: PathBuf) -> PathBuf {
        let value = path.to_string_lossy();
        if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
            PathBuf::from(format!(r"\\{}", rest))
        } else if let Some(rest) = value.strip_prefix(r"\\?\") {
            PathBuf::from(rest)
        } else {
            path
        }
    }

    fn make_hdrop(paths: &[PathBuf]) -> Result<HGLOBAL, String> {
        let mut wide_paths = Vec::<u16>::new();
        for path in paths {
            wide_paths.extend(path.as_os_str().encode_wide());
            wide_paths.push(0);
        }
        wide_paths.push(0);

        let header_size = mem::size_of::<DropFiles>();
        let wide_bytes = wide_paths.len() * mem::size_of::<u16>();
        let total_size = header_size + wide_bytes;

        unsafe {
            let hglobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_size);
            if hglobal.is_null() {
                return Err("GlobalAlloc failed".to_string());
            }

            let ptr = GlobalLock(hglobal) as *mut u8;
            if ptr.is_null() {
                GlobalFree(hglobal);
                return Err("GlobalLock failed".to_string());
            }

            let header = DropFiles {
                p_files: header_size as DWORD,
                pt: POINT { x: 0, y: 0 },
                f_nc: FALSE,
                f_wide: TRUE,
            };
            (ptr as *mut DropFiles).write(header);
            copy_nonoverlapping(wide_paths.as_ptr() as *const u8, ptr.add(header_size), wide_bytes);
            GlobalUnlock(hglobal);
            Ok(hglobal)
        }
    }

    fn make_hglobal_dword(value: DWORD) -> Result<HGLOBAL, String> {
        unsafe {
            let hglobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, mem::size_of::<DWORD>());
            if hglobal.is_null() {
                return Err("GlobalAlloc failed".to_string());
            }
            let ptr = GlobalLock(hglobal) as *mut DWORD;
            if ptr.is_null() {
                GlobalFree(hglobal);
                return Err("GlobalLock failed".to_string());
            }
            ptr.write(value);
            GlobalUnlock(hglobal);
            Ok(hglobal)
        }
    }

    fn make_hglobal_bytes(bytes: &[u8]) -> Result<HGLOBAL, String> {
        unsafe {
            let hglobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes.len());
            if hglobal.is_null() {
                return Err("GlobalAlloc failed".to_string());
            }
            let ptr = GlobalLock(hglobal) as *mut u8;
            if ptr.is_null() {
                GlobalFree(hglobal);
                return Err("GlobalLock failed".to_string());
            }
            copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
            GlobalUnlock(hglobal);
            Ok(hglobal)
        }
    }

    fn make_hglobal_wide_string(value: &PathBuf) -> Result<HGLOBAL, String> {
        let mut wide: Vec<u16> = value.as_os_str().encode_wide().collect();
        wide.push(0);
        let bytes = unsafe {
            std::slice::from_raw_parts(
                wide.as_ptr() as *const u8,
                wide.len() * mem::size_of::<u16>(),
            )
        };
        make_hglobal_bytes(bytes)
    }

    fn make_hglobal_ansi_string(value: &PathBuf) -> Result<HGLOBAL, String> {
        let mut bytes = value.to_string_lossy().as_bytes().to_vec();
        bytes.push(0);
        make_hglobal_bytes(&bytes)
    }

    fn make_shell_id_list(paths: &[PathBuf]) -> Result<HGLOBAL, String> {
        struct PidlGuard(*mut c_void);
        impl Drop for PidlGuard {
            fn drop(&mut self) {
                if !self.0.is_null() {
                    unsafe { ILFree(self.0) };
                }
            }
        }

        let mut pidls: Vec<(PidlGuard, usize)> = Vec::new();
        for path in paths {
            let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
            wide.push(0);
            unsafe {
                let pidl = ILCreateFromPathW(wide.as_ptr());
                if pidl.is_null() {
                    continue;
                }
                let size = ILGetSize(pidl as *const c_void) as usize;
                if size > 0 {
                    pidls.push((PidlGuard(pidl), size));
                }
            }
        }

        if pidls.is_empty() {
            return Err("no shell pidls to drag".to_string());
        }

        // CIDA layout for CFSTR_SHELLIDLIST: count, offsets, then one parent PIDL
        // followed by item PIDLs. An empty parent PIDL means children are absolute.
        let count = pidls.len();
        let header_size = mem::size_of::<u32>() * (count + 2);
        let empty_parent_pidl_size = 2usize;
        let total_size = header_size + empty_parent_pidl_size + pidls.iter().map(|(_, size)| *size).sum::<usize>();
        let mut bytes = vec![0u8; total_size];
        bytes[0..4].copy_from_slice(&(count as u32).to_le_bytes());

        let mut offset = header_size;
        bytes[4..8].copy_from_slice(&(offset as u32).to_le_bytes());
        offset += empty_parent_pidl_size;

        for (index, (_, size)) in pidls.iter().enumerate() {
            let offset_index = 8 + index * 4;
            bytes[offset_index..offset_index + 4].copy_from_slice(&(offset as u32).to_le_bytes());
            offset += *size;
        }

        let mut cursor = header_size + empty_parent_pidl_size;
        for (pidl, size) in pidls {
            unsafe {
                copy_nonoverlapping(pidl.0 as *const u8, bytes.as_mut_ptr().add(cursor), size);
            }
            cursor += size;
        }

        make_hglobal_bytes(&bytes)
    }

    fn clipboard_format(name: &str) -> Option<u32> {
        let mut wide: Vec<u16> = name.encode_utf16().collect();
        wide.push(0);
        let format = unsafe { RegisterClipboardFormatW(wide.as_ptr()) };
        if format == 0 {
            None
        } else {
            Some(format)
        }
    }

    fn pidl_from_path(path: &PathBuf) -> Option<*mut c_void> {
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide.push(0);
        let pidl = unsafe { ILCreateFromPathW(wide.as_ptr()) };
        if pidl.is_null() {
            None
        } else {
            Some(pidl)
        }
    }

    unsafe fn last_item_pidl(pidl: *const c_void) -> *const c_void {
        if pidl.is_null() {
            return null_mut();
        }
        let mut current = pidl as *const u8;
        let mut last = current;
        loop {
            let cb = u16::from_le_bytes([*current, *current.add(1)]) as usize;
            if cb == 0 {
                return last as *const c_void;
            }
            last = current;
            current = current.add(cb);
        }
    }

    fn create_shell_data_object_from_parent(paths: &[PathBuf]) -> Option<*mut IDataObject> {
        let parent = paths.first()?.parent()?.to_path_buf();
        if !paths.iter().all(|path| path.parent().map(|value| value == parent).unwrap_or(false)) {
            return None;
        }

        let parent_pidl = pidl_from_path(&parent)?;
        let mut owned_item_pidls = Vec::<*mut c_void>::new();
        let mut child_pidls = Vec::<*const c_void>::new();

        for path in paths {
            let Some(pidl) = pidl_from_path(path) else {
                continue;
            };
            let child = unsafe { last_item_pidl(pidl as *const c_void) };
            if child.is_null() {
                unsafe { ILFree(pidl) };
                continue;
            }
            owned_item_pidls.push(pidl);
            child_pidls.push(child);
        }

        if child_pidls.is_empty() {
            unsafe { ILFree(parent_pidl) };
            return None;
        }

        let mut out: *mut c_void = null_mut();
        let hr = unsafe {
            SHCreateDataObject(
                parent_pidl as *const c_void,
                child_pidls.len() as UINT,
                child_pidls.as_ptr(),
                null_mut(),
                &IID_IDATAOBJECT_LOCAL,
                &mut out,
            )
        };

        unsafe { ILFree(parent_pidl) };
        for pidl in owned_item_pidls {
            unsafe { ILFree(pidl) };
        }

        if hr >= 0 && !out.is_null() {
            Some(out as *mut IDataObject)
        } else {
            None
        }
    }

    fn create_shell_data_object(paths: &[PathBuf]) -> Option<*mut IDataObject> {
        if let Some(data_object) = create_shell_data_object_from_parent(paths) {
            return Some(data_object);
        }

        let mut owned_pidls = Vec::<*mut c_void>::new();
        for path in paths {
            if let Some(pidl) = pidl_from_path(path) {
                owned_pidls.push(pidl);
            }
        }
        if owned_pidls.is_empty() {
            return None;
        }

        let pidls = owned_pidls
            .iter()
            .map(|pidl| *pidl as *const c_void)
            .collect::<Vec<_>>();
        let mut out: *mut c_void = null_mut();
        let hr = unsafe {
            SHCreateDataObject(
                null_mut(),
                pidls.len() as UINT,
                pidls.as_ptr(),
                null_mut(),
                &IID_IDATAOBJECT_LOCAL,
                &mut out,
            )
        };

        for pidl in owned_pidls {
            unsafe { ILFree(pidl) };
        }

        if hr >= 0 && !out.is_null() {
            Some(out as *mut IDataObject)
        } else {
            None
        }
    }

    unsafe extern "system" fn data_object_query_interface(
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
        if guid_eq(&*riid, &IID_IUNKNOWN_LOCAL) || guid_eq(&*riid, &IID_IDATAOBJECT_LOCAL) {
            *ppv = this as *mut c_void;
            data_object_add_ref(this);
            S_OK
        } else {
            E_NOINTERFACE
        }
    }

    unsafe extern "system" fn data_object_add_ref(this: *mut IUnknown) -> ULONG {
        if this.is_null() {
            return 0;
        }
        let object = this as *mut FileDataObject;
        (*object).ref_count.fetch_add(1, Ordering::Relaxed) + 1
    }

    unsafe extern "system" fn data_object_release(this: *mut IUnknown) -> ULONG {
        if this.is_null() {
            return 0;
        }
        let object = this as *mut FileDataObject;
        let prev = (*object).ref_count.fetch_sub(1, Ordering::Release);
        let next = prev.saturating_sub(1);
        if next == 0 {
            std::sync::atomic::fence(Ordering::Acquire);
            drop(Box::from_raw(object));
        }
        next
    }

    fn format_matches(format: *const FORMATETC, cf_format: u16) -> bool {
        if format.is_null() {
            return false;
        }
        unsafe {
            (*format).cfFormat == cf_format
                && ((*format).tymed & TYMED_HGLOBAL_VALUE) != 0
                && (*format).dwAspect == DVASPECT_CONTENT_VALUE
        }
    }

    fn supports_hdrop(format: *const FORMATETC) -> bool {
        format_matches(format, CF_HDROP as u16)
    }

    fn supports_preferred_drop_effect(format: *const FORMATETC) -> bool {
        clipboard_format("Preferred DropEffect")
            .map(|cf_format| format_matches(format, cf_format as u16))
            .unwrap_or(false)
    }

    fn supports_shell_id_list(format: *const FORMATETC) -> bool {
        clipboard_format("Shell IDList Array")
            .map(|cf_format| format_matches(format, cf_format as u16))
            .unwrap_or(false)
    }

    fn supports_file_name_w(format: *const FORMATETC) -> bool {
        clipboard_format("FileNameW")
            .map(|cf_format| format_matches(format, cf_format as u16))
            .unwrap_or(false)
    }

    fn supports_file_name_a(format: *const FORMATETC) -> bool {
        clipboard_format("FileName")
            .map(|cf_format| format_matches(format, cf_format as u16))
            .unwrap_or(false)
    }

    fn hdrop_format_etc() -> FORMATETC {
        FORMATETC {
            cfFormat: CF_HDROP as u16,
            ptd: null_mut(),
            dwAspect: DVASPECT_CONTENT_VALUE,
            lindex: -1,
            tymed: TYMED_HGLOBAL_VALUE,
        }
    }

    fn preferred_drop_effect_format_etc() -> Option<FORMATETC> {
        clipboard_format("Preferred DropEffect").map(|cf_format| FORMATETC {
            cfFormat: cf_format as u16,
            ptd: null_mut(),
            dwAspect: DVASPECT_CONTENT_VALUE,
            lindex: -1,
            tymed: TYMED_HGLOBAL_VALUE,
        })
    }

    fn shell_id_list_format_etc() -> Option<FORMATETC> {
        clipboard_format("Shell IDList Array").map(|cf_format| FORMATETC {
            cfFormat: cf_format as u16,
            ptd: null_mut(),
            dwAspect: DVASPECT_CONTENT_VALUE,
            lindex: -1,
            tymed: TYMED_HGLOBAL_VALUE,
        })
    }

    fn registered_hglobal_format_etc(name: &str) -> Option<FORMATETC> {
        clipboard_format(name).map(|cf_format| FORMATETC {
            cfFormat: cf_format as u16,
            ptd: null_mut(),
            dwAspect: DVASPECT_CONTENT_VALUE,
            lindex: -1,
            tymed: TYMED_HGLOBAL_VALUE,
        })
    }

    fn data_formats() -> Vec<FORMATETC> {
        let mut formats = vec![hdrop_format_etc()];
        if let Some(format) = shell_id_list_format_etc() {
            formats.push(format);
        }
        if let Some(format) = registered_hglobal_format_etc("FileNameW") {
            formats.push(format);
        }
        if let Some(format) = registered_hglobal_format_etc("FileName") {
            formats.push(format);
        }
        if let Some(format) = preferred_drop_effect_format_etc() {
            formats.push(format);
        }
        formats
    }

    fn make_format_etc_enumerator(index: usize) -> *mut IEnumFORMATETC {
        Box::into_raw(Box::new(FormatEtcEnumerator {
            lp_vtbl: &FORMAT_ETC_ENUMERATOR_VTBL,
            ref_count: AtomicU32::new(1),
            index,
            formats: data_formats(),
        })) as *mut IEnumFORMATETC
    }

    unsafe extern "system" fn data_object_get_data(
        this: *mut IDataObject,
        format: *const FORMATETC,
        medium: *mut STGMEDIUM,
    ) -> HRESULT {
        if medium.is_null() {
            return E_POINTER;
        }
        let object = this as *mut FileDataObject;
        if supports_hdrop(format) {
            match make_hdrop(&(*object).paths) {
                Ok(hglobal) => {
                    (*medium).tymed = TYMED_HGLOBAL_VALUE;
                    (*medium).u = hglobal as *mut _;
                    (*medium).pUnkForRelease = null_mut();
                    S_OK
                }
                Err(_) => DV_E_FORMATETC,
            }
        } else if supports_shell_id_list(format) {
            match make_shell_id_list(&(*object).paths) {
                Ok(hglobal) => {
                    (*medium).tymed = TYMED_HGLOBAL_VALUE;
                    (*medium).u = hglobal as *mut _;
                    (*medium).pUnkForRelease = null_mut();
                    S_OK
                }
                Err(_) => DV_E_FORMATETC,
            }
        } else if supports_file_name_w(format) {
            match (&(*object).paths).first().map(make_hglobal_wide_string) {
                Some(Ok(hglobal)) => {
                    (*medium).tymed = TYMED_HGLOBAL_VALUE;
                    (*medium).u = hglobal as *mut _;
                    (*medium).pUnkForRelease = null_mut();
                    S_OK
                }
                _ => DV_E_FORMATETC,
            }
        } else if supports_file_name_a(format) {
            match (&(*object).paths).first().map(make_hglobal_ansi_string) {
                Some(Ok(hglobal)) => {
                    (*medium).tymed = TYMED_HGLOBAL_VALUE;
                    (*medium).u = hglobal as *mut _;
                    (*medium).pUnkForRelease = null_mut();
                    S_OK
                }
                _ => DV_E_FORMATETC,
            }
        } else if supports_preferred_drop_effect(format) {
            match make_hglobal_dword(DROPEFFECT_COPY) {
                Ok(hglobal) => {
                    (*medium).tymed = TYMED_HGLOBAL_VALUE;
                    (*medium).u = hglobal as *mut _;
                    (*medium).pUnkForRelease = null_mut();
                    S_OK
                }
                Err(_) => DV_E_FORMATETC,
            }
        } else {
            DV_E_FORMATETC
        }
    }

    unsafe extern "system" fn data_object_get_data_here(
        _this: *mut IDataObject,
        _format: *const FORMATETC,
        _medium: *mut STGMEDIUM,
    ) -> HRESULT {
        E_NOTIMPL
    }

    unsafe extern "system" fn data_object_query_get_data(
        _this: *mut IDataObject,
        format: *const FORMATETC,
    ) -> HRESULT {
        if supports_hdrop(format)
            || supports_shell_id_list(format)
            || supports_file_name_w(format)
            || supports_file_name_a(format)
            || supports_preferred_drop_effect(format)
        {
            S_OK
        } else {
            DV_E_FORMATETC
        }
    }

    unsafe extern "system" fn data_object_get_canonical_format_etc(
        _this: *mut IDataObject,
        _format_in: *const FORMATETC,
        format_out: *mut FORMATETC,
    ) -> HRESULT {
        if !format_out.is_null() {
            (*format_out).ptd = null_mut();
        }
        E_NOTIMPL
    }

    unsafe extern "system" fn data_object_set_data(
        _this: *mut IDataObject,
        _format: *const FORMATETC,
        _medium: *const FORMATETC,
        _release: BOOL,
    ) -> HRESULT {
        E_NOTIMPL
    }

    unsafe extern "system" fn data_object_enum_format_etc(
        _this: *mut IDataObject,
        direction: DWORD,
        enum_format: *mut *mut IEnumFORMATETC,
    ) -> HRESULT {
        if enum_format.is_null() {
            return E_POINTER;
        }
        *enum_format = null_mut();
        if direction != DATADIR_GET as DWORD {
            return E_NOTIMPL;
        }
        *enum_format = make_format_etc_enumerator(0);
        S_OK
    }

    unsafe extern "system" fn data_object_d_advise(
        _this: *mut IDataObject,
        _format: *const FORMATETC,
        _advf: DWORD,
        _sink: *const winapi::um::objidl::IAdviseSink,
        _connection: *mut DWORD,
    ) -> HRESULT {
        OLE_E_ADVISENOTSUPPORTED
    }

    unsafe extern "system" fn data_object_d_unadvise(
        _this: *mut IDataObject,
        _connection: DWORD,
    ) -> HRESULT {
        OLE_E_ADVISENOTSUPPORTED
    }

    unsafe extern "system" fn data_object_enum_d_advise(
        _this: *mut IDataObject,
        _enum_advise: *const *const winapi::um::objidl::IEnumSTATDATA,
    ) -> HRESULT {
        OLE_E_ADVISENOTSUPPORTED
    }

    unsafe extern "system" fn format_etc_enumerator_query_interface(
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
        if guid_eq(&*riid, &IID_IUNKNOWN_LOCAL) || guid_eq(&*riid, &IID_IENUMFORMATETC_LOCAL) {
            *ppv = this as *mut c_void;
            format_etc_enumerator_add_ref(this);
            S_OK
        } else {
            E_NOINTERFACE
        }
    }

    unsafe extern "system" fn format_etc_enumerator_add_ref(this: *mut IUnknown) -> ULONG {
        if this.is_null() {
            return 0;
        }
        let enumerator = this as *mut FormatEtcEnumerator;
        (*enumerator).ref_count.fetch_add(1, Ordering::Relaxed) + 1
    }

    unsafe extern "system" fn format_etc_enumerator_release(this: *mut IUnknown) -> ULONG {
        if this.is_null() {
            return 0;
        }
        let enumerator = this as *mut FormatEtcEnumerator;
        let prev = (*enumerator).ref_count.fetch_sub(1, Ordering::Release);
        let next = prev.saturating_sub(1);
        if next == 0 {
            std::sync::atomic::fence(Ordering::Acquire);
            drop(Box::from_raw(enumerator));
        }
        next
    }

    unsafe extern "system" fn format_etc_enumerator_next(
        this: *mut IEnumFORMATETC,
        celt: ULONG,
        rgelt: *mut FORMATETC,
        pcelt_fetched: *mut ULONG,
    ) -> HRESULT {
        if this.is_null() || rgelt.is_null() {
            return E_POINTER;
        }
        if celt != 1 && pcelt_fetched.is_null() {
            return E_POINTER;
        }

        let enumerator = this as *mut FormatEtcEnumerator;
        let mut fetched: ULONG = 0;
        while fetched < celt && (*enumerator).index < (*enumerator).formats.len() {
            *rgelt.add(fetched as usize) = (&(*enumerator).formats)[(*enumerator).index];
            (*enumerator).index += 1;
            fetched += 1;
        }

        if !pcelt_fetched.is_null() {
            *pcelt_fetched = fetched;
        }
        if fetched == celt {
            S_OK
        } else {
            S_FALSE
        }
    }

    unsafe extern "system" fn format_etc_enumerator_skip(
        this: *mut IEnumFORMATETC,
        celt: ULONG,
    ) -> HRESULT {
        if this.is_null() {
            return E_POINTER;
        }
        let enumerator = this as *mut FormatEtcEnumerator;
        let remaining = (*enumerator).formats.len().saturating_sub((*enumerator).index);
        let skipped = remaining.min(celt as usize);
        (*enumerator).index += skipped;
        if skipped == celt as usize {
            S_OK
        } else {
            S_FALSE
        }
    }

    unsafe extern "system" fn format_etc_enumerator_reset(this: *mut IEnumFORMATETC) -> HRESULT {
        if this.is_null() {
            return E_POINTER;
        }
        (*(this as *mut FormatEtcEnumerator)).index = 0;
        S_OK
    }

    unsafe extern "system" fn format_etc_enumerator_clone(
        this: *mut IEnumFORMATETC,
        enum_format: *mut *mut IEnumFORMATETC,
    ) -> HRESULT {
        if this.is_null() || enum_format.is_null() {
            return E_POINTER;
        }
        let enumerator = this as *mut FormatEtcEnumerator;
        *enum_format = make_format_etc_enumerator((*enumerator).index);
        S_OK
    }

    unsafe extern "system" fn drop_source_query_interface(
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
        if guid_eq(&*riid, &IID_IUNKNOWN_LOCAL) || guid_eq(&*riid, &IID_IDROPSOURCE_LOCAL) {
            *ppv = this as *mut c_void;
            drop_source_add_ref(this);
            S_OK
        } else {
            E_NOINTERFACE
        }
    }

    unsafe extern "system" fn drop_source_add_ref(this: *mut IUnknown) -> ULONG {
        if this.is_null() {
            return 0;
        }
        let source = this as *mut FileDropSource;
        (*source).ref_count.fetch_add(1, Ordering::Relaxed) + 1
    }

    unsafe extern "system" fn drop_source_release(this: *mut IUnknown) -> ULONG {
        if this.is_null() {
            return 0;
        }
        let source = this as *mut FileDropSource;
        let prev = (*source).ref_count.fetch_sub(1, Ordering::Release);
        let next = prev.saturating_sub(1);
        if next == 0 {
            std::sync::atomic::fence(Ordering::Acquire);
            drop(Box::from_raw(source));
        }
        next
    }

    unsafe extern "system" fn drop_source_query_continue_drag(
        _this: *mut IDropSourceLocal,
        escape_pressed: BOOL,
        key_state: DWORD,
    ) -> HRESULT {
        if escape_pressed == TRUE {
            DRAGDROP_S_CANCEL
        } else if (key_state & MK_LBUTTON as DWORD) == 0 {
            DRAGDROP_S_DROP
        } else {
            S_OK
        }
    }

    unsafe extern "system" fn drop_source_give_feedback(
        _this: *mut IDropSourceLocal,
        _effect: DWORD,
    ) -> HRESULT {
        DRAGDROP_S_USEDEFAULTCURSORS
    }

    pub fn start_file_drag(paths: Vec<String>) -> Result<(), String> {
        let paths = normalize_paths(paths)?;
        unsafe {
            let init_hr = OleInitialize(null_mut());
            if init_hr < 0 {
                return Err(format!("OleInitialize failed: 0x{:08x}", init_hr as u32));
            }

            let data_object = create_shell_data_object(&paths).unwrap_or_else(|| {
                Box::into_raw(Box::new(FileDataObject {
                    lp_vtbl: &DATA_OBJECT_VTBL,
                    ref_count: AtomicU32::new(1),
                    paths,
                })) as *mut IDataObject
            });
            let drop_source = Box::into_raw(Box::new(FileDropSource {
                lp_vtbl: &DROP_SOURCE_VTBL,
                ref_count: AtomicU32::new(1),
            })) as *mut IDropSourceLocal;

            let mut effect: DWORD = 0;
            let hr = DoDragDrop(data_object, drop_source, DROPEFFECT_COPY, &mut effect);

            ((*(*(data_object as *mut IUnknown)).lpVtbl).Release)(data_object as *mut IUnknown);
            ((*(*(drop_source as *mut IUnknown)).lpVtbl).Release)(drop_source as *mut IUnknown);
            OleUninitialize();

            if hr >= 0 || hr == DRAGDROP_S_DROP || hr == DRAGDROP_S_CANCEL {
                Ok(())
            } else {
                Err(format!("DoDragDrop failed: 0x{:08x}", hr as u32))
            }
        }
    }

    pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
        let paths = normalize_paths(paths)?;
        let hdrop = make_hdrop(&paths)?;
        unsafe {
            if OpenClipboard(null_mut()) == FALSE {
                GlobalFree(hdrop);
                return Err("OpenClipboard failed".to_string());
            }

            if EmptyClipboard() == FALSE {
                CloseClipboard();
                GlobalFree(hdrop);
                return Err("EmptyClipboard failed".to_string());
            }

            if SetClipboardData(CF_HDROP, hdrop as *mut _).is_null() {
                CloseClipboard();
                GlobalFree(hdrop);
                Err("SetClipboardData failed".to_string())
            } else {
                if let (Some(format), Ok(effect)) = (
                    clipboard_format("Preferred DropEffect"),
                    make_hglobal_dword(DROPEFFECT_COPY),
                ) {
                    if SetClipboardData(format, effect as *mut _).is_null() {
                        GlobalFree(effect);
                    }
                }
                CloseClipboard();
                Ok(())
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub use win::{copy_files_to_clipboard, start_file_drag};

#[cfg(not(target_os = "windows"))]
pub fn start_file_drag(_paths: Vec<String>) -> Result<(), String> {
    Err("file drag is currently supported on Windows only".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn copy_files_to_clipboard(_paths: Vec<String>) -> Result<(), String> {
    Err("file clipboard is currently supported on Windows only".to_string())
}
