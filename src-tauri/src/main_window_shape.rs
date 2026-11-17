//! The canvas WebView keeps an opaque compositor backplate to prevent desktop
//! bleed-through. CSS clipping cannot clip that native backplate: clip only the
//! main HWND to the same 16 logical px outline as DrawerShell, not its contents.

pub const MAIN_WINDOW_CORNER_RADIUS_LOGICAL: f64 = 16.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct RoundedWindowGeometry {
    width: i32,
    height: i32,
    diameter: i32,
}

fn rounded_window_geometry(width: u32, height: u32, scale: f64) -> Option<RoundedWindowGeometry> {
    // Minimized windows can report zero; never replace the last valid region
    // with an empty shape or use unchecked dimensions in the GDI API.
    if width == 0 || height == 0 || !scale.is_finite() || scale <= 0.0 {
        return None;
    }
    let width = i32::try_from(width).ok()?;
    let height = i32::try_from(height).ok()?;
    let diameter = (MAIN_WINDOW_CORNER_RADIUS_LOGICAL * 2.0 * scale)
        .round()
        .clamp(1.0, f64::from(width.min(height))) as i32;
    Some(RoundedWindowGeometry {
        width,
        height,
        diameter,
    })
}

#[cfg(target_os = "windows")]
mod windows {
    use super::{rounded_window_geometry, RoundedWindowGeometry};
    use std::sync::{Arc, Mutex};
    use winapi::shared::windef::{HWND, RECT};
    use winapi::um::wingdi::{CreateRoundRectRgn, DeleteObject};
    use winapi::um::winuser::{GetDpiForWindow, GetWindowRect, SetWindowRgn};

    fn apply(hwnd: HWND, geometry: RoundedWindowGeometry) -> Result<(), String> {
        unsafe {
            let region = CreateRoundRectRgn(
                0,
                0,
                geometry.width,
                geometry.height,
                geometry.diameter,
                geometry.diameter,
            );
            if region.is_null() {
                return Err(format!(
                    "创建窗口圆角区域失败: {}",
                    std::io::Error::last_os_error()
                ));
            }
            if SetWindowRgn(hwnd, region, 1) == 0 {
                // Windows owns the HRGN only after a successful SetWindowRgn.
                DeleteObject(region as _);
                return Err(format!(
                    "应用窗口圆角区域失败: {}",
                    std::io::Error::last_os_error()
                ));
            }
            // Do not delete region here: ownership transferred to Windows.
        }
        Ok(())
    }

    fn refresh(
        handle: usize,
        scale_override: Option<f64>,
        committed: &Mutex<Option<RoundedWindowGeometry>>,
    ) -> Result<(), String> {
        let hwnd = handle as HWND;
        let mut rect: RECT = unsafe { std::mem::zeroed() };
        if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
            return Err(format!(
                "读取窗口圆角尺寸失败: {}",
                std::io::Error::last_os_error()
            ));
        }
        let width = rect
            .right
            .checked_sub(rect.left)
            .and_then(|n| u32::try_from(n).ok())
            .unwrap_or(0);
        let height = rect
            .bottom
            .checked_sub(rect.top)
            .and_then(|n| u32::try_from(n).ok())
            .unwrap_or(0);
        let scale = scale_override.unwrap_or_else(|| {
            let dpi = unsafe { GetDpiForWindow(hwnd) };
            if dpi == 0 {
                1.0
            } else {
                f64::from(dpi) / 96.0
            }
        });
        let Some(geometry) = rounded_window_geometry(width, height, scale) else {
            return Ok(());
        };
        {
            let mut previous = committed.lock().map_err(|e| e.to_string())?;
            if *previous == Some(geometry) {
                return Ok(());
            }
            // SetWindowRgn can synchronously send window-position messages.
            // Publish and unlock first so a reentrant resize is both harmless
            // and unable to deadlock the native window event loop.
            *previous = Some(geometry);
        }
        if let Err(error) = apply(hwnd, geometry) {
            *committed.lock().map_err(|e| e.to_string())? = None;
            return Err(error);
        }
        Ok(())
    }

    pub(super) fn install(window: &tauri::WebviewWindow) -> Result<(), String> {
        if window.label() != "main" {
            return Ok(());
        }
        let handle = window.hwnd().map_err(|e| e.to_string())?.0 as usize;
        let committed = Arc::new(Mutex::new(None));
        let events = Arc::clone(&committed);
        // No timer, DOM traversal, per-wheel callbacks, or changes to WebView
        // transparency. This runs only on native bounds/DPI changes.
        window.on_window_event(move |event| {
            let scale = match event {
                tauri::WindowEvent::Resized(_) => None,
                tauri::WindowEvent::ScaleFactorChanged { scale_factor, .. } => Some(*scale_factor),
                _ => return,
            };
            if let Err(error) = refresh(handle, scale, &events) {
                eprintln!("main window corner update failed: {error}");
            }
        });
        refresh(handle, None, &committed)
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use winapi::um::wingdi::{CreateRectRgn, PtInRegion};
        use winapi::um::winuser::{
            CreateWindowExW, DestroyWindow, GetWindowRgn, SetWindowPos, SWP_NOACTIVATE, SWP_NOMOVE,
            SWP_NOZORDER, WS_POPUP,
        };

        // Real hidden HWND/GDI verification, not a visible app or user profile.
        #[test]
        fn actual_window_region_keeps_four_corners_cut_after_resize_and_dpi_change() {
            unsafe {
                let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
                let hwnd = CreateWindowExW(
                    0,
                    class.as_ptr(),
                    std::ptr::null(),
                    WS_POPUP,
                    0,
                    0,
                    960,
                    800,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                );
                assert!(!hwnd.is_null());
                let check = |width: i32, height: i32, scale: f64| {
                    assert_ne!(
                        SetWindowPos(
                            hwnd,
                            std::ptr::null_mut(),
                            0,
                            0,
                            width,
                            height,
                            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOZORDER
                        ),
                        0
                    );
                    apply(
                        hwnd,
                        rounded_window_geometry(width as u32, height as u32, scale).unwrap(),
                    )
                    .unwrap();
                    let region = CreateRectRgn(0, 0, 0, 0);
                    assert!(!region.is_null());
                    assert!(GetWindowRgn(hwnd, region) > 0);
                    for (x, y) in [
                        (0, 0),
                        (width - 1, 0),
                        (0, height - 1),
                        (width - 1, height - 1),
                    ] {
                        assert_eq!(
                            PtInRegion(region, x, y),
                            0,
                            "corner ({x}, {y}) must be outside"
                        );
                    }
                    for (x, y) in [
                        (width / 2, 0),
                        (0, height / 2),
                        (width / 2, height / 2),
                        (width - 2, height / 2),
                        (width / 2, height - 2),
                    ] {
                        assert_ne!(
                            PtInRegion(region, x, y),
                            0,
                            "content ({x}, {y}) must remain inside"
                        );
                    }
                    assert_ne!(DeleteObject(region as _), 0);
                };
                check(960, 800, 1.0);
                check(1200, 900, 1.25);
                check(1600, 1000, 1.5);
                check(880, 560, 1.0);
                assert_ne!(DestroyWindow(hwnd), 0);
            }
        }

        #[test]
        fn unchanged_bounds_do_not_reapply_or_leak_a_new_region() {
            unsafe {
                let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
                let hwnd = CreateWindowExW(
                    0,
                    class.as_ptr(),
                    std::ptr::null(),
                    WS_POPUP,
                    0,
                    0,
                    960,
                    800,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                );
                assert!(!hwnd.is_null());
                let state = Mutex::new(None);
                refresh(hwnd as usize, Some(1.5), &state).unwrap();
                assert_eq!(state.lock().unwrap().unwrap().diameter, 48);
                refresh(hwnd as usize, Some(1.5), &state).unwrap();
                assert_eq!(state.lock().unwrap().unwrap().diameter, 48);
                refresh(hwnd as usize, Some(1.0), &state).unwrap();
                assert_eq!(state.lock().unwrap().unwrap().diameter, 32);
                assert_ne!(DestroyWindow(hwnd), 0);
            }
        }
    }
}

pub fn install(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows::install(window)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn radius_matches_existing_shell_at_each_monitor_scale() {
        for (scale, expected) in [(1.0, 32), (1.25, 40), (1.5, 48), (2.0, 64)] {
            let shape = rounded_window_geometry(1600, 900, scale).unwrap();
            assert_eq!(shape.diameter, expected);
            assert_eq!((shape.width, shape.height), (1600, 900));
        }
    }

    #[test]
    fn minimized_invalid_and_tiny_bounds_are_safe() {
        for (w, h, scale) in [
            (0, 800, 1.0),
            (960, 0, 1.0),
            (960, 800, f64::NAN),
            (960, 800, 0.0),
            (u32::MAX, 800, 1.0),
        ] {
            assert!(rounded_window_geometry(w, h, scale).is_none());
        }
        assert_eq!(rounded_window_geometry(8, 4, 2.0).unwrap().diameter, 4);
    }
}
