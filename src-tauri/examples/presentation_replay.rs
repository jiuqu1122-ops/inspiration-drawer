//! Replay supplied presentation JSON through the production native writer.
#[path = "../src/commands/chat_presentation_graphics.rs"]
mod chat_presentation_graphics;
#[path = "../src/commands/chat_presentation.rs"]
mod chat_presentation;
fn main() -> Result<(), String> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.len() != 2 { return Err("usage: presentation_replay input.json output.pptx".into()); }
    let bytes = std::fs::read(&args[0]).map_err(|e| e.to_string())?;
    let deck: chat_presentation::ChatPresentation = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let summary = chat_presentation::write_pptx(std::path::Path::new(&args[1]), &deck, &std::collections::HashMap::new())?;
    println!("slides={} warnings={:?}", summary.slide_count, summary.warnings);
    Ok(())
}
