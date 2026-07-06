pub mod assets;
pub mod license;
pub mod migration;

// 🌟 换成这行：
use base64::{engine::general_purpose, Engine as _};
use screenshots::Screen;
use std::io::Cursor;
use tauri::{LogicalPosition, State, WebviewWindow};

#[tauri::command]
pub fn drag_window(window: WebviewWindow, dx: f64, dy: f64) {
    if let Ok(factor) = window.scale_factor() {
        if let Ok(pos) = window.outer_position() {
            let logical_pos = pos.to_logical::<f64>(factor);
            let _ =
                window.set_position(LogicalPosition::new(logical_pos.x + dx, logical_pos.y + dy));
        }
    }
}

#[tauri::command]
pub fn set_ignore_mouse(window: WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

// 🌟 1. 瞬间截屏 + JPEG 极速转码
#[tauri::command]
pub async fn capture_screen(window: WebviewWindow) -> Result<String, String> {
    // 1. 获取当前抽屉窗口所在的显示器
    let current_monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("无法获取当前显示器")?;

    let monitor_pos = current_monitor.position();

    // 2. 获取系统所有屏幕
    let screens = Screen::all().map_err(|e| e.to_string())?;
    if screens.is_empty() {
        return Err("找不到任何可用屏幕".into());
    }

    // 3. 匹配当前窗口所在的屏幕（🌟 核心修复：用 iter() 借用，避免所有权转移）
    let screen = screens
        .iter()
        .find(|s| s.display_info.x == monitor_pos.x && s.display_info.y == monitor_pos.y)
        .unwrap_or(&screens[0])
        .clone(); // 找到后克隆一份归自己所有

    // 4. 截图并转码 JPEG
    let image = screen.capture().map_err(|e| e.to_string())?;
    let mut cursor = Cursor::new(Vec::new());
    image
        .write_to(&mut cursor, screenshots::image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;

    let buffer = cursor.into_inner();
    let b64 = general_purpose::STANDARD.encode(&buffer);

    Ok(format!("data:image/jpeg;base64,{}", b64))
}

// 🌟 2. 截图准备就绪后，再把窗口铺满全屏供用户裁剪
// 🌟 进入截图前，让 Rust 死死记住当前的物理尺寸！
#[tauri::command]
pub fn enter_snip_mode(window: WebviewWindow, state: State<'_, crate::SnipState>) {
    // 1. 记下变大前的真实位置和大小
    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
        *state.pre_snip_bounds.lock().unwrap() = Some((pos, size));
    }

    // 2. 然后再拉满全屏
    if let Ok(Some(monitor)) = window.current_monitor() {
        let _ = window.set_position(*monitor.position());
        let _ = window.set_size(*monitor.size());
    }
}
#[tauri::command]
pub fn set_drawer_pass_through(window: tauri::WebviewWindow, ignore: bool) {
    // ignore 为 true 时，鼠标直接穿过窗口点到桌面
    // ignore 为 false 时，鼠标可以点到抽屉
    let _ = window.set_ignore_cursor_events(ignore);
}
// 🌟 退出截图时，强制用 Rust 记忆的尺寸还原，彻底无视前端传来的任何宽度！
#[tauri::command]
pub fn exit_snip_mode(window: WebviewWindow, state: State<'_, crate::SnipState>) {
    if let Some((pos, size)) = state.pre_snip_bounds.lock().unwrap().take() {
        let _ = window.set_size(size);
        let _ = window.set_position(pos);
    }
}
#[tauri::command]
pub fn update_bounds(window: tauri::WebviewWindow, width: f64, height: f64, keep_right: bool) {
    // 🌟 终极防丢算法：不依赖显示器，直接基于窗口自身的坐标进行“左向拉伸”
    if let Ok(factor) = window.scale_factor() {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
            let logical_pos = pos.to_logical::<f64>(factor);
            let logical_size = size.to_logical::<f64>(factor);

            // 核心：算出当前窗口的最右侧边缘在哪，减去新的宽度，就是新的起点 X！
            let new_x = if keep_right {
                logical_pos.x + logical_size.width - width
            } else {
                logical_pos.x
            };

            // 先设置尺寸，再设置位置
            let _ = window.set_size(tauri::LogicalSize::new(width, height));
            let _ = window.set_position(tauri::LogicalPosition::new(new_x, logical_pos.y));
        }
    }
}
