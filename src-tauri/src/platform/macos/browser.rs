use std::path::PathBuf;

pub fn candidates(browser: &str) -> Vec<PathBuf> {
    let application_name = match browser {
        "chrome" => "Google Chrome.app",
        "edge" => "Microsoft Edge.app",
        _ => return Vec::new(),
    };
    let executable_name = match browser {
        "chrome" => "Google Chrome",
        "edge" => "Microsoft Edge",
        _ => return Vec::new(),
    };

    let relative = PathBuf::from(application_name)
        .join("Contents")
        .join("MacOS")
        .join(executable_name);
    let mut candidates = vec![PathBuf::from("/Applications").join(&relative)];
    if let Some(home) = std::env::var_os("HOME") {
        candidates.push(PathBuf::from(home).join("Applications").join(relative));
    }
    candidates
}
