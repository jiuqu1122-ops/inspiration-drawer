use std::path::PathBuf;

pub fn candidates(browser: &str) -> Vec<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let program_files = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let program_files_x86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from);
    let mut candidates = Vec::new();

    match browser {
        "chrome" => {
            if let Some(root) = local {
                candidates.push(root.join("Google/Chrome/Application/chrome.exe"));
            }
            for root in [program_files.as_ref(), program_files_x86.as_ref()]
                .into_iter()
                .flatten()
            {
                candidates.push(root.join("Google/Chrome/Application/chrome.exe"));
            }
        }
        "edge" => {
            for root in [program_files.as_ref(), program_files_x86.as_ref()]
                .into_iter()
                .flatten()
            {
                candidates.push(root.join("Microsoft/Edge/Application/msedge.exe"));
            }
            if let Some(root) = local {
                candidates.push(root.join("Microsoft/Edge/Application/msedge.exe"));
            }
        }
        _ => {}
    }

    candidates
}
