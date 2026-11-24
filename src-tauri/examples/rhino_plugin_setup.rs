//! Standalone Windows installer for the same embedded Rhino payload as Settings.
#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
#[path = "../src/rhino_installer.rs"]
mod rhino_installer;
#[cfg(windows)]
#[path = "../src/rhino_updates.rs"]
mod rhino_updates;

#[cfg(windows)]
fn main() {
    use std::iter::once;
    use winapi::um::winuser::{MessageBoxW, IDOK, MB_ICONERROR, MB_ICONINFORMATION, MB_OKCANCEL};

    fn show(text: &str, flags: u32) -> i32 {
        let text: Vec<_> = text.encode_utf16().chain(once(0)).collect();
        let caption: Vec<_> = "灵感抽屉 Rhino 插件安装".encode_utf16().chain(once(0)).collect();
        // Both strings are NUL-terminated and remain live until the dialog closes.
        unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), flags) }
    }

    if show("为当前 Windows 账户离线安装或修复 Rhino 8 / 9 插件。", MB_OKCANCEL | MB_ICONINFORMATION) != IDOK {
        return;
    }

    match rhino_installer::install() {
        Ok(result) => {
            let versions = result.installed.iter().filter(|item| item.installed)
                .map(|item| format!("Rhino {}", item.major_version)).collect::<Vec<_>>().join("、");
            let next = if result.restart_required { "请保存工程并重启 Rhino。" } else { "请启动 Rhino。" };
            let mut message = format!("{versions} 的插件文件和命令已注册。\n{next}启动后输入 InspirationDrawer。");
            if result.repaired_conflicts > 0 {
                message.push_str("\n检测到的同 ID 旧包已备份。");
            }
            if !result.cleanup_warnings.is_empty() {
                message.push_str("\n");
                message.push_str(&result.cleanup_warnings.join("\n"));
            }
            show(&message, MB_ICONINFORMATION);
        }
        Err(error) => {
            show(&format!("插件安装未完成。\n\n{error}"), MB_ICONERROR);
            std::process::exit(1);
        }
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("The Rhino plugin installer is available on Windows.");
}
