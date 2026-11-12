// Read-only multi-instance transport discovery; isolated descriptor tests are in rhino_beta.rs.
#[path = "../src/rhino_beta.rs"]
mod rhino_beta;
fn main() {
    match rhino_beta::rhino_beta_get_connections() {
        Ok(values) => println!("Discovered {} validated Rhino instance descriptor(s)",values.len()),
        Err(error) => { eprintln!("{error}"); std::process::exit(1); }
    }
}
