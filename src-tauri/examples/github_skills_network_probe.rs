//! Opt-in developer smoke test: real public GitHub, isolated temporary storage, no model API.
//! Never touches the application's data, runs package scripts, or alters credentials.
#[path = "../src/github_skills.rs"]
mod github_skills;
use github_skills::{Github, Source, Store};
use std::{fs, sync::atomic::AtomicBool};
fn main() -> Result<(), String> {
    let url = std::env::args().nth(1).ok_or("usage: github_skills_network_probe <public-github-url> <skill-directory>")?;
    let directory = std::env::args().nth(2).ok_or("explicit skill directory required")?;
    let root = std::env::temp_dir().join(format!("drawer-skills-network-probe-{}", std::process::id()));
    if root.exists() { return Err("probe storage already exists; refusing to overwrite".into()); }
    let result = (|| {
        let store = Store::new(root.clone()); let cancel = AtomicBool::new(false);
        let inspection = store.inspect(&Github::new()?, Source { url, reference: None, directory: Some(directory) }, &cancel)?;
        if inspection.candidates.len()!=1 { return Err("probe requires one exact skill directory".into()); }
        let pack=&inspection.candidates[0];
        println!("Resolved {} / {} at {} ({} files)", pack.repository, pack.directory, pack.commit, pack.files.len());
        // Deliberate developer authorization scoped to this throwaway smoke-test directory.
        // Production always calls the Rust-owned native confirmation dialog.
        let installed=store.install(&Github::new()?,&inspection.preview_id,&pack.id,"install",&cancel,|_|true)?;
        let full=store.read(&pack.id,&pack.commit,"SKILL.md",0,40_000)?;
        if full["nextOffset"].is_null()==false { return Err("probe SKILL.md exceeds test context budget".into()); }
        if !installed.package.files.iter().all(|f| f.sha256.is_some()) { return Err("missing local checksum".into()); }
        if store.list()?.len()!=1 { return Err("installation record missing".into()); }
        println!("PASS: complete download, checksummed files and version-pinned SKILL.md read; no scripts executed."); Ok(())
    })();
    // Only our resolved, known probe directory. User application files are never read or removed.
    if root.starts_with(std::env::temp_dir()) && root.file_name().and_then(|s|s.to_str()).is_some_and(|s|s.starts_with("drawer-skills-network-probe-")) && root.exists() { fs::remove_dir_all(&root).map_err(|e|e.to_string())?; }
    result
}
