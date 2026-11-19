// Isolated native package tests; no network or GUI and no production credentials.
#[path = "../src/github_skills.rs"]
mod github_skills;
#[path = "../src/github_skill_commands.rs"]
mod github_skill_commands;
fn main() {}
