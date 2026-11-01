//! One gesture owns an immutable physical anchor. Never recompute it from an
//! intermediate window rect or convert its coordinates through logical DPI.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AnchoredRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}
pub fn anchored_rect(right: i32, top: i32, width: i32, height: i32) -> Result<AnchoredRect, String> {
    if !(1..=32768).contains(&width) || !(1..=32768).contains(&height) {
        return Err("抽屉缩放尺寸无效".into());
    }
    let x = right.checked_sub(width).ok_or("抽屉缩放坐标超出范围")?;
    top.checked_add(height).ok_or("抽屉缩放坐标超出范围")?;
    Ok(AnchoredRect { x, y: top, width, height })
}
pub fn apply(window: &tauri::WebviewWindow, rect: AnchoredRect) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winapi::um::winuser::{SetWindowPos, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as winapi::shared::windef::HWND;
        let ok = unsafe { SetWindowPos(hwnd, std::ptr::null_mut(), rect.x, rect.y, rect.width, rect.height,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER) };
        if ok == 0 { return Err(format!("更新抽屉窗口失败：{}", std::io::Error::last_os_error())); }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        window.set_size(tauri::PhysicalSize::new(rect.width as u32, rect.height as u32)).map_err(|e| e.to_string())?;
        window.set_position(tauri::PhysicalPosition::new(rect.x, rect.y)).map_err(|e| e.to_string())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_immutable_right_and_top_during_reversal_and_fractional_dpi_sizes() {
        for right in [-250, 0, 1677, 3840] {
            for width in [800, 1001, 1234, 1001, 800] {
                let rect = anchored_rect(right, -125, width, 937).unwrap();
                assert_eq!(rect.x + rect.width, right);
                assert_eq!(rect.y, -125);
            }
        }
    }
    #[test]
    fn rejects_invalid_dimensions_and_coordinate_overflow() {
        assert!(anchored_rect(1000, 0, 0, 100).is_err());
        assert!(anchored_rect(1000, 0, 100, 32769).is_err());
        assert!(anchored_rect(i32::MIN, 0, 100, 100).is_err());
        assert!(anchored_rect(1000, i32::MAX, 100, 100).is_err());
    }
}
