//! Dependency-free (apart from serde/zip) native, editable PresentationML writer.
//!
//! The caller resolves attachment IDs. This module never opens an attachment path or
//! URL, embeds only caller-supplied PNG/JPEG bytes, and never emits external links.
//! Text is plain text, not HTML/Markdown. Body planning uses the exact output typography;
//! headings/captions that cannot fit safely are rejected; titles use a bounded adaptive size, never clipping.
//!
//! Defaults: content layout; omitted art direction uses a neutral undecorated fallback. The presentation subtitle is the
//! first slide's fallback subtitle (and is also retained in document properties).
//! A two-column slide puts body/bullets/left fields on the left and right fields
//! on the right. Other layouts retain column fields in reading order, with a
//! warning. An image on content/two-column selects image-right with a warning.
//! Images repeat when a page is intentionally continued; verbose overflow is moved to editable notes instead of creating repeated title fragments.
//! Limits: 40 input / 60 output slides, 180,000 text characters overall, 20,000
//! characters per body/notes field, 200 bullets per slide, images bounded by slides,
//! 20 MiB per image / 100 MiB total, 16 MP per image. Input validation precedes
//! destination I/O. Speaker notes remain editable and scrollable in the notes
//! pane; arbitrary-length notes are not guaranteed to fit a printed notes page.

use super::chat_presentation_graphics::{
    normalize_color, render_elements, validate_canvas_text, validate_elements, PresentationElement,
};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;
use std::fmt::Write as FmtWrite;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPresentation {
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub design_style: Option<String>,
    #[serde(default)]
    pub accent_color: Option<String>,
    pub slides: Vec<ChatPresentationSlide>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPresentationSlide {
    #[serde(default)]
    pub layout: Option<String>,
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default, deserialize_with = "null_bullets")]
    pub bullets: Vec<String>,
    #[serde(default)]
    pub left_title: Option<String>,
    #[serde(default)]
    pub left_body: Option<String>,
    #[serde(default)]
    pub right_title: Option<String>,
    #[serde(default)]
    pub right_body: Option<String>,
    #[serde(default)]
    pub image_attachment_id: Option<String>,
    #[serde(default)]
    pub image_caption: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub eyebrow: Option<String>,
    #[serde(default)]
    pub takeaway: Option<String>,
    #[serde(default, deserialize_with = "null_items")]
    pub items: Vec<PresentationItem>,
    #[serde(default)]
    pub background_color: Option<String>,
    #[serde(default, deserialize_with = "null_elements")]
    pub elements: Vec<PresentationElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationItem {
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
}

fn null_elements<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<PresentationElement>, D::Error> {
    Ok(Option::<Vec<PresentationElement>>::deserialize(d)?.unwrap_or_default())
}

fn null_items<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<PresentationItem>, D::Error> {
    Ok(Option::<Vec<PresentationItem>>::deserialize(d)?.unwrap_or_default())
}

fn null_bullets<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    Ok(Option::<Vec<String>>::deserialize(d)?.unwrap_or_default())
}

#[derive(Debug, Clone)]
pub struct PresentationImage {
    pub bytes: Vec<u8>,
    pub extension: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PresentationWriteSummary {
    pub slide_count: usize,
    pub warnings: Vec<String>,
}

/// Validate and plan the complete deck before creating/truncating `path`.
/// Unused entries in `images` are neither read nor embedded. On an I/O error the
/// destination may be incomplete; the caller should publish it only on success.
pub fn write_pptx(
    path: &Path,
    presentation: &ChatPresentation,
    images: &HashMap<String, PresentationImage>,
) -> Result<PresentationWriteSummary, String> {
    let plan = plan_presentation(presentation, images)?;
    write_package(path, presentation, images, &plan)?;
    Ok(PresentationWriteSummary {
        slide_count: plan.pages.len(),
        warnings: plan.warnings,
    })
}

const MAX_INPUT_SLIDES: usize = 40;
const MAX_OUTPUT_SLIDES: usize = 60;
const MAX_TEXT_CHARS: usize = 180_000;
const MAX_FIELD_CHARS: usize = 20_000;
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES: usize = 100 * 1024 * 1024;
const SLIDE_W: i64 = 12_192_000;
const SLIDE_H: i64 = 6_858_000;
const EMU_PER_PT: i64 = 12_700;
const XML_HEADER: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";
const A_NS: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS: &str = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_R_NS: &str = "http://schemas.openxmlformats.org/package/2006/relationships";
const FONT: &str = "Microsoft YaHei";

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum DesignStyle {
    Adaptive,
    Editorial,
    Technical,
    Minimal,
    Cinematic,
    Brutalist,
    Soft,
    Custom,
}

impl DesignStyle {
    fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("adaptive") {
            "adaptive" | "auto" => Ok(Self::Adaptive),
            "editorial" => Ok(Self::Editorial),
            "technical" => Ok(Self::Technical),
            "minimal" => Ok(Self::Minimal),
            "cinematic" => Ok(Self::Cinematic),
            "brutalist" => Ok(Self::Brutalist),
            "soft" => Ok(Self::Soft),
            "custom" => Ok(Self::Custom),
            _ => Err("designStyle must be editorial, technical, minimal, cinematic, brutalist, soft or custom".into()),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Layout {
    Cover,
    Section,
    Content,
    TwoColumn,
    ImageLeft,
    ImageRight,
    Statement,
    Insight,
    Metrics,
    Process,
    Comparison,
    Grid,
    Canvas,
}

impl Layout {
    fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("content") {
            "cover" => Ok(Self::Cover),
            "section" => Ok(Self::Section),
            "content" => Ok(Self::Content),
            "two-column" => Ok(Self::TwoColumn),
            "image-left" => Ok(Self::ImageLeft),
            "image-right" => Ok(Self::ImageRight),
            "statement" => Ok(Self::Statement),
            "insight" => Ok(Self::Insight),
            "metrics" => Ok(Self::Metrics),
            "process" => Ok(Self::Process),
            "comparison" => Ok(Self::Comparison),
            "grid" => Ok(Self::Grid),
            "canvas" => Ok(Self::Canvas),
            _ => Err(
                "layout must be cover, section, content, two-column, image-left, image-right, statement, insight, metrics, process, comparison, grid or canvas"
                    .into(),
            ),
        }
    }

    fn title_pt(self) -> u32 {
        match self {
            Self::Cover => 46,
            Self::Section => 40,
            Self::Statement | Self::Insight => 38,
            Self::Metrics | Self::Process | Self::Comparison | Self::Grid => 34,
            _ => 32,
        }
    }

    fn continuation(self, has_image: bool) -> Self {
        match self {
            Self::Cover | Self::Section if has_image => Self::ImageRight,
            Self::Cover | Self::Section => Self::Content,
            other => other,
        }
    }
}

#[derive(Debug, Copy, Clone)]
struct Palette {
    name: &'static str,
    background: &'static str,
    text: &'static str,
    muted: &'static str,
    accent: &'static str,
    rule: &'static str,
    panel: &'static str,
    panel_alt: &'static str,
}

impl Palette {
    fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("light") {
            "light" => Ok(Self {
                name: "Light",
                background: "F7F8FA",
                text: "172033",
                muted: "586579",
                accent: "2563EB",
                rule: "D9DFE8",
                panel: "FFFFFF",
                panel_alt: "EFF3F8",
            }),
            "dark" => Ok(Self {
                name: "Dark",
                background: "101722",
                text: "F3F6FC",
                muted: "B7C3D5",
                accent: "8BBEFF",
                rule: "354257",
                panel: "182333",
                panel_alt: "202D3E",
            }),
            "warm" => Ok(Self {
                name: "Warm",
                background: "FAF3E8",
                text: "3D3028",
                muted: "76604F",
                accent: "AE4929",
                rule: "DCCDBB",
                panel: "FFFDF8",
                panel_alt: "F1E8DA",
            }),
            "mono" => Ok(Self {
                name: "Mono",
                background: "F2F1ED",
                text: "171717",
                muted: "555555",
                accent: "171717",
                rule: "B8B6B0",
                panel: "FFFFFF",
                panel_alt: "E5E4DF",
            }),
            "vivid" => Ok(Self {
                name: "Vivid",
                background: "FFF4E8",
                text: "20172E",
                muted: "58496B",
                accent: "E7472E",
                rule: "E3C9B8",
                panel: "FFFFFF",
                panel_alt: "F8DDC8",
            }),
            "pastel" => Ok(Self {
                name: "Pastel",
                background: "F4F0FA",
                text: "2C2740",
                muted: "68617C",
                accent: "8062B2",
                rule: "D9D1E7",
                panel: "FCFAFF",
                panel_alt: "EAE3F3",
            }),
            _ => Err("theme must be light, dark, warm, mono, vivid or pastel".into()),
        }
    }
}

#[derive(Debug, Copy, Clone)]
struct Rect {
    x: i64,
    y: i64,
    w: i64,
    h: i64,
}

fn inch(value: f64) -> i64 {
    (value * 914_400.0).round() as i64
}
fn rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect {
        x: inch(x),
        y: inch(y),
        w: inch(w),
        h: inch(h),
    }
}

#[derive(Debug, Clone)]
struct Block {
    lines: Vec<String>,
    bullet: bool,
    indented: bool,
    bold: bool,
}

#[derive(Debug)]
struct Page {
    source: usize,
    continuation: usize,
    layout: Layout,
    title: Vec<String>,
    title_pt: u32,
    subtitle: Vec<String>,
    subtitle_pt: u32,
    body_pt: u32,
    body_line_pt: i64,
    body_gap_pt: i64,
    left_rect: Rect,
    right_rect: Rect,
    elements: Vec<PresentationElement>,
    left: Vec<Block>,
    right: Vec<Block>,
    image_index: Option<usize>,
    caption: Vec<String>,
    notes: Option<String>,
    eyebrow: Vec<String>,
    takeaway: Vec<String>,
    items: Vec<PlannedItem>,
    background_color: Option<String>,
}

#[derive(Debug, Clone)]
struct FittedItemText {
    lines: Vec<String>,
    pt: u32,
    line_pt: i64,
    overflow: Option<String>,
}

#[derive(Debug, Clone)]
struct PlannedItem {
    area: Rect,
    title: FittedItemText,
    body: FittedItemText,
    value: FittedItemText,
}

#[derive(Debug)]
struct Media {
    id: String,
    extension: &'static str,
}

#[derive(Debug)]
struct Plan {
    palette: Palette,
    accent: String,
    style: DesignStyle,
    pages: Vec<Page>,
    media: Vec<Media>,
    warnings: Vec<String>,
}

/// XML 1.0 forbidden characters are rejected instead of silently discarded.
fn validate_text(text: &str, field: &str, max: usize, total: &mut usize) -> Result<(), String> {
    let mut count = 0usize;
    for ch in text.chars() {
        if !matches!(ch, '\t' | '\n' | '\r')
            && (ch < '\u{20}' || matches!(ch, '\u{fffe}' | '\u{ffff}'))
        {
            return Err(format!(
                "{field} contains a character forbidden by XML 1.0 (U+{:04X})",
                ch as u32
            ));
        }
        count += 1;
        if count > max {
            return Err(format!("{field} exceeds {max} characters"));
        }
    }
    *total = total.checked_add(count).ok_or("Text size overflow")?;
    if *total > MAX_TEXT_CHARS {
        return Err(format!(
            "Presentation exceeds {MAX_TEXT_CHARS} total text characters"
        ));
    }
    Ok(())
}

fn validate_element_text(
    value: &serde_json::Value,
    field: &str,
    total: &mut usize,
) -> Result<(), String> {
    match value {
        serde_json::Value::Object(map) => {
            for (key, child) in map {
                if key.eq_ignore_ascii_case("text") {
                    if let Some(text) = child.as_str() {
                        validate_text(text, field, 4_000, total)?;
                    }
                } else {
                    validate_element_text(child, field, total)?;
                }
            }
        }
        serde_json::Value::Array(values) => {
            for child in values {
                validate_element_text(child, field, total)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_model(p: &ChatPresentation) -> Result<Palette, String> {
    if p.slides.is_empty() || p.slides.len() > MAX_INPUT_SLIDES {
        return Err(format!(
            "Presentation must contain 1..={MAX_INPUT_SLIDES} input slides"
        ));
    }
    let palette = Palette::parse(p.theme.as_deref())?;
    DesignStyle::parse(p.design_style.as_deref())?;
    if let Some(color) = p.accent_color.as_deref() {
        normalize_color(color)?;
    }
    let mut total = 0;
    validate_text(&p.title, "Presentation title", 300, &mut total)?;
    if p.title.trim().is_empty() {
        return Err("Presentation title must not be blank".into());
    }
    if let Some(s) = &p.subtitle {
        validate_text(s, "Presentation subtitle", 1_000, &mut total)?;
    }
    for (i, s) in p.slides.iter().enumerate() {
        let prefix = format!("Slide {}", i + 1);
        let layout = Layout::parse(s.layout.as_deref()).map_err(|e| format!("{prefix}: {e}"))?;
        if layout == Layout::Canvas {
            if !s.elements.iter().any(|element| element.kind == "text" && element.text.as_deref().is_some_and(|text| text.contains(s.title.trim()))) {
                return Err(format!("{prefix}: canvas requires a text element containing the slide title; no automatic title is added"));
            }
            if !s.items.is_empty() || !s.bullets.is_empty() || [
                &s.subtitle, &s.body, &s.left_title, &s.left_body, &s.right_title, &s.right_body,
                &s.eyebrow, &s.takeaway, &s.image_attachment_id,
            ].into_iter().flatten().any(|value| !value.trim().is_empty()) {
                return Err(format!("{prefix}: canvas visible content must use elements; do not mix automatic body, items or image fields"));
            }
        }
        validate_text(&s.title, &format!("{prefix} title"), 300, &mut total)?;
        if s.title.trim().is_empty() {
            return Err(format!("{prefix} title must not be blank"));
        }
        for (name, text, max) in [
            ("subtitle", &s.subtitle, 1_000),
            ("body", &s.body, MAX_FIELD_CHARS),
            ("leftTitle", &s.left_title, 1_000),
            ("leftBody", &s.left_body, MAX_FIELD_CHARS),
            ("rightTitle", &s.right_title, 1_000),
            ("rightBody", &s.right_body, MAX_FIELD_CHARS),
            ("imageAttachmentId", &s.image_attachment_id, 512),
            ("imageCaption", &s.image_caption, 1_000),
            ("notes", &s.notes, MAX_FIELD_CHARS),
        ] {
            if let Some(text) = text {
                validate_text(text, &format!("{prefix} {name}"), max, &mut total)?;
            }
        }
        if let Some(text) = &s.eyebrow {
            validate_text(text, &format!("{prefix} eyebrow"), 1_000, &mut total)?;
        }
        if let Some(text) = &s.takeaway {
            validate_text(text, &format!("{prefix} takeaway"), 2_000, &mut total)?;
        }
        if let Some(color) = s.background_color.as_deref() {
            normalize_color(color).map_err(|e| format!("{prefix}: {e}"))?;
        }
        if s.elements.len() > 40 {
            return Err(format!("{prefix} exceeds 40 custom elements"));
        }
        validate_elements(&s.elements).map_err(|e| format!("{prefix}: {e}"))?;
        if layout == Layout::Canvas { validate_canvas_text(&s.elements).map_err(|error| format!("{prefix}: {error}"))?; }
        let element_json = serde_json::to_value(&s.elements)
            .map_err(|e| format!("{prefix}: cannot inspect vector element text: {e}"))?;
        validate_element_text(
            &element_json,
            &format!("{prefix} custom element text"),
            &mut total,
        )?;
        for (item_index, item) in s.items.iter().enumerate() {
            validate_text(
                &item.title,
                &format!("{prefix} item {} title", item_index + 1),
                1_000,
                &mut total,
            )?;
            if let Some(text) = &item.body {
                validate_text(
                    text,
                    &format!("{prefix} item {} body", item_index + 1),
                    4_000,
                    &mut total,
                )?;
            }
            if let Some(value) = &item.value {
                validate_text(
                    value,
                    &format!("{prefix} item {} value", item_index + 1),
                    300,
                    &mut total,
                )?;
            }
        }
        if s.items.len() > 6 {
            return Err(format!("{prefix} exceeds 6 presentation items"));
        }
        if s.bullets.len() > 200 {
            return Err(format!("{prefix} exceeds 200 bullets"));
        }
        for b in &s.bullets {
            validate_text(b, &format!("{prefix} bullet"), 4_000, &mut total)?;
        }
        if s.image_attachment_id
            .as_ref()
            .is_some_and(|id| id.trim().is_empty())
        {
            return Err(format!("{prefix} imageAttachmentId must not be blank"));
        }
        if s.image_caption.is_some() && s.image_attachment_id.is_none() {
            return Err(format!("{prefix} imageCaption requires imageAttachmentId"));
        }
    }
    Ok(palette)
}

fn image_extension(image: &PresentationImage) -> Result<&'static str, String> {
    match image.extension.to_ascii_lowercase().as_str() {
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        _ => Err("Only PNG and JPEG images are supported; preprocess the attachment first".into()),
    }
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if !bytes.starts_with(&[0xff, 0xd8]) || !bytes.ends_with(&[0xff, 0xd9]) {
        return None;
    }
    let mut pos = 2;
    while pos < bytes.len() {
        if bytes[pos] != 0xff {
            return None;
        }
        while bytes.get(pos) == Some(&0xff) {
            pos += 1;
        }
        let marker = *bytes.get(pos)?;
        pos += 1;
        if matches!(marker, 0x00 | 0xd8 | 0xd9 | 0xda) {
            return None;
        }
        if matches!(marker, 0x01 | 0xd0..=0xd7) {
            continue;
        }
        let len = u16::from_be_bytes([*bytes.get(pos)?, *bytes.get(pos + 1)?]) as usize;
        if len < 2 || pos.checked_add(len)? > bytes.len() {
            return None;
        }
        // Baseline, extended sequential and progressive JPEG supported by Office.
        if matches!(marker, 0xc0..=0xc2) {
            if len < 11 || bytes[pos + 2] != 8 {
                return None;
            }
            let components = bytes[pos + 7] as usize;
            if !matches!(components, 1 | 3 | 4) || len != 8 + 3 * components {
                return None;
            }
            return Some((
                u16::from_be_bytes([bytes[pos + 5], bytes[pos + 6]]) as u32,
                u16::from_be_bytes([bytes[pos + 3], bytes[pos + 4]]) as u32,
            ));
        }
        pos += len;
    }
    None
}

fn validate_image(image: &PresentationImage) -> Result<&'static str, String> {
    if image.bytes.is_empty() || image.bytes.len() > MAX_IMAGE_BYTES {
        return Err("Image must contain 1 byte..=20 MiB".into());
    }
    if image.width == 0
        || image.height == 0
        || image.width > 16_384
        || image.height > 16_384
        || u64::from(image.width) * u64::from(image.height) > 16_000_000
    {
        return Err(
            "Image dimensions must be positive, <=16384 per edge and <=16 megapixels".into(),
        );
    }
    let extension = image_extension(image)?;
    let dimensions = if extension == "png" {
        let b = &image.bytes;
        if b.len() < 45
            || !b.starts_with(b"\x89PNG\r\n\x1a\n")
            || b[8..12] != [0, 0, 0, 13]
            || &b[12..16] != b"IHDR"
            || !b.ends_with(b"\0\0\0\0IEND\xaeB`\x82")
        {
            return Err("PNG signature/IHDR/IEND is invalid".into());
        }
        if b[26] != 0 || b[27] != 0 || b[28] > 1 {
            return Err("Invalid PNG header".into());
        }
        Some((
            u32::from_be_bytes(b[16..20].try_into().unwrap()),
            u32::from_be_bytes(b[20..24].try_into().unwrap()),
        ))
    } else {
        jpeg_dimensions(&image.bytes)
    };
    if dimensions != Some((image.width, image.height)) {
        return Err("Image header dimensions/format do not match supplied dimensions".into());
    }
    Ok(extension)
}

fn normalized(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

// Deliberately conservative width estimate: explicit manual line breaks, no
// auto-fit, generous line boxes, and a spare 8pt horizontally. No font decoding
// or system-font dependence, so planning/tests are deterministic on all hosts.
fn char_width(ch: char, pt: u32) -> i64 {
    let thousandths = if ch == '\t' {
        4_000
    } else if ch.is_ascii() {
        if "MW@#%&".contains(ch) {
            1_050
        } else {
            780
        }
    } else {
        1_200
    };
    (thousandths * i64::from(pt) * EMU_PER_PT + 999) / 1_000
}

// Keep common combining sequences and emoji ZWJ/flag sequences intact when
// inserting line/page breaks. Width estimates count every scalar, including
// marks, so an unusually long cluster is rejected rather than allowed to spill.
fn extends_cluster(ch: char) -> bool {
    matches!(ch as u32,
        0x0300..=0x036f | 0x0483..=0x0489 | 0x0591..=0x05bd | 0x05bf |
        0x05c1..=0x05c2 | 0x05c4..=0x05c5 | 0x05c7 | 0x0610..=0x061a |
        0x064b..=0x065f | 0x0670 | 0x06d6..=0x06dc | 0x06df..=0x06e4 |
        0x06e7..=0x06e8 | 0x06ea..=0x06ed | 0x0711 | 0x0730..=0x074a |
        0x07a6..=0x07b0 | 0x07eb..=0x07f3 | 0x0816..=0x082d |
        0x08d3..=0x0903 | 0x093a..=0x094f | 0x0951..=0x0957 | 0x0962..=0x0963 |
        0x0981..=0x0983 | 0x09bc | 0x09be..=0x09cd | 0x09d7 | 0x09e2..=0x09e3 |
        0x0a01..=0x0a03 | 0x0a3c..=0x0a4d | 0x0a70..=0x0a71 |
        0x0a81..=0x0a83 | 0x0abc..=0x0acd | 0x0ae2..=0x0ae3 |
        0x0b01..=0x0b03 | 0x0b3c..=0x0b4d | 0x0b55..=0x0b57 |
        0x0b82 | 0x0bbe..=0x0bcd | 0x0bd7 | 0x0c00..=0x0c04 |
        0x0c3c..=0x0c56 | 0x0c81..=0x0c83 | 0x0cbc..=0x0cd6 |
        0x0d00..=0x0d03 | 0x0d3b..=0x0d4d | 0x0d57 | 0x0d81..=0x0d83 |
        0x0dca | 0x0dcf..=0x0ddf | 0x0df2..=0x0df3 | 0x0e31 |
        0x0e34..=0x0e3a | 0x0e47..=0x0e4e | 0x0eb1 | 0x0eb4..=0x0ebc |
        0x0ec8..=0x0ece | 0x0f18..=0x0f19 | 0x0f35 | 0x0f37 | 0x0f39 |
        0x0f3e..=0x0f3f | 0x0f71..=0x0f84 | 0x0f86..=0x0f87 | 0x0f8d..=0x0fbc |
        0x102b..=0x103e | 0x1056..=0x1059 | 0x135d..=0x135f |
        0x1712..=0x1715 | 0x1732..=0x1734 | 0x17b4..=0x17d3 |
        0x180b..=0x180d | 0x1ab0..=0x1aff | 0x1dc0..=0x1dff | 0x200c..=0x200d |
        0x20d0..=0x20ff | 0x302a..=0x302f | 0x3099..=0x309a |
        0xa66f..=0xa672 | 0xa674..=0xa67d | 0xfe00..=0xfe0f | 0xfe20..=0xfe2f |
        0x1f3fb..=0x1f3ff | 0xe0020..=0xe007f | 0xe0100..=0xe01ef)
}

fn text_units(text: &str) -> Vec<&str> {
    let mut units = Vec::new();
    let mut start = 0;
    let mut previous = '\0';
    let mut regional_run = 0;
    for (idx, ch) in text.char_indices() {
        let regional = matches!(ch as u32, 0x1f1e6..=0x1f1ff);
        let joins =
            extends_cluster(ch) || previous == '\u{200d}' || (regional && regional_run % 2 == 1);
        if idx > 0 && !joins {
            units.push(&text[start..idx]);
            start = idx;
        }
        regional_run = if regional { regional_run + 1 } else { 0 };
        previous = ch;
    }
    if !text.is_empty() {
        units.push(&text[start..]);
    }
    units
}

fn line_width(text: &str, pt: u32) -> i64 {
    text.chars().map(|ch| char_width(ch, pt)).sum()
}

fn wrap_text(text: &str, width: i64, pt: u32) -> Vec<String> {
    let available = width - 8 * EMU_PER_PT;
    let mut result = Vec::new();
    for source in normalized(text).split('\n') {
        let mut line = String::new();
        let mut used = 0;
        let units = text_units(source);
        for (unit_index, unit) in units.iter().copied().enumerate() {
            let advance = line_width(unit, pt);
            // Chinese closing punctuation belongs to the preceding word. Reserve
            // room for it before choosing a break, rather than emitting a page
            // or line starting with a comma/semicolon/closing bracket.
            let closing_width = units.get(unit_index + 1)
                .filter(|next| next.chars().next().is_some_and(|c| "，。；：！？、）》】〕”’％%!?;:,.)]".contains(c)))
                .map(|next| line_width(next, pt)).unwrap_or(0);
            if used + advance + closing_width > available && !line.is_empty() {
                // Prefer word boundaries, retaining spaces and every character.
                if let Some((idx, space)) = line.char_indices().rev().find(|(idx, c)| {
                    c.is_whitespace()
                        && !line[idx + c.len_utf8()..]
                            .chars()
                            .next()
                            .is_some_and(extends_cluster)
                }) {
                    let cut = idx + space.len_utf8();
                    let tail = line.split_off(cut);
                    result.push(std::mem::take(&mut line));
                    line = tail;
                    used = line_width(&line, pt);
                } else {
                    result.push(std::mem::take(&mut line));
                    used = 0;
                }
            }
            if used + advance > available && !line.is_empty() {
                result.push(std::mem::take(&mut line));
                used = 0;
            }
            line.push_str(unit);
            used += advance;
        }
        result.push(line);
    }
    result
}

fn fit_title(
    text: &str,
    area: Rect,
    preferred_pt: u32,
    max_lines: usize,
    label: &str,
) -> Result<(Vec<String>, u32), String> {
    let minimum_pt = 18;
    let mut pt = preferred_pt;
    loop {
        let lines = wrap_text(text, area.w, pt);
        let line_height_emu = i64::from(pt + 9) * EMU_PER_PT;
        if lines.iter().all(|line| line_width(line, pt) <= area.w - 8 * EMU_PER_PT)
            && lines.len() <= max_lines
            && (lines.len() as i64) * line_height_emu <= area.h
            && (lines.len() <= 1 || pt == minimum_pt || lines.last().is_some_and(|line| line_width(line, pt) >= area.w / 4))
        {
            return Ok((lines, pt));
        }
        if pt <= minimum_pt {
            return Err(format!("{label} exceeds the safe title area even at {minimum_pt} pt; shorten the title or move detail into subtitle/body"));
        }
        pt = (pt - 2).max(minimum_pt);
    }
}

fn fit_text_block(
    text: &str,
    area: Rect,
    preferred_pt: u32,
    max_lines: usize,
    label: &str,
) -> Result<(Vec<String>, u32), String> {
    let minimum_pt = 12;
    let mut pt = preferred_pt;
    loop {
        let lines = wrap_text(text, area.w, pt);
        let line_height = i64::from(pt + 8) * EMU_PER_PT;
        let height_available = (area.h - 4 * EMU_PER_PT).max(line_height);
        if lines.iter().all(|line| line_width(line, pt) <= area.w - 8 * EMU_PER_PT)
            && lines.len() <= max_lines
            && (lines.len() as i64) * line_height <= height_available
        {
            return Ok((lines, pt));
        }
        if pt <= minimum_pt {
            return Err(format!("{label} exceeds the safe text area even at {minimum_pt} pt; shorten it"));
        }
        pt = (pt - 1).max(minimum_pt);
    }
}

fn short_text(
    text: &str,
    width: i64,
    pt: u32,
    max_lines: usize,
    label: &str,
) -> Result<Vec<String>, String> {
    let lines = wrap_text(text, width, pt);
    if lines
        .iter()
        .any(|s| line_width(s, pt) > width - 8 * EMU_PER_PT)
    {
        return Err(format!(
            "{label} contains an unbreakable text sequence that cannot fit at {pt} pt"
        ));
    }
    if lines.len() > max_lines {
        return Err(format!("{label} needs {} lines; maximum is {max_lines} at {pt} pt. Shorten it or move detail into body/notes", lines.len()));
    }
    Ok(lines)
}

fn fit_item_text(text: &str, region: ItemTextRegion, label: &str) -> Result<FittedItemText, String> {
    if text.is_empty() {
        return Ok(FittedItemText { lines: Vec::new(), pt: region.pt, line_pt: region.line_pt, overflow: None });
    }
    debug_assert!(region.max_lines >= 1);
    let min_pt = if region.pt >= 20 { 12 } else { 10 };
    let available_width = (region.area.w - 8 * EMU_PER_PT).max(EMU_PER_PT);
    let effective_width = region.area.w.max(16 * EMU_PER_PT);
    for pt in (min_pt..=region.pt).rev().take(64) {
        let line_pt = region.line_pt.min(i64::from(pt) + 6).max(i64::from(pt) + 3);
        let lines = wrap_text(text, effective_width, pt);
        let vertical_limit = ((region.area.h - 4 * EMU_PER_PT).max(line_pt * EMU_PER_PT)
            / (line_pt * EMU_PER_PT)).max(1) as usize;
        let line_limit = vertical_limit;
        if lines.iter().all(|line| line_width(line, pt) <= available_width)
            && lines.len() <= line_limit
        {
            return Ok(FittedItemText { lines, pt, line_pt, overflow: None });
        }
    }

    let pt = min_pt;
    let line_pt = i64::from(pt) + 3;
    let lines = wrap_text(text, effective_width, pt);
    if lines.iter().any(|line| line_width(line, pt) > available_width.max(8 * EMU_PER_PT)) {
        return Err(format!("{label} contains an unbreakable text sequence that cannot fit even at {pt} pt"));
    }
    let vertical_limit = ((region.area.h - 4 * EMU_PER_PT).max(line_pt * EMU_PER_PT)
        / (line_pt * EMU_PER_PT)).max(1) as usize;
    let line_limit = vertical_limit;
    let mut fitted = lines.iter().take(line_limit).cloned().collect::<Vec<_>>();
    let clipped = lines.len() > line_limit;
    if clipped {
        if let Some(last) = fitted.last_mut() {
            last.push('…');
            while line_width(last, pt) > available_width {
                let prefix = last.strip_suffix('…').unwrap_or(last).to_string();
                let units = text_units(&prefix);
                if units.is_empty() { last.clear(); break; }
                *last = format!("{}…", units[..units.len() - 1].concat());
            }
        }
    }
    Ok(FittedItemText {
        lines: fitted,
        pt,
        line_pt,
        overflow: clipped.then(|| format!("{label}: {}", text.trim())),
    })
}

fn merge_speaker_notes(base: Option<&str>, overflow: &[String]) -> Option<String> {
    let mut parts = base.map(str::trim).filter(|value| !value.is_empty()).map(str::to_owned).into_iter().collect::<Vec<_>>();
    if !overflow.is_empty() {
        parts.push(format!("版面适配保留的完整比较细节：\n{}", overflow.join("\n")));
    }
    (!parts.is_empty()).then(|| parts.join("\n\n"))
}

/// Rewrap with the font that will actually be emitted; prefer readable 18+ pt
/// text to deleting paragraphs or synthesizing orphan continuation pages.
fn fit_body_columns(left: Vec<Block>, right: Vec<Block>, width: i64, height: i64, preferred_pt: u32) -> (Vec<Block>, Vec<Block>, u32, i64, i64) {
    let rewrap = |blocks: &[Block], pt: u32| -> Vec<Block> {
        blocks.iter().filter(|block| !block.lines.iter().all(|line| line.trim().is_empty()))
            .map(|block| Block {
                lines: wrap_text(&block.lines.join(""), width - if block.indented { 24 * EMU_PER_PT } else { 0 }, pt),
                ..block.clone()
            }).collect()
    };
    let mut result = (left.clone(), right.clone(), preferred_pt, i64::from(preferred_pt) + 6, 4);
    for pt in (18..=preferred_pt.max(18)).rev() {
        let line_pt = i64::from(pt) + 6;
        let a = rewrap(&left, pt);
        let b = rewrap(&right, pt);
        let fits = |blocks: &[Block]| blocks.iter().map(|block| block.lines.len() as i64 * line_pt + 4).sum::<i64>() * EMU_PER_PT <= height;
        let ok = fits(&a) && fits(&b);
        result = (a, b, pt, line_pt, 4);
        if ok { break; }
    }
    result
}


fn add_blocks(
    out: &mut Vec<Block>,
    text: Option<&str>,
    bullet: bool,
    bold: bool,
    width: i64,
    pt: u32,
) {
    if let Some(text) = text.filter(|s| !s.is_empty()) {
        let width = width - if bullet { 24 * EMU_PER_PT } else { 0 };
        if bullet {
            out.push(Block {
                lines: wrap_text(text, width, pt),
                bullet,
                indented: true,
                bold,
            });
        } else {
            for line in normalized(text).split('\n') {
                out.push(Block {
                    lines: wrap_text(line, width, pt),
                    bullet,
                    indented: false,
                    bold,
                });
            }
        }
    }
}

fn title_max_lines(layout: Layout) -> usize {
    match layout {
        Layout::Cover | Layout::Section => 3,
        Layout::Statement | Layout::Insight => 2,
        _ => 2,
    }
}

fn body_typography(layout: Layout) -> (u32, i64) {
    match layout {
        // These layouts reserve a takeaway band. Keep the body compact enough
        // for one authored slide instead of creating repeated title fragments.
        Layout::Cover | Layout::Section => (19, 25),
        Layout::Statement => (24, 30),
        Layout::Insight => (22, 28),
        Layout::Metrics | Layout::Process | Layout::Comparison | Layout::Grid => (22, 30),
        _ => (22, 30),
    }
}

fn paginate(
    blocks: Vec<Block>,
    first_height: i64,
    following_height: i64,
    first_line_pt: i64,
    following_line_pt: i64,
    gap_pt: i64,
) -> Result<Vec<Vec<Block>>, String> {
    let mut queue: std::collections::VecDeque<Block> = blocks.into();
    let mut pages = Vec::new();
    loop {
        let (height, line_pt) = if pages.is_empty() {
            (first_height / EMU_PER_PT, first_line_pt)
        } else {
            (following_height / EMU_PER_PT, following_line_pt)
        };
        let mut used = 0;
        let mut page = Vec::new();
        while let Some(mut block) = queue.pop_front() {
            let available = ((height - used - gap_pt) / line_pt).max(0) as usize;
            if available == 0 {
                queue.push_front(block);
                break;
            }
            if block.lines.len() > available {
                let rest = block.lines.split_off(available);
                queue.push_front(Block {
                    lines: rest,
                    bullet: false,
                    ..block.clone()
                });
            }
            used += block.lines.len() as i64 * line_pt + gap_pt;
            page.push(block);
        }
        if page.is_empty() && !queue.is_empty() {
            return Err("Text area cannot fit a 22 pt body line".into());
        }
        pages.push(page);
        if pages.len() > MAX_OUTPUT_SLIDES {
            return Err(format!(
                "Content needs more than {MAX_OUTPUT_SLIDES} output slides; shorten it"
            ));
        }
        if queue.is_empty() {
            return Ok(pages);
        }
    }
}

fn reserve_element_band(mut area: Rect, elements: &[PresentationElement]) -> Rect {
    for element in elements {
        if element.y < 50.0 { continue; }
        let x = (f64::from(element.x) * SLIDE_W as f64 / 100.0).round() as i64;
        let y = (f64::from(element.y) * SLIDE_H as f64 / 100.0).round() as i64;
        let w = (f64::from(element.width) * SLIDE_W as f64 / 100.0).round() as i64;
        if x < area.x + area.w && x + w > area.x && y > area.y && y < area.y + area.h {
            area.h = (y - area.y - inch(0.16)).max(inch(0.4));
        }
    }
    area
}

fn comparison_item_rect(index: usize, subtitle: bool, summary: bool, takeaway: bool) -> Rect {
    let y = if subtitle { 3.0 } else { 2.45 } + if summary { 0.72 } else { 0.0 };
    let bottom = if takeaway { 6.24 } else { 6.72 };
    rect(0.9 + index as f64 * 5.85, y, 5.45, bottom - y)
}

fn title_rect(layout: Layout, _has_image: bool) -> Rect {
    match layout {
        Layout::Cover => rect(0.85, 1.48, 6.1, 2.45),
        Layout::Section => rect(0.85, 1.55, 9.8, 2.25),
        Layout::ImageLeft => rect(6.95, 0.83, 5.65, 1.15),
        Layout::ImageRight => rect(0.82, 0.83, 5.65, 1.15),
        Layout::Statement | Layout::Insight => rect(0.78, 0.85, 11.85, 1.42),
        _ => rect(0.78, 0.86, 11.85, 1.25),
    }
}

fn subtitle_typography(layout: Layout) -> (u32, i64) {
    (
        if matches!(layout, Layout::Cover | Layout::Section) {
            21
        } else {
            17
        },
        25,
    )
}

fn subtitle_rect(layout: Layout, has_image: bool) -> Rect {
    match layout {
        Layout::Cover => rect(0.9, 4.35, 6.0, 0.85),
        Layout::Section => rect(0.9, 4.12, 8.6, 0.8),
        Layout::ImageLeft => rect(6.98, 2.04, 5.55, 0.78),
        Layout::ImageRight => rect(0.82, 2.04, 5.55, 0.78),
        Layout::Statement | Layout::Insight => rect(0.82, 2.34, 11.8, 0.76),
        _ => rect(0.82, 2.18, if has_image { 5.7 } else { 11.8 }, 0.78),
    }
}

fn eyebrow_rect(layout: Layout) -> Rect {
    match layout {
        Layout::Cover => rect(0.9, 0.87, 6.2, 0.34),
        Layout::Section => rect(0.9, 1.06, 6.0, 0.32),
        _ => rect(0.82, 0.43, 9.0, 0.3),
    }
}

fn body_rect(
    layout: Layout,
    has_image: bool,
    has_subtitle: bool,
    right: bool,
    has_takeaway: bool,
) -> Rect {
    match layout {
        Layout::Cover => rect(0.9, 5.3, 6.1, if has_takeaway { 0.62 } else { 1.45 }),
        Layout::Section => rect(0.9, 5.05, 8.2, if has_takeaway { 0.62 } else { 1.25 }),
        Layout::Statement | Layout::Insight => {
            let y = if has_subtitle { 3.04 } else { 2.52 };
            let bottom = if has_takeaway { 5.76 } else { 6.65 };
            rect(0.9, y, 11.15, bottom - y)
        },
        Layout::Metrics => rect(0.9, 3.02, 11.55, 0.82),
        Layout::Process => rect(0.9, 3.02, 11.55, 0.82),
        Layout::Comparison => rect(0.9, if has_subtitle { 3.0 } else { 2.45 }, 11.15, 0.6),
        Layout::Grid => rect(0.9, 3.02, 11.55, 0.82),
        Layout::ImageLeft => rect(6.95, 2.98, 5.7, if has_takeaway { 2.82 } else { 3.58 }),
        Layout::ImageRight => rect(0.82, 2.98, 5.7, if has_takeaway { 2.82 } else { 3.58 }),
        Layout::TwoColumn => rect(
            if right { 6.72 } else { 0.82 },
            if has_subtitle { 3.08 } else { 2.42 },
            5.72,
            if has_takeaway { if has_subtitle { 2.62 } else { 3.28 } } else { if has_subtitle { 3.46 } else { 4.12 } },
        ),
        Layout::Content | Layout::Canvas => rect(
            0.84,
            if has_subtitle { 2.88 } else { 2.08 },
            if has_image { 5.72 } else { 11.65 },
            if has_takeaway {
                if has_subtitle {
                    2.6
                } else {
                    3.2
                }
            } else {
                if has_subtitle {
                    3.77
                } else {
                    4.57
                }
            },
        ),
    }
}

fn picture_rect(layout: Layout, caption: bool, has_takeaway: bool) -> Rect {
    match layout {
        Layout::Cover => rect(
            7.15,
            1.48,
            5.25,
            if caption && has_takeaway {
                3.45
            } else if caption {
                4.35
            } else if has_takeaway {
                4.15
            } else {
                4.9
            },
        ),
        Layout::ImageLeft => rect(
            0.82,
            2.18,
            5.65,
            if caption && has_takeaway {
                3.08
            } else if caption {
                3.65
            } else if has_takeaway {
                3.78
            } else {
                4.18
            },
        ),
        _ => rect(
            6.95,
            2.18,
            5.65,
            if caption && has_takeaway {
                3.08
            } else if caption {
                3.65
            } else if has_takeaway {
                3.78
            } else {
                4.18
            },
        ),
    }
}

fn takeaway_rect(layout: Layout, has_image: bool) -> Rect {
    if has_image && layout == Layout::ImageLeft {
        return rect(6.95, 5.98, 5.65, 0.72);
    }
    if has_image && layout == Layout::ImageRight {
        return rect(0.82, 5.98, 5.65, 0.72);
    }
    match layout {
        Layout::Insight | Layout::Statement => rect(0.9, 6.08, 11.15, 0.68),
        Layout::Cover | Layout::Section => rect(0.9, 6.02, 6.2, 0.72),
        Layout::Metrics | Layout::Process | Layout::Comparison | Layout::Grid => {
            rect(0.84, 6.48, 10.2, 0.32)
        }
        _ => rect(0.84, 5.9, 11.65, 0.68),
    }
}

fn item_rect_with_takeaway(layout: Layout, index: usize, count: usize, has_takeaway: bool) -> Rect {
    match layout {
        Layout::Metrics => {
            let cols = count.clamp(2, 4);
            let col = index % cols;
            let width = (11.55 - (cols - 1) as f64 * 0.18) / cols as f64;
            rect(
                0.9 + col as f64 * (width + 0.18),
                if has_takeaway { 4.08 } else { 3.98 },
                width,
                if has_takeaway { 1.92 } else { 2.08 },
            )
        }
        Layout::Process => {
            let width = 11.15 / count as f64;
            rect(
                0.9 + index as f64 * width,
                if has_takeaway { 3.95 } else { 3.82 },
                width - 0.12,
                if has_takeaway { 2.25 } else { 2.4 },
            )
        }
        Layout::Comparison => rect(
            0.9 + index as f64 * 5.85,
            if has_takeaway { 4.02 } else { 3.96 },
            5.45,
            if has_takeaway { 2.10 } else { 2.26 },
        ),
        Layout::Grid => {
            let cols = 3;
            let col = index % cols;
            let row = index / cols;
            let width = 3.72;
            rect(
                0.88 + col as f64 * 3.91,
                if has_takeaway { 4.08 } else { 4.02 } + row as f64 * 1.16,
                width,
                if has_takeaway { 1.02 } else { 1.1 },
            )
        }
        _ => rect(0.9, 2.5, 5.5, 1.7),
    }
}

#[derive(Debug, Copy, Clone)]
struct ItemTextRegion {
    area: Rect,
    pt: u32,
    line_pt: i64,
    max_lines: usize,
}

// Planning and OOXML rendering share the exact text rectangles and typography.
// In particular, comparison panels have inner padding and process values must
// fit their small node instead of being accepted and then silently discarded.
fn item_text_regions(layout: Layout, area: Rect, has_value: bool) -> [ItemTextRegion; 3] {
    let region =
        |x: f64, y: f64, w: f64, h: f64, pt: u32, line_pt: i64, max_lines: usize| ItemTextRegion {
            area: Rect {
                x: area.x + inch(x),
                y: area.y + inch(y),
                w: area.w - inch(w),
                h: inch(h),
            },
            pt,
            line_pt,
            max_lines,
        };
    match layout {
        Layout::Metrics => {
            let title_y = if has_value { 0.68 } else { 0.05 };
            [
                region(0.22, title_y, 0.32, 0.38, 18, 23, 1),
                region(0.22, 0.05, 0.32, 0.61, 34, 40, 1),
                region(0.22, title_y + 0.43, 0.32, 0.68, 14, 18, 2),
            ]
        }
        Layout::Process => {
            let body_height = area.h as f64 / 914400.0 - 1.48;
            [
                region(0.0, 0.8, 0.0, 0.68, 18, 23, 2),
                ItemTextRegion {
                    area: Rect {
                        x: area.x + area.w / 2 - inch(0.35),
                        y: area.y + inch(0.10),
                        w: inch(0.70),
                        h: inch(0.45),
                    },
                    pt: 13,
                    line_pt: 15,
                    max_lines: 2,
                },
                region(
                    0.04,
                    1.48,
                    0.08,
                    body_height,
                    15,
                    20,
                    ((body_height * 72.0 / 20.0).floor() as usize).min(3),
                ),
            ]
        }
        Layout::Comparison => {
            let title_y = 0.12;
            let title_h = 0.72;
            let value_y = 0.90;
            let value_h = 0.38;
            let body_y = if has_value { 1.34 } else { 0.94 };
            let body_height_emu = (area.h - inch(body_y) - inch(0.12)).max(inch(0.40));
            let body_height = body_height_emu as f64 / 914400.0;
            let body_pt = if has_value { 15 } else { 17 };
            let line_pt = if has_value { 19 } else { 21 };
            let max_lines = (body_height_emu / (line_pt * EMU_PER_PT)).max(1) as usize;
            [
                region(0.30, title_y, 0.58, title_h, 19, 23, 2),
                region(0.30, value_y, 0.58, value_h, 18, 22, 1),
                region(0.30, body_y, 0.58, body_height, body_pt, line_pt, max_lines),
            ]
        },
        Layout::Grid => [
            region(0.18, 0.0, 0.20, 0.42, 20, 26, 1),
            region(0.18, 0.36, 0.20, 0.28, 14, 18, 1),
            region(
                0.18,
                if has_value { 0.72 } else { 0.48 },
                0.20,
                if has_value { 0.36 } else { 0.64 },
                17,
                22,
                if has_value { 1 } else { 2 },
            ),
        ],
        _ => unreachable!("Item text regions require a structured layout"),
    }
}

fn choose_layout(s: &ChatPresentationSlide, index: usize) -> Layout {
    if index == 0 {
        return Layout::Cover;
    }
    if s.items.len() == 2
        || (s.items.is_empty() && (s.left_title.is_some() || s.right_title.is_some()))
    {
        return Layout::Comparison;
    }
    if s.items.len() >= 3 && s.items.len() <= 6 {
        if s.items.len() <= 4 && s.items.iter().all(|item| item.value.is_some()) {
            return Layout::Metrics;
        }
        if (3..=5).contains(&s.items.len()) && s.items.iter().all(|item| item.body.is_some()) {
            return Layout::Process;
        }
        return Layout::Grid;
    }
    if (3..=6).contains(&s.bullets.len()) {
        return Layout::Grid;
    }
    if s.bullets.len() == 2 {
        return Layout::Comparison;
    }
    if s.takeaway.is_some() {
        return Layout::Insight;
    }
    if s.image_attachment_id.is_some() {
        return Layout::ImageRight;
    }
    if !s.bullets.is_empty() {
        return if index.is_multiple_of(2) {
            Layout::Statement
        } else {
            Layout::Content
        };
    }
    if s.body
        .as_deref()
        .is_some_and(|body| body.chars().count() <= 150)
    {
        return Layout::Statement;
    }
    Layout::Content
}

fn plan_presentation(
    p: &ChatPresentation,
    images: &HashMap<String, PresentationImage>,
) -> Result<Plan, String> {
    let palette = validate_model(p)?;
    let accent = p
        .accent_color
        .as_deref()
        .map(normalize_color)
        .transpose()?
        .unwrap_or_else(|| palette.accent.to_owned());
    let requested_style = DesignStyle::parse(p.design_style.as_deref())?;
    let style = if requested_style == DesignStyle::Adaptive { DesignStyle::Custom } else { requested_style };
    let mut plan = Plan {
        palette,
        accent,
        style,
        pages: Vec::new(),
        media: Vec::new(),
        warnings: Vec::new(),
    };
    let mut media_indices: HashMap<&str, usize> = HashMap::new();
    let mut image_bytes = 0usize;
    for (source, s) in p.slides.iter().enumerate() {
        let label = format!("Slide {}", source + 1);
        let mut layout = if let Some(requested) = s.layout.as_deref() {
            Layout::parse(Some(requested))?
        } else {
            choose_layout(s, source)
        };
        if layout == Layout::Canvas {
            if plan.pages.len() >= MAX_OUTPUT_SLIDES { return Err(format!("Presentation exceeds {MAX_OUTPUT_SLIDES} output slides")); }
            plan.pages.push(Page {
                source, continuation: 0, layout,
                title: Vec::new(), title_pt: 32, subtitle: Vec::new(), subtitle_pt: 17,
                body_pt: 22, body_line_pt: 28, body_gap_pt: 0,
                left_rect: rect(0.0, 0.0, 0.0, 0.0), right_rect: rect(0.0, 0.0, 0.0, 0.0),
                elements: s.elements.clone(), left: Vec::new(), right: Vec::new(),
                image_index: None, caption: Vec::new(), notes: s.notes.clone(),
                eyebrow: Vec::new(), takeaway: Vec::new(), items: Vec::new(),
                background_color: s.background_color.as_deref().map(normalize_color).transpose()?,
            });
            continue;
        }
        let image_index = if let Some(id) = s.image_attachment_id.as_deref() {
            let image = images.get(id).ok_or_else(|| {
                format!("{label}: requested imageAttachmentId is not present in trusted image map")
            })?;
            if let Some(&idx) = media_indices.get(id) {
                Some(idx)
            } else {
                let extension = validate_image(image).map_err(|e| format!("{label}: {e}"))?;
                image_bytes += image.bytes.len();
                if image_bytes > MAX_TOTAL_IMAGE_BYTES {
                    return Err("Presentation exceeds 100 MiB of unique embedded images".into());
                }
                let idx = plan.media.len();
                plan.media.push(Media {
                    id: id.to_owned(),
                    extension,
                });
                media_indices.insert(id, idx);
                Some(idx)
            }
        } else {
            None
        };
        let has_image = image_index.is_some();
        if !has_image && matches!(layout, Layout::ImageLeft | Layout::ImageRight) {
            return Err(format!(
                "{label}: image-left/image-right requires imageAttachmentId"
            ));
        }
        if has_image
            && !matches!(
                layout,
                Layout::Cover | Layout::ImageLeft | Layout::ImageRight
            )
        {
            plan.warnings.push(format!("{label}: layout changed to image-right to keep the image and all text within separate slide regions"));
            layout = Layout::ImageRight;
        }
        let title_area = title_rect(layout, has_image);
        if title_area.x < 0
            || title_area.y < 0
            || title_area.x + title_area.w > SLIDE_W
            || title_area.y + title_area.h > SLIDE_H
        {
            return Err(format!("{label}: title geometry leaves slide bounds"));
        }
        if has_image {
            let photo = picture_rect(layout, s.image_caption.is_some(), s.takeaway.is_some());
            if photo.x < 0
                || photo.y < 0
                || photo.x + photo.w > SLIDE_W
                || photo.y + photo.h > SLIDE_H
            {
                return Err(format!("{label}: image geometry leaves slide bounds"));
            }
        }
        let following = layout.continuation(has_image);
        let subtitle = s
            .subtitle
            .as_deref()
            .or({
                if source == 0 {
                    p.subtitle.as_deref()
                } else {
                    None
                }
            })
            .unwrap_or("");
        let has_subtitle = !subtitle.is_empty();
        let bullets_promoted = s.items.is_empty()
            && matches!(layout, Layout::Grid | Layout::Comparison)
            && !s.bullets.is_empty();
        let mut source_items = s.items.clone();
        if source_items.is_empty()
            && matches!(layout, Layout::Grid | Layout::Comparison)
            && !s.bullets.is_empty()
        {
            source_items = s
                .bullets
                .iter()
                .map(|bullet| PresentationItem {
                    title: bullet.clone(),
                    body: None,
                    value: None,
                })
                .collect();
        }
        if layout == Layout::Comparison && source_items.is_empty() && !has_image {
            if s.left_title.is_none() || s.right_title.is_none() {
                return Err(format!("{label}: comparison layout requires exactly two items or both leftTitle and rightTitle"));
            }
            source_items.push(PresentationItem {
                title: s.left_title.clone().unwrap(),
                body: s.left_body.clone(),
                value: None,
            });
            source_items.push(PresentationItem {
                title: s.right_title.clone().unwrap(),
                body: s.right_body.clone(),
                value: None,
            });
        }
        if layout == Layout::Comparison && s.items.len() == 2 {
            for (index, item) in source_items.iter_mut().take(2).enumerate() {
                let extra = if index == 0 {
                    [s.left_title.as_deref(), s.left_body.as_deref()]
                } else {
                    [s.right_title.as_deref(), s.right_body.as_deref()]
                };
                let extra_text = extra
                    .into_iter()
                    .flatten()
                    .filter(|text| !text.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n");
                if !extra_text.is_empty() {
                    let merged = match item.body.take() {
                        Some(existing) if !existing.is_empty() => {
                            format!("{existing}\n{extra_text}")
                        }
                        _ => extra_text,
                    };
                    item.body = Some(merged);
                }
            }
        }
        let structured_layout_requested = matches!(
            layout,
            Layout::Metrics | Layout::Process | Layout::Comparison | Layout::Grid
        );
        if has_image && structured_layout_requested {
            plan.warnings.push(format!("{label}: image-right layout selected to preserve both the image and structured items"));
            layout = Layout::ImageRight;
        }
        let planned_items: Vec<PlannedItem> = if matches!(
            layout,
            Layout::Metrics | Layout::Process | Layout::Comparison | Layout::Grid
        ) {
            let valid = match layout {
                Layout::Metrics => (2..=4).contains(&source_items.len()),
                Layout::Process => (3..=5).contains(&source_items.len()),
                Layout::Comparison => source_items.len() == 2,
                Layout::Grid => (3..=6).contains(&source_items.len()),
                _ => false,
            };
            if !valid {
                return Err(format!(
                    "{label}: {} layout requires {} items",
                    layout_name(layout),
                    match layout {
                        Layout::Metrics => "2–4",
                        Layout::Process => "3–5",
                        Layout::Comparison => "exactly 2",
                        Layout::Grid => "3–6",
                        _ => "a supported number of",
                    }
                ));
            }
            source_items
                .iter()
                .enumerate()
                .map(|(i, item)| {
                    let area = if layout == Layout::Comparison {
                        comparison_item_rect(i, has_subtitle, s.body.as_deref().is_some_and(|v| !v.trim().is_empty()) || (!s.bullets.is_empty() && !bullets_promoted), s.takeaway.is_some())
                    } else {
                        item_rect_with_takeaway(layout, i, source_items.len(), s.takeaway.is_some())
                    };
                    let [title, value, body] = item_text_regions(
                        layout,
                        area,
                        item.value.as_deref().is_some_and(|v| !v.is_empty()),
                    );
                    Ok(PlannedItem {
                        area,
                        title: fit_item_text(&item.title, title, &format!("{label} item {} title", i + 1))?,
                        body: fit_item_text(item.body.as_deref().unwrap_or(""), body, &format!("{label} item {} body", i + 1))?,
                        value: fit_item_text(item.value.as_deref().unwrap_or(""), value, &format!("{label} item {} value", i + 1))?,
                    })
                })
                .collect::<Result<Vec<_>, String>>()?
        } else {
            Vec::new()
        };
        let mut elements = s.elements.clone();
        if !elements.is_empty() && !matches!(layout, Layout::Cover | Layout::Section) && s.takeaway.is_some() {
            let lower = elements.iter().filter(|e| e.y >= 65.0).collect::<Vec<_>>();
            if !lower.is_empty() {
                let bottom = lower.iter().map(|e| f64::from(e.y + e.height)).fold(0.0f64, f64::max);
                let safe_bottom = (takeaway_rect(layout, has_image).y - inch(0.2)) as f64 * 100.0 / SLIDE_H as f64;
                let shift = (bottom - safe_bottom).max(0.0) as f32;
                for element in elements.iter_mut().filter(|e| e.y >= 65.0) { element.y -= shift; }
            }
        }
        let first_rect = reserve_element_band(body_rect(layout, has_image, has_subtitle, false, s.takeaway.is_some()), &elements);
        let right_rect = reserve_element_band(body_rect(layout, has_image, has_subtitle, true, s.takeaway.is_some()), &elements);
        let next_rect = body_rect(
            following,
            has_image,
            has_subtitle,
            false,
            s.takeaway.is_some(),
        );
        let width = first_rect.w.min(next_rect.w);
        let body_pt = body_typography(layout).0.max(body_typography(following).0);
        let mut left = Vec::new();
        let mut right = Vec::new();
        let structured_layout = matches!(
            layout,
            Layout::Metrics | Layout::Process | Layout::Comparison | Layout::Grid
        );
        add_blocks(&mut left, s.body.as_deref(), false, false, width, body_pt);
        for b in if structured_layout && bullets_promoted {
            &[][..]
        } else {
            &s.bullets[..]
        } {
            // Even an explicitly empty bullet is retained as a native bullet.
            if b.is_empty() {
                left.push(Block {
                    lines: vec![String::new()],
                    bullet: true,
                    indented: true,
                    bold: false,
                });
            } else {
                add_blocks(&mut left, Some(b), true, false, width, body_pt);
            }
        }
        if !structured_layout {
            for item in &source_items {
                add_blocks(&mut left, Some(&item.title), false, true, width, body_pt);
                add_blocks(
                    &mut left,
                    item.value.as_deref(),
                    false,
                    true,
                    width,
                    body_pt,
                );
                add_blocks(
                    &mut left,
                    item.body.as_deref(),
                    false,
                    false,
                    width,
                    body_pt,
                );
            }
        }
        if layout != Layout::Comparison {
            add_blocks(
                &mut left,
                s.left_title.as_deref(),
                false,
                true,
                width,
                body_pt,
            );
            add_blocks(
                &mut left,
                s.left_body.as_deref(),
                false,
                false,
                width,
                body_pt,
            );
        }
        let target = if layout == Layout::TwoColumn {
            &mut right
        } else {
            &mut left
        };
        if layout != Layout::Comparison {
            add_blocks(
                target,
                s.right_title.as_deref(),
                false,
                true,
                width,
                body_pt,
            );
            add_blocks(
                target,
                s.right_body.as_deref(),
                false,
                false,
                width,
                body_pt,
            );
        }
        if layout != Layout::TwoColumn
            && layout != Layout::Comparison
            && (s.left_title.is_some()
                || s.left_body.is_some()
                || s.right_title.is_some()
                || s.right_body.is_some())
        {
            plan.warnings.push(format!(
                "{label}: column fields are rendered in reading order in the text area"
            ));
        }
        if structured_layout && (s.body.is_some() || (!s.bullets.is_empty() && !bullets_promoted)) {
            for block in &left {
                if block.lines.len() > 2 || left.iter().map(|b| b.lines.len()).sum::<usize>() > 2 {
                    return Err(format!("{label}: structured layouts allow at most two summary lines above their items; shorten the summary or move detail to item bodies/notes"));
                }
            }
        }
        for block in left.iter().chain(&right) {
            let available =
                width - 8 * EMU_PER_PT - if block.indented { 24 * EMU_PER_PT } else { 0 };
            if block
                .lines
                .iter()
                .any(|line| line_width(line, body_pt) > available)
            {
                return Err(format!(
                    "{label}: an unbreakable text sequence cannot fit at {body_pt} pt; shorten it"
                ));
            }
        }
        let (left, right, fitted_body_pt, fitted_body_line, fitted_body_gap) = fit_body_columns(
            left, right, width, first_rect.h.min(next_rect.h), body_pt,
        );
        let left_pages = paginate(left, first_rect.h, next_rect.h, fitted_body_line, fitted_body_line, fitted_body_gap)?;
        let right_pages = paginate(right, first_rect.h, next_rect.h, fitted_body_line, fitted_body_line, fitted_body_gap)?;
        // Do not drop overflowing sentences. Extremely long source text still
        // paginates at readable type; ordinary research beats fit as one page.
        let count = left_pages.len().max(right_pages.len());
        if plan.pages.len() + count > MAX_OUTPUT_SLIDES {
            return Err(format!("Presentation exceeds {MAX_OUTPUT_SLIDES} output slides; condense source content"));
        }
        let caption = if let Some(c) = &s.image_caption {
            short_text(c, inch(5.7), 14, 2, &format!("{label} imageCaption"))?
        } else {
            Vec::new()
        };
        let mut left_iter = left_pages.into_iter();
        let mut right_iter = right_pages.into_iter();
        for continuation in 0..count {
            let this_layout = if continuation == 0 { layout } else { following };
            let (title, title_pt) = fit_title(
                &s.title,
                title_rect(this_layout, has_image),
                this_layout.title_pt(),
                title_max_lines(this_layout),
                &format!("{label} title"),
            )?;
            let (subtitle_lines, subtitle_pt) = if has_subtitle {
                fit_text_block(
                    subtitle,
                    subtitle_rect(this_layout, has_image),
                    subtitle_typography(this_layout).0,
                    2,
                    &format!("{label} subtitle"),
                )?
            } else {
                (Vec::new(), subtitle_typography(this_layout).0)
            };
            plan.pages.push(Page {
                source,
                continuation,
                layout: this_layout,
                title,
                title_pt,
                subtitle: subtitle_lines,
                subtitle_pt,
                body_pt: fitted_body_pt,
                body_line_pt: fitted_body_line,
                body_gap_pt: fitted_body_gap,
                left_rect: first_rect,
                right_rect,
                elements: elements.clone(),
                left: left_iter.next().unwrap_or_default(),
                right: right_iter.next().unwrap_or_default(),
                image_index,
                caption: caption.clone(),
                notes: merge_speaker_notes(
                    s.notes.as_deref(),
                    &planned_items.iter().flat_map(|item| [
                        item.title.overflow.clone(), item.value.overflow.clone(), item.body.overflow.clone(),
                    ]).flatten().collect::<Vec<_>>(),
                ),
                eyebrow: if continuation == 0 {
                    s.eyebrow
                        .as_deref()
                        .map(|v| {
                            short_text(
                                v,
                                title_rect(this_layout, has_image).w,
                                14,
                                1,
                                &format!("{label} eyebrow"),
                            )
                        })
                        .transpose()?
                        .unwrap_or_default()
                } else {
                    Vec::new()
                },
                takeaway: if continuation == 0 {
                    s.takeaway
                        .as_deref()
                        .map(|v| {
                            let max_lines = match this_layout {
                                Layout::Insight => 2,
                                Layout::Metrics
                                | Layout::Process
                                | Layout::Comparison
                                | Layout::Grid => 1,
                                _ => 2,
                            };
                            short_text(
                                v,
                                takeaway_rect(this_layout, has_image).w - inch(0.2),
                                16,
                                max_lines,
                                &format!("{label} takeaway"),
                            )
                        })
                        .transpose()?
                        .unwrap_or_default()
                } else {
                    Vec::new()
                },
                items: planned_items.clone(),
                background_color: s
                    .background_color
                    .as_deref()
                    .map(normalize_color)
                    .transpose()?,
            });
        }
        if count > 1 {
            plan.warnings.push(format!("{label}: dense content requires {count} readable slides; condense the authored content before final delivery"));
        }
    }
    Ok(plan)
}

fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

fn xml_root(name: &str) -> String {
    format!("{XML_HEADER}<p:{name} xmlns:a=\"{A_NS}\" xmlns:r=\"{R_NS}\" xmlns:p=\"{P_NS}\">")
}

fn group_tree() -> &'static str {
    "<p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>"
}

fn xfrm(r: Rect) -> String {
    format!(
        "<a:xfrm><a:off x=\"{}\" y=\"{}\"/><a:ext cx=\"{}\" cy=\"{}\"/></a:xfrm>",
        r.x, r.y, r.w, r.h
    )
}

fn font_elements() -> String {
    format!("<a:latin typeface=\"{FONT}\"/><a:ea typeface=\"{FONT}\"/><a:cs typeface=\"{FONT}\"/>")
}

fn run_properties(pt: u32, color: &str, bold: bool) -> String {
    format!("<a:rPr lang=\"zh-CN\" altLang=\"en-US\" sz=\"{}\" b=\"{}\" dirty=\"0\"><a:solidFill><a:srgbClr val=\"{color}\"/></a:solidFill>{}</a:rPr>", pt * 100, u8::from(bold), font_elements())
}

fn paragraph(block: &Block, pt: u32, line_pt: i64, color: &str, gap_pt: i64) -> String {
    let margin = if block.indented { 24 * EMU_PER_PT } else { 0 };
    let indent = if block.bullet { -18 * EMU_PER_PT } else { 0 };
    let mut s = format!("<a:p><a:pPr marL=\"{margin}\" indent=\"{indent}\" algn=\"l\"><a:lnSpc><a:spcPts val=\"{}\"/></a:lnSpc><a:spcAft><a:spcPts val=\"{}\"/></a:spcAft>", line_pt * 100, gap_pt * 100);
    if block.bullet {
        s.push_str("<a:buFont typeface=\"{FONT}\"/><a:buChar char=\"&#8226;\"/>");
    } else {
        s.push_str("<a:buNone/>");
    }
    s.push_str("</a:pPr>");
    let props = run_properties(pt, color, block.bold);
    for (i, line) in block.lines.iter().enumerate() {
        if i > 0 {
            write!(s, "<a:br>{props}</a:br>").unwrap();
        }
        write!(
            s,
            "<a:r>{props}<a:t xml:space=\"preserve\">{}</a:t></a:r>",
            escape(line)
        )
        .unwrap();
    }
    write!(
        s,
        "<a:endParaRPr lang=\"zh-CN\" sz=\"{}\"/></a:p>",
        pt * 100
    )
    .unwrap();
    s
}

struct TextStyle<'a> {
    pt: u32,
    line_pt: i64,
    color: &'a str,
    gap_pt: i64,
}

fn text_box(
    id: u32,
    name: &str,
    r: Rect,
    blocks: &[Block],
    style: TextStyle<'_>,
    placeholder: Option<&str>,
) -> String {
    let ph = placeholder
        .map(|kind| format!("<p:ph type=\"{kind}\" idx=\"1\"/>"))
        .unwrap_or_default();
    let mut s = format!("<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"{}\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr>{ph}</p:nvPr></p:nvSpPr><p:spPr>{}<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap=\"square\" lIns=\"0\" tIns=\"0\" rIns=\"0\" bIns=\"0\" anchor=\"t\" vertOverflow=\"overflow\" horzOverflow=\"overflow\"><a:noAutofit/></a:bodyPr><a:lstStyle/>", escape(name), xfrm(r));
    if blocks.is_empty() {
        s.push_str("<a:p/>");
    }
    for block in blocks {
        s.push_str(&paragraph(
            block,
            style.pt,
            style.line_pt,
            style.color,
            style.gap_pt,
        ));
    }
    s.push_str("</p:txBody></p:sp>");
    s
}

fn lines_block(lines: &[String], bold: bool) -> Vec<Block> {
    vec![Block {
        lines: lines.to_vec(),
        bullet: false,
        indented: false,
        bold,
    }]
}

fn contained(box_rect: Rect, width: u32, height: u32) -> Rect {
    let w = i64::from(width);
    let h = i64::from(height);
    let (cx, cy) = if box_rect.w * h <= box_rect.h * w {
        (box_rect.w, (box_rect.w * h / w).max(1))
    } else {
        ((box_rect.h * w / h).max(1), box_rect.h)
    };
    Rect {
        x: box_rect.x + (box_rect.w - cx) / 2,
        y: box_rect.y + (box_rect.h - cy) / 2,
        w: cx,
        h: cy,
    }
}

fn picture(id: u32, r: Rect, description: &str) -> String {
    format!("<p:pic><p:nvPicPr><p:cNvPr id=\"{id}\" name=\"Embedded image\" descr=\"{}\"/><p:cNvPicPr><a:picLocks noChangeAspect=\"1\"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed=\"rId2\"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>{}<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr></p:pic>", escape(description), xfrm(r))
}

fn native_shape(
    id: u32,
    name: &str,
    area: Rect,
    geometry: &str,
    fill: &str,
    alpha: Option<u32>,
    stroke: Option<&str>,
) -> String {
    let fill_xml = if fill == "none" {
        "<a:noFill/>".to_owned()
    } else if let Some(alpha) = alpha {
        format!("<a:solidFill><a:srgbClr val=\"{fill}\"><a:alpha val=\"{alpha}\"/></a:srgbClr></a:solidFill>")
    } else {
        format!("<a:solidFill><a:srgbClr val=\"{fill}\"/></a:solidFill>")
    };
    let line_xml = stroke
        .map(|c| {
            format!("<a:ln w=\"12700\"><a:solidFill><a:srgbClr val=\"{c}\"/></a:solidFill></a:ln>")
        })
        .unwrap_or_else(|| "<a:ln><a:noFill/></a:ln>".into());
    format!("<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"{}\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>{}<a:prstGeom prst=\"{geometry}\"><a:avLst/></a:prstGeom>{fill_xml}{line_xml}</p:spPr></p:sp>", escape(name), xfrm(area))
}

fn accent_ink(hex: &str) -> &'static str {
    let bytes = [
        u8::from_str_radix(&hex[0..2], 16).unwrap_or(37),
        u8::from_str_radix(&hex[2..4], 16).unwrap_or(99),
        u8::from_str_radix(&hex[4..6], 16).unwrap_or(235),
    ];
    let linear = bytes.map(|value| {
        let c = f64::from(value) / 255.0;
        if c <= 0.04045 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    });
    let luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    let dark_contrast = (luminance + 0.05) / 0.05;
    let light_contrast = 1.05 / (luminance + 0.05);
    if dark_contrast >= light_contrast {
        "172033"
    } else {
        "FFFFFF"
    }
}

fn cover_background(palette: &Palette, style: DesignStyle) -> &'static str {
    match style {
        DesignStyle::Editorial => match palette.name {
            "Warm" => "30271F",
            "Dark" => "0B111B",
            _ => "172033",
        },
        DesignStyle::Technical => match palette.name {
            "Warm" => "273440",
            "Dark" => "0D1A29",
            _ => "102238",
        },
        DesignStyle::Minimal | DesignStyle::Soft | DesignStyle::Custom | DesignStyle::Adaptive => palette.background,
        DesignStyle::Cinematic => match palette.name { "Warm" => "211D24", "Dark" => "080A10", _ => "11131B" },
        DesignStyle::Brutalist => match palette.name { "Warm" => "211F1B", "Dark" => "050505", _ => "111111" },
    }
}

fn draw_page_motif(out: &mut String, page: &Page, plan: &Plan, palette: &Palette, id: &mut u32) {
    let accent = &plan.accent;
    match page.layout {
        Layout::Cover => {
            if page.image_index.is_some() {
                let photo = picture_rect(
                    Layout::Cover,
                    !page.caption.is_empty(),
                    !page.takeaway.is_empty(),
                );
                let pad = inch(0.11);
                out.push_str(&native_shape(
                    *id,
                    "Cover image matte",
                    Rect {
                        x: photo.x - pad,
                        y: photo.y - pad,
                        w: photo.w + pad * 2,
                        h: photo.h + pad * 2,
                    },
                    "roundRect",
                    palette.panel_alt,
                    None,
                    Some(palette.rule),
                ));
                *id += 1;
            }
            match plan.style {
                DesignStyle::Editorial => {
                    out.push_str(&native_shape(*id, "Cover color field", rect(8.8, 0.8, 3.45, 5.3), "rect", accent, Some(18000), None)); *id += 1;
                    out.push_str(&native_shape(*id, "Cover circle", rect(9.5, 1.55, 2.4, 2.4), "ellipse", accent, None, None)); *id += 1;
                    if page.image_index.is_none() { out.push_str(&native_shape(*id, "Secondary circle", rect(8.75, 4.15, 1.2, 1.2), "ellipse", palette.panel_alt, None, None)); *id += 1; }
                }
                DesignStyle::Technical => {
                    for x in [7.65, 8.6, 9.55, 10.5, 11.45, 12.1] { out.push_str(&native_shape(*id, "Technical vertical grid", rect(x, 0.75, 0.012, 5.8), "rect", "71839A", Some(27000), None)); *id += 1; }
                    for y in [1.2, 2.15, 3.1, 4.05, 5.0, 5.95] { out.push_str(&native_shape(*id, "Technical horizontal grid", rect(7.65, y, 4.45, 0.012), "rect", "71839A", Some(27000), None)); *id += 1; }
                    out.push_str(&native_shape(*id, "Technical marker", rect(8.2, 2.2, 2.8, 2.8), "ellipse", "none", None, Some(accent))); *id += 1;
                }
                DesignStyle::Minimal => {
                    out.push_str(&native_shape(*id, "Minimal cover accent", rect(0.42, 1.48, 0.12, 3.35), "rect", accent, None, None)); *id += 1;
                    out.push_str(&native_shape(*id, "Minimal underline", rect(0.9, 5.42, 1.0, 0.055), "rect", accent, None, None)); *id += 1;
                }
                DesignStyle::Cinematic => {
                    out.push_str(&native_shape(*id, "Cinematic frame", rect(7.55, 0.72, 4.7, 5.95), "rect", palette.panel_alt, Some(52000), None)); *id += 1;
                    out.push_str(&native_shape(*id, "Cinematic light", rect(9.0, 1.0, 3.25, 3.25), "ellipse", accent, Some(24000), None)); *id += 1;
                    out.push_str(&native_shape(*id, "Cinematic horizon", rect(7.55, 5.9, 4.7, 0.12), "rect", accent, None, None)); *id += 1;
                }
                DesignStyle::Brutalist => {
                    out.push_str(&native_shape(*id, "Brutalist block", rect(8.05, 1.0, 4.25, 5.65), "rect", accent, None, None)); *id += 1;
                    out.push_str(&native_shape(*id, "Brutalist cutout", rect(8.55, 1.55, 3.25, 2.65), "rect", palette.background, None, None)); *id += 1;
                    out.push_str(&native_shape(*id, "Brutalist base", rect(7.55, 5.95, 4.75, 0.2), "rect", palette.text, None, None)); *id += 1;
                }
                DesignStyle::Soft => {
                    out.push_str(&native_shape(*id, "Soft cover field", rect(8.1, 0.82, 4.1, 5.85), "roundRect", palette.panel_alt, None, None)); *id += 1;
                    out.push_str(&native_shape(*id, "Soft cover bloom", rect(9.0, 1.4, 2.8, 2.8), "ellipse", accent, Some(46000), None)); *id += 1;
                    out.push_str(&native_shape(*id, "Soft cover pebble", rect(8.55, 4.8, 1.2, 1.2), "ellipse", palette.panel, None, None)); *id += 1;
                }
                DesignStyle::Adaptive | DesignStyle::Custom => {}
            }
        }
        Layout::Section => match plan.style {
            DesignStyle::Editorial | DesignStyle::Technical => {
                out.push_str(&native_shape(*id, "Section accent block", rect(10.6, 0.8, 1.55, 5.8), "rect", accent, Some(18000), None)); *id += 1;
                out.push_str(&native_shape(*id, "Section index ring", rect(10.95, 2.25, 0.85, 0.85), "ellipse", "none", None, Some("FFFFFF"))); *id += 1;
            }
            DesignStyle::Minimal => { out.push_str(&native_shape(*id, "Minimal section rule", rect(0.85, 4.65, 1.2, 0.07), "rect", accent, None, None)); *id += 1; }
            DesignStyle::Cinematic => {
                out.push_str(&native_shape(*id, "Cinematic section panel", rect(9.8, 0.65, 2.6, 6.0), "rect", accent, Some(26000), None)); *id += 1;
                out.push_str(&native_shape(*id, "Cinematic section line", rect(9.8, 6.25, 2.6, 0.14), "rect", palette.panel, None, None)); *id += 1;
            }
            DesignStyle::Brutalist => {
                out.push_str(&native_shape(*id, "Brutalist section block", rect(10.8, 0.75, 1.45, 5.9), "rect", accent, None, None)); *id += 1;
                out.push_str(&native_shape(*id, "Brutalist section cut", rect(11.1, 2.25, 0.85, 0.85), "rect", palette.background, None, None)); *id += 1;
            }
            DesignStyle::Soft => {
                out.push_str(&native_shape(*id, "Soft section field", rect(10.15, 0.85, 2.15, 5.7), "roundRect", palette.panel_alt, None, None)); *id += 1;
                out.push_str(&native_shape(*id, "Soft section bloom", rect(10.75, 2.0, 1.2, 1.2), "ellipse", accent, Some(42000), None)); *id += 1;
            }
            DesignStyle::Adaptive | DesignStyle::Custom => {}
        },
        Layout::Comparison => {
            for (index, item) in page.items.iter().enumerate() {
                out.push_str(&native_shape(*id,
                    if index == 0 { "Comparison left field" } else { "Comparison right field" },
                    item.area, "rect", if index == 0 { palette.panel } else { palette.panel_alt }, None, Some(palette.rule)));
                *id += 1;
                out.push_str(&native_shape(*id, "Comparison accent", Rect { w: inch(0.045), ..item.area }, "rect", accent, None, None));
                *id += 1;
            }
        }
        Layout::TwoColumn => {
            // Flat editorial columns: let the text geometry own the space,
            // rather than placing an unrelated panel behind only half its body.
            out.push_str(&native_shape(*id, "Two-column divider",
                rect(6.52, 2.4, 0.018, 3.15), "rect", palette.rule, None, None));
            *id += 1;
        }
        Layout::Content => {
            if plan.style == DesignStyle::Editorial {
                out.push_str(&native_shape(
                    *id,
                    "Editorial content rail",
                    rect(0.82, 2.96, 0.06, 3.78),
                    "rect",
                    accent,
                    None,
                    None,
                ));
                *id += 1;
            }
        }
        Layout::Grid | Layout::Canvas => {}
        Layout::Metrics => {}
        Layout::Process => {
            if page.items.len() > 1 {
                let first = item_rect_with_takeaway(
                    Layout::Process,
                    0,
                    page.items.len(),
                    !page.takeaway.is_empty(),
                );
                let last = item_rect_with_takeaway(
                    Layout::Process,
                    page.items.len() - 1,
                    page.items.len(),
                    !page.takeaway.is_empty(),
                );
                let y = (item_rect_with_takeaway(
                    Layout::Process,
                    0,
                    page.items.len(),
                    !page.takeaway.is_empty(),
                )
                .y + inch(0.33)) as f64
                    / 914400.0;
                out.push_str(&native_shape(
                    *id,
                    "Process timeline",
                    rect(
                        (first.x + inch(0.34)) as f64 / 914400.0,
                        y,
                        (last.x + last.w - first.x - inch(0.68)) as f64 / 914400.0,
                        0.035,
                    ),
                    "rect",
                    palette.rule,
                    None,
                    None,
                ));
                *id += 1;
            }
        }
        Layout::ImageLeft | Layout::ImageRight => {
            let photo = picture_rect(
                page.layout,
                !page.caption.is_empty(),
                !page.takeaway.is_empty(),
            );
            let pad = inch(0.11);
            out.push_str(&native_shape(
                *id,
                "Image matte",
                Rect {
                    x: photo.x - pad,
                    y: photo.y - pad,
                    w: photo.w + 2 * pad,
                    h: photo.h + 2 * pad,
                },
                "roundRect",
                palette.panel_alt,
                None,
                Some(palette.rule),
            ));
            *id += 1;
            if matches!(plan.style, DesignStyle::Editorial | DesignStyle::Soft) {
                let rail = if page.layout == Layout::ImageLeft {
                    6.78
                } else {
                    0.65
                };
                out.push_str(&native_shape(
                    *id,
                    "Editorial side rail",
                    rect(rail, 2.88, 0.055, 3.82),
                    "rect",
                    accent,
                    None,
                    None,
                ));
                *id += 1;
            }
            if plan.style == DesignStyle::Technical {
                out.push_str(&native_shape(
                    *id,
                    "Technical title rule",
                    rect(0.82, 2.96, 11.55, 0.012),
                    "rect",
                    palette.rule,
                    None,
                    None,
                ));
                *id += 1;
            }
        }
        Layout::Statement | Layout::Insight => {
            if matches!(plan.style, DesignStyle::Editorial | DesignStyle::Brutalist) {
                out.push_str(&native_shape(
                    *id,
                    "Editorial title accent",
                    rect(0.82, 0.87, 0.075, 1.28),
                    "rect",
                    accent,
                    None,
                    None,
                ));
                *id += 1;
            }
            if plan.style == DesignStyle::Technical {
                out.push_str(&native_shape(
                    *id,
                    "Technical title rule",
                    rect(0.82, 3.12, 11.55, 0.012),
                    "rect",
                    palette.rule,
                    None,
                    None,
                ));
                *id += 1;
            }
            if plan.style == DesignStyle::Soft && !page.takeaway.is_empty() {
                out.push_str(&native_shape(*id, "Soft takeaway ground", takeaway_rect(page.layout, page.image_index.is_some()), "roundRect", palette.panel_alt, None, None));
                *id += 1;
            }
        }
    }
}

fn item_shapes(page: &Page, plan: &Plan, palette: &Palette, start_id: u32) -> (String, u32) {
    let mut out = String::new();
    let mut id = start_id;
    for (index, item) in page.items.iter().enumerate() {
        let area = item.area;
        let regions = item_text_regions(page.layout, area, !item.value.lines.is_empty());
        match page.layout {
            Layout::Metrics | Layout::Grid => {
                out.push_str(&native_shape(
                    id,
                    if page.layout == Layout::Metrics {
                        "Metric accent"
                    } else {
                        "Grid item marker"
                    },
                    Rect {
                        x: area.x,
                        y: area.y + inch(0.04),
                        w: inch(0.05),
                        h: if page.layout == Layout::Metrics {
                            area.h - inch(0.16)
                        } else {
                            inch(0.32)
                        },
                    },
                    "rect",
                    &plan.accent,
                    None,
                    None,
                ));
                id += 1;
            }
            Layout::Process => {
                out.push_str(&native_shape(
                    id,
                    "Process node",
                    Rect {
                        x: area.x + area.w / 2 - inch(0.31),
                        y: area.y + inch(0.02),
                        w: inch(0.62),
                        h: inch(0.62),
                    },
                    "ellipse",
                    if index == 0 {
                        &plan.accent
                    } else {
                        palette.panel
                    },
                    None,
                    Some(&plan.accent),
                ));
                id += 1;
            }
            _ => {}
        }
        let marker = vec![format!("{:02}", index + 1)];
        for (field, fitted, mut region) in [
            (0usize, &item.title, regions[0]),
            (1usize, &item.value, regions[1]),
            (2usize, &item.body, regions[2]),
        ] {
            region.pt = fitted.pt;
            region.line_pt = fitted.line_pt;
            let lines = if field == 1 && page.layout == Layout::Process && fitted.lines.is_empty() {
                &marker
            } else {
                &fitted.lines
            };
            if lines.is_empty() {
                continue;
            }
            let name = match (page.layout, field) {
                (Layout::Metrics, 0) => "Metric label",
                (Layout::Metrics, 1) => "Metric value",
                (Layout::Metrics, _) => "Metric detail",
                (Layout::Process, 0) => "Process step",
                (Layout::Process, 1) => "Process marker",
                (Layout::Process, _) => "Process detail",
                (Layout::Comparison, 0) => "Comparison heading",
                (Layout::Comparison, 1) => "Comparison value",
                (Layout::Comparison, _) => "Comparison detail",
                (_, 0) => "Grid item title",
                (_, 1) => "Grid item value",
                (_, _) => "Grid item detail",
            };
            let color = if field == 1 && page.layout == Layout::Process && index == 0 {
                accent_ink(&plan.accent)
            } else if field == 1 || (field == 0 && page.layout == Layout::Comparison && index == 0)
            {
                &plan.accent
            } else if field == 2 && page.layout != Layout::Comparison {
                palette.muted
            } else {
                palette.text
            };
            out.push_str(&text_box(
                id,
                name,
                region.area,
                &lines_block(lines, field != 2),
                TextStyle {
                    pt: region.pt,
                    line_pt: region.line_pt,
                    color,
                    gap_pt: 0,
                },
                None,
            ));
            id += 1;
        }
    }
    (out, id)
}
fn slide_xml(
    page: &Page,
    plan: &Plan,
    presentation: &ChatPresentation,
    images: &HashMap<String, PresentationImage>,
    index: usize,
) -> String {
    let surface_palette = match page.background_color.as_deref() {
        Some(color) if accent_ink(color) == "FFFFFF" => Palette::parse(Some("dark")).unwrap(),
        Some(_) => Palette::parse(Some("light")).unwrap(),
        None => plan.palette,
    };
    let palette = &surface_palette;
    if page.layout == Layout::Canvas {
        let mut output = xml_root("sld");
        let background = page.background_color.as_deref().unwrap_or(palette.background);
        write!(output, "<p:cSld name=\"{}\"><p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"{background}\"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>{}", escape(&presentation.slides[page.source].title), group_tree()).unwrap();
        output.push_str(&render_elements(&page.elements, 1000));
        output.push_str("</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>");
        return output;
    }
    let has_image = page.image_index.is_some();
    let inverse = matches!(page.layout, Layout::Cover | Layout::Section)
        && matches!(plan.style, DesignStyle::Editorial | DesignStyle::Technical | DesignStyle::Cinematic | DesignStyle::Brutalist)
        && page.background_color.is_none();
    let background = page.background_color.as_deref().unwrap_or_else(|| {
        if inverse {
            cover_background(palette, plan.style)
        } else {
            palette.background
        }
    });
    let ink = if page.background_color.is_some() {
        accent_ink(background)
    } else if inverse {
        "FFFFFF"
    } else {
        palette.text
    };
    let muted = if inverse { "E0E5ED" } else { palette.muted };
    let mut s = xml_root("sld");
    write!(s, "<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"{}\"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>{}", background, group_tree()).unwrap();
    // User-authored, validated OOXML shapes are always behind the designed foreground.
    s.push_str(&render_elements(
        &page.elements,
        1000,
    ));
    let mut id = 20;
    if !matches!(page.layout, Layout::Cover | Layout::Section)
        || presentation.slides[page.source].elements.is_empty()
        || has_image
    {
        draw_page_motif(&mut s, page, plan, palette, &mut id);
    }
    if !page.eyebrow.is_empty() {
        s.push_str(&text_box(
            id,
            "Eyebrow",
            eyebrow_rect(page.layout),
            &lines_block(&page.eyebrow, true),
            TextStyle {
                pt: 13,
                line_pt: 16,
                color: &plan.accent,
                gap_pt: 0,
            },
            None,
        ));
        id += 1;
    }
    if page.layout == Layout::Process {
        for i in 0..page.items.len().saturating_sub(1) {
            let a = item_rect_with_takeaway(
                Layout::Process,
                i,
                page.items.len(),
                !page.takeaway.is_empty(),
            );
            let b = item_rect_with_takeaway(
                Layout::Process,
                i + 1,
                page.items.len(),
                !page.takeaway.is_empty(),
            );
            s.push_str(&native_shape(
                id,
                "Process direction",
                rect(
                    (a.x + a.w - inch(0.24)) as f64 / 914400.0,
                    (item_rect_with_takeaway(
                        Layout::Process,
                        i,
                        page.items.len(),
                        !page.takeaway.is_empty(),
                    )
                    .y + inch(0.33)) as f64
                        / 914400.0,
                    (b.x - a.x - a.w + inch(0.48)) as f64 / 914400.0,
                    0.04,
                ),
                "rightArrow",
                &plan.accent,
                None,
                None,
            ));
            id += 1;
        }
    }
    let title_pt = page.title_pt;
    s.push_str(&text_box(
        id,
        "Title",
        title_rect(page.layout, has_image),
        &lines_block(&page.title, true),
        TextStyle {
            pt: title_pt,
            line_pt: i64::from(title_pt) + 9,
            color: ink,
            gap_pt: 0,
        },
        None,
    ));
    id += 1;
    if !page.subtitle.is_empty() {
        s.push_str(&text_box(
            id,
            "Subtitle",
            subtitle_rect(page.layout, has_image),
            &lines_block(&page.subtitle, false),
            TextStyle {
                pt: page.subtitle_pt,
                line_pt: i64::from(page.subtitle_pt) + 8,
                color: muted,
                gap_pt: 0,
            },
            None,
        ));
        id += 1;
    }
    if !page.items.is_empty() {
        let (item_xml, next_id) = item_shapes(page, plan, palette, id);
        s.push_str(&item_xml);
        id = next_id;
    }
    for (right, blocks) in [(false, &page.left), (true, &page.right)] {
        if !blocks.is_empty() {
            let area = if right { page.right_rect } else { page.left_rect };
            let special = matches!(
                page.layout,
                Layout::Statement | Layout::Insight | Layout::Cover | Layout::Section
            );
            let (pt, line) = (page.body_pt, page.body_line_pt);
            s.push_str(&text_box(
                id,
                if right { "Right body" } else { "Body" },
                area,
                blocks,
                TextStyle {
                    pt,
                    line_pt: line,
                    color: if special && inverse {
                        "F5F6F7"
                    } else {
                        palette.text
                    },
                    gap_pt: page.body_gap_pt,
                },
                None,
            ));
            id += 1;
        }
    }
    if !page.takeaway.is_empty() {
        if matches!(page.layout, Layout::Insight | Layout::Statement) {
            let area = takeaway_rect(page.layout, has_image);
            s.push_str(&native_shape(
                id,
                "Key takeaway field",
                area,
                "rect",
                palette.panel_alt,
                None,
                Some(palette.rule),
            ));
            id += 1;
            s.push_str(&native_shape(
                id,
                "Key takeaway accent",
                Rect {
                    x: area.x,
                    y: area.y,
                    w: inch(0.065),
                    h: area.h,
                },
                "rect",
                &plan.accent,
                None,
                None,
            ));
            id += 1;
            s.push_str(&text_box(
                id,
                "Key takeaway",
                Rect {
                    x: area.x + inch(0.25),
                    y: area.y,
                    w: area.w - inch(0.45),
                    h: area.h,
                },
                &lines_block(&page.takeaway, true),
                TextStyle {
                    pt: 16,
                    line_pt: 21,
                    color: palette.text,
                    gap_pt: 0,
                },
                None,
            ));
            id += 1;
        } else {
            let area = takeaway_rect(page.layout, has_image);
            s.push_str(&native_shape(
                id,
                "Key takeaway accent",
                Rect {
                    x: area.x,
                    y: area.y,
                    w: inch(0.055),
                    h: area.h,
                },
                "rect",
                &plan.accent,
                None,
                None,
            ));
            id += 1;
            s.push_str(&text_box(
                id,
                "Key takeaway",
                Rect {
                    x: area.x + inch(0.18),
                    y: area.y,
                    w: area.w - inch(0.2),
                    h: area.h,
                },
                &lines_block(&page.takeaway, true),
                TextStyle {
                    pt: 16,
                    line_pt: 21,
                    color: palette.text,
                    gap_pt: 0,
                },
                None,
            ));
            id += 1;
        }
    }
    if let Some(idx) = page.image_index {
        let image = &images[&plan.media[idx].id];
        let area = picture_rect(
            page.layout,
            !page.caption.is_empty(),
            !page.takeaway.is_empty(),
        );
        s.push_str(&picture(
            id,
            contained(area, image.width, image.height),
            &page.caption.join(" "),
        ));
        id += 1;
        if !page.caption.is_empty() {
            s.push_str(&text_box(
                id,
                "Image caption",
                Rect {
                    x: area.x,
                    y: area.y + area.h + inch(0.12),
                    w: area.w,
                    h: inch(0.5),
                },
                &lines_block(&page.caption, false),
                TextStyle {
                    pt: 13,
                    line_pt: 17,
                    color: palette.muted,
                    gap_pt: 0,
                },
                None,
            ));
            id += 1;
        }
    }
    if !matches!(page.layout, Layout::Cover | Layout::Section) && plan.style != DesignStyle::Custom {
        let (footer, area, size) = match plan.style {
            DesignStyle::Brutalist => (format!("{:02} / {:02}", index + 1, plan.pages.len()), rect(10.7, 0.43, 1.8, 0.34), 12),
            DesignStyle::Soft => (format!("{:02}", index + 1), rect(0.82, 7.03, 1.1, 0.28), 11),
            DesignStyle::Cinematic => (format!("{:02}", index + 1), rect(11.4, 7.03, 1.1, 0.28), 11),
            _ => (format!("{:02}", index + 1), rect(11.4, 7.03, 1.1, 0.28), 11),
        };
        s.push_str(&text_box(id, "Page number", area, &lines_block(&[footer], false), TextStyle {
            pt: size, line_pt: i64::from(size) + 3, color: if inverse { "E0E5ED" } else { palette.muted }, gap_pt: 0,
        }, None));
    }
    s.push_str("</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>");
    s
}

const LAYOUTS: [Layout; 13] = [
    Layout::Cover,
    Layout::Section,
    Layout::Content,
    Layout::TwoColumn,
    Layout::ImageLeft,
    Layout::ImageRight,
    Layout::Statement,
    Layout::Insight,
    Layout::Metrics,
    Layout::Process,
    Layout::Comparison,
    Layout::Grid,
    Layout::Canvas,
];
fn layout_index(layout: Layout) -> usize {
    LAYOUTS.iter().position(|l| *l == layout).unwrap() + 1
}
fn layout_name(layout: Layout) -> &'static str {
    match layout {
        Layout::Cover => "Cover",
        Layout::Section => "Section",
        Layout::Content => "Content",
        Layout::TwoColumn => "Two column",
        Layout::ImageLeft => "Image left",
        Layout::ImageRight => "Image right",
        Layout::Statement => "Statement",
        Layout::Insight => "Insight",
        Layout::Metrics => "Metrics",
        Layout::Process => "Process",
        Layout::Comparison => "Comparison",
        Layout::Grid => "Grid",
        Layout::Canvas => "Freeform canvas",
    }
}

fn relationship(id: &str, kind: &str, target: &str) -> String {
    format!(
        "<Relationship Id=\"{}\" Type=\"{R_NS}/{kind}\" Target=\"{}\"/>",
        escape(id),
        escape(target)
    )
}

fn relationships(items: &[String]) -> String {
    format!(
        "{XML_HEADER}<Relationships xmlns=\"{PKG_R_NS}\">{}</Relationships>",
        items.concat()
    )
}

fn color_map() -> &'static str {
    "<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>"
}

fn master_xml(palette: Palette) -> String {
    let mut s = xml_root("sldMaster");
    write!(
        s,
        "<p:cSld name=\"{} native master\">{}</p:spTree></p:cSld>{}<p:sldLayoutIdLst>",
        palette.name,
        group_tree(),
        color_map()
    )
    .unwrap();
    for i in 1..=LAYOUTS.len() {
        write!(
            s,
            "<p:sldLayoutId id=\"{}\" r:id=\"rId{i}\"/>",
            2_147_483_648u64 + i as u64
        )
        .unwrap();
    }
    write!(s, "</p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz=\"3200\">{}</a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz=\"2200\">{}</a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang=\"zh-CN\">{}</a:defRPr></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>", font_elements(), font_elements(), font_elements()).unwrap();
    s
}

fn layout_xml(layout: Layout) -> String {
    // Content objects live on slides (not flattened into background images).
    // A blank layout avoids inherited placeholder text and keeps every box editable.
    format!("{XML_HEADER}<p:sldLayout xmlns:a=\"{A_NS}\" xmlns:r=\"{R_NS}\" xmlns:p=\"{P_NS}\" type=\"blank\" preserve=\"1\"><p:cSld name=\"{}\">{}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>", layout_name(layout), group_tree())
}

fn theme_xml(palette: Palette, accent: &str) -> String {
    let mut s = format!("{XML_HEADER}<a:theme xmlns:a=\"{A_NS}\" name=\"{}\"><a:themeElements><a:clrScheme name=\"{}\">", palette.name, palette.name);
    for (name, color) in [
        ("dk1", palette.text),
        ("lt1", palette.background),
        ("dk2", palette.muted),
        ("lt2", palette.rule),
        ("accent1", accent),
        ("accent2", "438A78"),
        ("accent3", "B98439"),
        ("accent4", "8070AF"),
        ("accent5", "387C9B"),
        ("accent6", "B3656E"),
        ("hlink", "0563C1"),
        ("folHlink", "954F72"),
    ] {
        write!(s, "<a:{name}><a:srgbClr val=\"{color}\"/></a:{name}>").unwrap();
    }
    s.push_str("</a:clrScheme><a:fontScheme name=\"Chinese capable\">");
    for family in ["majorFont", "minorFont"] {
        write!(s, "<a:{family}>{}<a:font script=\"Hans\" typeface=\"Microsoft YaHei\"/><a:font script=\"Hant\" typeface=\"Microsoft JhengHei\"/><a:font script=\"Jpan\" typeface=\"Yu Gothic\"/><a:font script=\"Hang\" typeface=\"Malgun Gothic\"/></a:{family}>", font_elements()).unwrap();
    }
    s.push_str("</a:fontScheme><a:fmtScheme name=\"Native\"><a:fillStyleLst>");
    for _ in 0..3 {
        s.push_str("<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>");
    }
    s.push_str("</a:fillStyleLst><a:lnStyleLst>");
    for width in [6_350, 12_700, 19_050] {
        write!(s, "<a:ln w=\"{width}\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:prstDash val=\"solid\"/><a:miter lim=\"800000\"/></a:ln>").unwrap();
    }
    s.push_str("</a:lnStyleLst><a:effectStyleLst>");
    for _ in 0..3 {
        s.push_str("<a:effectStyle><a:effectLst/></a:effectStyle>");
    }
    s.push_str("</a:effectStyleLst><a:bgFillStyleLst>");
    for _ in 0..3 {
        s.push_str("<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>");
    }
    s.push_str("</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>");
    s
}

fn notes_master_xml() -> String {
    let mut s = xml_root("notesMaster");
    write!(s, "<p:cSld>{}</p:spTree></p:cSld>{}<p:notesStyle><a:lvl1pPr><a:defRPr sz=\"1400\">{}</a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>", group_tree(), color_map(), font_elements()).unwrap();
    s
}

fn notes_xml(text: &str) -> String {
    let mut s = xml_root("notes");
    write!(s, "<p:cSld>{}", group_tree()).unwrap();
    let blocks: Vec<Block> = normalized(text)
        .split('\n')
        .map(|line| Block {
            lines: vec![line.to_owned()],
            bullet: false,
            indented: false,
            bold: false,
        })
        .collect();
    // Notes are editable body placeholders in a real notesSlide. They are not
    // audience-slide text; PowerPoint's notes pane can scroll beyond page height.
    let shape = text_box(
        2,
        "Speaker notes",
        rect(0.6, 3.8, 6.3, 5.5),
        &blocks,
        TextStyle {
            pt: 14,
            line_pt: 19,
            color: "172033",
            gap_pt: 4,
        },
        Some("body"),
    );
    s.push_str(&shape.replace("wrap=\"none\"", "wrap=\"square\""));
    s.push_str("</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>");
    s
}

fn presentation_xml(plan: &Plan) -> String {
    let mut s = xml_root("presentation");
    s.push_str(
        "<p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rId1\"/></p:sldMasterIdLst>",
    );
    if plan.pages.iter().any(|p| p.notes.is_some()) {
        s.push_str("<p:notesMasterIdLst><p:notesMasterId r:id=\"rId4\"/></p:notesMasterIdLst>");
    }
    s.push_str("<p:sldIdLst>");
    for i in 0..plan.pages.len() {
        write!(s, "<p:sldId id=\"{}\" r:id=\"rId{}\"/>", 256 + i, 10 + i).unwrap();
    }
    write!(s, "</p:sldIdLst><p:sldSz cx=\"{SLIDE_W}\" cy=\"{SLIDE_H}\" type=\"screen16x9\"/><p:notesSz cx=\"6858000\" cy=\"9144000\"/><p:defaultTextStyle><a:defPPr><a:defRPr lang=\"zh-CN\">{}</a:defRPr></a:defPPr></p:defaultTextStyle></p:presentation>", font_elements()).unwrap();
    s
}

fn content_types(plan: &Plan) -> String {
    let mut s = format!("{XML_HEADER}<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>");
    for (extension, mime) in [("png", "image/png"), ("jpg", "image/jpeg")] {
        if plan.media.iter().any(|m| m.extension == extension) {
            write!(
                s,
                "<Default Extension=\"{extension}\" ContentType=\"{mime}\"/>"
            )
            .unwrap();
        }
    }
    for (part, content_type) in [
        (
            "/ppt/presentation.xml",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
        ),
        (
            "/ppt/presProps.xml",
            "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml",
        ),
        (
            "/ppt/slideMasters/slideMaster1.xml",
            "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
        ),
        (
            "/ppt/theme/theme1.xml",
            "application/vnd.openxmlformats-officedocument.theme+xml",
        ),
        (
            "/docProps/core.xml",
            "application/vnd.openxmlformats-package.core-properties+xml",
        ),
        (
            "/docProps/app.xml",
            "application/vnd.openxmlformats-officedocument.extended-properties+xml",
        ),
    ] {
        write!(
            s,
            "<Override PartName=\"{part}\" ContentType=\"{content_type}\"/>"
        )
        .unwrap();
    }
    for i in 1..=LAYOUTS.len() {
        write!(s, "<Override PartName=\"/ppt/slideLayouts/slideLayout{i}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml\"/>").unwrap();
    }
    for (i, page) in plan.pages.iter().enumerate() {
        let n = i + 1;
        write!(s, "<Override PartName=\"/ppt/slides/slide{n}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>").unwrap();
        if page.notes.is_some() {
            write!(s, "<Override PartName=\"/ppt/notesSlides/notesSlide{n}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml\"/>").unwrap();
        }
    }
    if plan.pages.iter().any(|p| p.notes.is_some()) {
        s.push_str("<Override PartName=\"/ppt/notesMasters/notesMaster1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml\"/>");
    }
    s.push_str("</Types>");
    s
}

fn core_properties(p: &ChatPresentation) -> String {
    format!("{XML_HEADER}<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"><dc:title>{}</dc:title><dc:subject>{}</dc:subject><dc:creator>Inspiration Drawer</dc:creator><dc:description>{}</dc:description><dc:language>zh-CN</dc:language><cp:lastModifiedBy>Inspiration Drawer</cp:lastModifiedBy><cp:revision>1</cp:revision></cp:coreProperties>", escape(&p.title), escape(p.subtitle.as_deref().unwrap_or("")), escape(p.subtitle.as_deref().unwrap_or("")))
}

fn app_properties(p: &ChatPresentation, plan: &Plan) -> String {
    let count = plan.pages.len();
    let notes = plan.pages.iter().filter(|p| p.notes.is_some()).count();
    let titles: String = plan
        .pages
        .iter()
        .map(|page| {
            format!(
                "<vt:lpstr>{}</vt:lpstr>",
                escape(&p.slides[page.source].title)
            )
        })
        .collect();
    format!("{XML_HEADER}<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\"><Application>Inspiration Drawer</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>{count}</Slides><Notes>{notes}</Notes><HiddenSlides>0</HiddenSlides><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size=\"2\" baseType=\"variant\"><vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant><vt:variant><vt:i4>{count}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size=\"{count}\" baseType=\"lpstr\">{titles}</vt:vector></TitlesOfParts><Company/><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>1.0000</AppVersion></Properties>")
}

fn add_part<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    name: &str,
    bytes: &[u8],
) -> Result<(), String> {
    // Stored is universally supported in zip 4.6 even when compression features
    // are disabled; PNG/JPEG are already compressed. No extra dependencies.
    zip.start_file(
        name,
        SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
    )
    .map_err(|e| format!("Cannot create PPTX part {name}: {e}"))?;
    zip.write_all(bytes)
        .map_err(|e| format!("Cannot write PPTX part {name}: {e}"))
}

fn package<W: Write + std::io::Seek>(
    writer: W,
    p: &ChatPresentation,
    images: &HashMap<String, PresentationImage>,
    plan: &Plan,
) -> Result<W, String> {
    let mut zip = ZipWriter::new(writer);
    add_part(
        &mut zip,
        "[Content_Types].xml",
        content_types(plan).as_bytes(),
    )?;
    let roots = relationships(&[
        relationship("rId1", "officeDocument", "ppt/presentation.xml"),
        "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>".to_owned(),
        relationship("rId3", "extended-properties", "docProps/app.xml"),
    ]);
    add_part(&mut zip, "_rels/.rels", roots.as_bytes())?;
    add_part(&mut zip, "docProps/core.xml", core_properties(p).as_bytes())?;
    add_part(
        &mut zip,
        "docProps/app.xml",
        app_properties(p, plan).as_bytes(),
    )?;
    add_part(
        &mut zip,
        "ppt/presentation.xml",
        presentation_xml(plan).as_bytes(),
    )?;
    add_part(
        &mut zip,
        "ppt/presProps.xml",
        format!("{}<p:presentationPr xmlns:p=\"{P_NS}\"/>", XML_HEADER).as_bytes(),
    )?;
    let mut pres_rels = vec![
        relationship("rId1", "slideMaster", "slideMasters/slideMaster1.xml"),
        relationship("rId2", "presProps", "presProps.xml"),
        relationship("rId3", "theme", "theme/theme1.xml"),
    ];
    let has_notes = plan.pages.iter().any(|p| p.notes.is_some());
    if has_notes {
        pres_rels.push(relationship(
            "rId4",
            "notesMaster",
            "notesMasters/notesMaster1.xml",
        ));
    }
    for i in 0..plan.pages.len() {
        pres_rels.push(relationship(
            &format!("rId{}", 10 + i),
            "slide",
            &format!("slides/slide{}.xml", i + 1),
        ));
    }
    add_part(
        &mut zip,
        "ppt/_rels/presentation.xml.rels",
        relationships(&pres_rels).as_bytes(),
    )?;
    add_part(
        &mut zip,
        "ppt/theme/theme1.xml",
        theme_xml(plan.palette, &plan.accent).as_bytes(),
    )?;
    add_part(
        &mut zip,
        "ppt/slideMasters/slideMaster1.xml",
        master_xml(plan.palette).as_bytes(),
    )?;
    let mut master_rels = Vec::new();
    for (i, layout) in LAYOUTS.iter().enumerate() {
        let n = i + 1;
        master_rels.push(relationship(
            &format!("rId{n}"),
            "slideLayout",
            &format!("../slideLayouts/slideLayout{n}.xml"),
        ));
        add_part(
            &mut zip,
            &format!("ppt/slideLayouts/slideLayout{n}.xml"),
            layout_xml(*layout).as_bytes(),
        )?;
        add_part(
            &mut zip,
            &format!("ppt/slideLayouts/_rels/slideLayout{n}.xml.rels"),
            relationships(&[relationship(
                "rId1",
                "slideMaster",
                "../slideMasters/slideMaster1.xml",
            )])
            .as_bytes(),
        )?;
    }
    master_rels.push(relationship(
        &format!("rId{}", LAYOUTS.len() + 1),
        "theme",
        "../theme/theme1.xml",
    ));
    add_part(
        &mut zip,
        "ppt/slideMasters/_rels/slideMaster1.xml.rels",
        relationships(&master_rels).as_bytes(),
    )?;
    if has_notes {
        add_part(
            &mut zip,
            "ppt/notesMasters/notesMaster1.xml",
            notes_master_xml().as_bytes(),
        )?;
        add_part(
            &mut zip,
            "ppt/notesMasters/_rels/notesMaster1.xml.rels",
            relationships(&[relationship("rId1", "theme", "../theme/theme1.xml")]).as_bytes(),
        )?;
    }
    for (i, media) in plan.media.iter().enumerate() {
        add_part(
            &mut zip,
            &format!("ppt/media/image{}.{}", i + 1, media.extension),
            &images[&media.id].bytes,
        )?;
    }
    for (i, page) in plan.pages.iter().enumerate() {
        let n = i + 1;
        add_part(
            &mut zip,
            &format!("ppt/slides/slide{n}.xml"),
            slide_xml(page, plan, p, images, i).as_bytes(),
        )?;
        let mut rels = vec![relationship(
            "rId1",
            "slideLayout",
            &format!(
                "../slideLayouts/slideLayout{}.xml",
                layout_index(page.layout)
            ),
        )];
        if let Some(idx) = page.image_index {
            rels.push(relationship(
                "rId2",
                "image",
                &format!("../media/image{}.{}", idx + 1, plan.media[idx].extension),
            ));
        }
        if let Some(text) = &page.notes {
            rels.push(relationship(
                "rId3",
                "notesSlide",
                &format!("../notesSlides/notesSlide{n}.xml"),
            ));
            add_part(
                &mut zip,
                &format!("ppt/notesSlides/notesSlide{n}.xml"),
                notes_xml(text).as_bytes(),
            )?;
            add_part(
                &mut zip,
                &format!("ppt/notesSlides/_rels/notesSlide{n}.xml.rels"),
                relationships(&[
                    relationship("rId1", "notesMaster", "../notesMasters/notesMaster1.xml"),
                    relationship("rId2", "slide", &format!("../slides/slide{n}.xml")),
                ])
                .as_bytes(),
            )?;
        }
        add_part(
            &mut zip,
            &format!("ppt/slides/_rels/slide{n}.xml.rels"),
            relationships(&rels).as_bytes(),
        )?;
    }
    zip.finish()
        .map_err(|e| format!("Cannot finish PPTX ZIP: {e}"))
}

fn write_package(
    path: &Path,
    p: &ChatPresentation,
    images: &HashMap<String, PresentationImage>,
    plan: &Plan,
) -> Result<(), String> {
    let file = File::create(path).map_err(|e| format!("Cannot create PPTX destination: {e}"))?;
    let mut writer = package(BufWriter::new(file), p, images, plan)?;
    writer
        .flush()
        .map_err(|e| format!("Cannot flush PPTX destination: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{BTreeMap, HashSet};
    use std::io::{Cursor, Read};

    fn slide(layout: &str) -> ChatPresentationSlide {
        serde_json::from_value(serde_json::json!({"layout":layout,"title":"\u{4e2d}\u{6587}"}))
            .unwrap()
    }

    fn deck() -> ChatPresentation {
        ChatPresentation {
            title: "\u{53ef}\u{7f16}\u{8f91}".into(),
            subtitle: None,
            theme: None,
            design_style: None,
            accent_color: None,
            slides: vec![slide("content")],
        }
    }

    fn png() -> PresentationImage {
        let hex="89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63908bdaf21f0003f2022c15ef3f970000000049454e44ae426082";
        PresentationImage {
            bytes: (0..hex.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
                .collect(),
            extension: "png".into(),
            width: 1,
            height: 1,
        }
    }

    fn archive(
        p: &ChatPresentation,
        images: &HashMap<String, PresentationImage>,
    ) -> (Plan, BTreeMap<String, Vec<u8>>) {
        let plan = plan_presentation(p, images).unwrap();
        let bytes = package(Cursor::new(Vec::new()), p, images, &plan)
            .unwrap()
            .into_inner();
        assert!(bytes.starts_with(b"PK\x03\x04"));
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut parts = BTreeMap::new();
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).unwrap();
            assert!(entry.enclosed_name().is_some());
            let name = entry.name().to_owned();
            let mut data = Vec::new();
            entry.read_to_end(&mut data).unwrap();
            assert_eq!(data.len() as u64, entry.size());
            assert!(parts.insert(name, data).is_none());
        }
        (plan, parts)
    }

    fn part<'a>(parts: &'a BTreeMap<String, Vec<u8>>, name: &str) -> &'a str {
        std::str::from_utf8(parts.get(name).unwrap_or_else(|| panic!("missing {name}"))).unwrap()
    }

    fn attrs<'a>(xml: &'a str, tag: &str, name: &str) -> Vec<&'a str> {
        let start = format!("<{tag} ");
        let key = format!("{name}=\"");
        xml.split(&start)
            .skip(1)
            .filter_map(|tail| {
                let end = tail.find('>')?;
                tail[..end]
                    .split_once(&key)
                    .map(|x| x.1.split('"').next().unwrap())
            })
            .collect()
    }

    fn resolve_rel(part_name: &str, target: &str) -> String {
        let base = if part_name == "_rels/.rels" {
            String::new()
        } else {
            let (parent, _) = part_name.split_once("/_rels/").unwrap();
            format!("{parent}/")
        };
        let mut stack = Vec::new();
        let combined = format!("{base}{target}");
        for token in combined.split('/') {
            match token {
                "" | "." => {}
                ".." => {
                    assert!(stack.pop().is_some());
                }
                other => stack.push(other),
            }
        }
        stack.join("/")
    }

    fn verify_package(parts: &BTreeMap<String, Vec<u8>>) {
        let ct = part(parts, "[Content_Types].xml");
        let overrides = attrs(ct, "Override", "PartName");
        assert_eq!(
            overrides.len(),
            overrides.iter().collect::<HashSet<_>>().len()
        );
        for name in &overrides {
            assert!(parts.contains_key(name.trim_start_matches('/')));
        }
        for (name, bytes) in parts {
            if !name.ends_with(".xml") && !name.ends_with(".rels") {
                continue;
            }
            let xml = std::str::from_utf8(bytes).unwrap();
            assert!(xml.starts_with(XML_HEADER), "{name}");
            assert!(
                !xml.contains("TargetMode")
                    && !xml.contains("hlinkClick")
                    && !xml.contains("<!DOCTYPE")
            );
            if name.ends_with(".rels") {
                let ids = attrs(xml, "Relationship", "Id");
                assert_eq!(
                    ids.len(),
                    ids.iter().collect::<HashSet<_>>().len(),
                    "{name}"
                );
                for target in attrs(xml, "Relationship", "Target") {
                    assert!(
                        !target.contains(':') && !target.starts_with('/') && !target.contains('\\')
                    );
                    assert!(
                        parts.contains_key(&resolve_rel(name, target)),
                        "{name} -> {target}"
                    );
                }
            } else if name.starts_with("ppt/") {
                assert!(overrides.contains(&format!("/{name}").as_str()), "{name}");
                let ids = attrs(xml, "p:cNvPr", "id");
                assert_eq!(
                    ids.len(),
                    ids.iter().collect::<HashSet<_>>().len(),
                    "{name}"
                );
                assert!(!ids.contains(&"0"));
            }
        }
    }

    #[test]
    fn serde_defaults_camel_case_and_null_collections() {
        let p:ChatPresentation=serde_json::from_value(serde_json::json!({"title":"x","slides":[{"title":"y","bullets":null,"items":null,"elements":null}]})).unwrap();
        assert!(
            p.slides[0].bullets.is_empty()
                && p.slides[0].items.is_empty()
                && p.slides[0].elements.is_empty()
        );
        assert_eq!(
            serde_json::to_value(&p).unwrap()["slides"][0]["imageAttachmentId"],
            serde_json::Value::Null
        );
        assert!(serde_json::from_value::<ChatPresentationSlide>(
            serde_json::json!({"title":"x","items":4})
        )
        .is_err());
    }

    #[test]
    fn color_and_design_style_validation_are_exact() {
        assert_eq!(normalize_color(" #a0b1c2 ").unwrap(), "A0B1C2");
        for value in ["#fff", "1234567", "gg0000", "red", "#12 456"] {
            assert!(normalize_color(value).is_err());
        }
        for style in ["editorial", "technical", "minimal", "cinematic", "brutalist", "soft", "custom"] {
            let mut p = deck();
            p.design_style = Some(style.into());
            assert!(plan_presentation(&p, &HashMap::new()).is_ok());
        }
        let mut p = deck();
        p.design_style = Some("template".into());
        assert!(plan_presentation(&p, &HashMap::new())
            .unwrap_err()
            .contains("designStyle"));
        p.design_style = None;
        p.accent_color = Some("#FF8800".into());
        assert_eq!(
            plan_presentation(&p, &HashMap::new()).unwrap().accent,
            "FF8800"
        );
        p.accent_color = Some("blue".into());
        assert!(plan_presentation(&p, &HashMap::new()).is_err());
    }

    #[test]
    fn all_twelve_layouts_generate_native_editable_parts_and_unique_ids() {
        let mut p = deck();
        p.design_style = Some("editorial".into());
        p.accent_color = Some("#F06432".into());
        p.slides = vec![
            slide("cover"),
            slide("section"),
            slide("content"),
            slide("two-column"),
            slide("image-left"),
            slide("image-right"),
            slide("statement"),
            slide("insight"),
            slide("metrics"),
            slide("process"),
            slide("comparison"),
            slide("grid"),
        ];
        p.slides[2].body = Some("\u{4e2d}\u{6587} & <editable>".into());
        p.slides[3].left_title = Some("Left".into());
        p.slides[3].right_title = Some("Right".into());
        for i in [4usize, 5] {
            p.slides[i].image_attachment_id = Some("photo".into());
        }
        p.slides[8].items = (0..4)
            .map(|i| PresentationItem {
                title: format!("Metric {}", i + 1),
                value: Some(format!("{}%", 90 + i)),
                body: Some("Measured".into()),
            })
            .collect();
        p.slides[9].items = (0..3)
            .map(|i| PresentationItem {
                title: format!("Step {}", i + 1),
                value: None,
                body: Some("Proceed to next stage.".into()),
            })
            .collect();
        p.slides[10].items = vec![
            PresentationItem {
                title: "Now".into(),
                value: None,
                body: Some("Current".into()),
            },
            PresentationItem {
                title: "Next".into(),
                value: None,
                body: Some("Future".into()),
            },
        ];
        p.slides[11].items = (0..6)
            .map(|i| PresentationItem {
                title: format!("Topic {}", i + 1),
                value: None,
                body: Some("Evidence".into()),
            })
            .collect();
        p.slides[7].takeaway = Some("\u{4e3b}\u{8981}\u{7ed3}\u{8bba}".into());
        p.slides[2].elements = vec![serde_json::from_value(
            serde_json::json!({"kind":"rect","x":2,"y":2,"width":20,"height":10}),
        )
        .unwrap()];
        let images = HashMap::from([("photo".into(), png())]);
        let (plan, parts) = archive(&p, &images);
        verify_package(&parts);
        assert_eq!(plan.pages.len(), 12);
        assert!(part(&parts, "ppt/slides/slide1.xml").contains("Cover color field"));
        assert!(part(&parts, "ppt/slides/slide2.xml").contains("Section accent block"));
        assert!(part(&parts, "ppt/slides/slide9.xml").contains("Metric value"));
        assert!(part(&parts, "ppt/slides/slide10.xml").contains("rightArrow"));
        assert!(part(&parts, "ppt/slides/slide11.xml").contains("Comparison right field"));
        assert!(part(&parts, "ppt/slides/slide12.xml").contains("Grid item title"));
        assert!(part(&parts, "ppt/slides/slide3.xml").contains("&lt;editable&gt;"));
        assert!(part(&parts, "ppt/slides/slide3.xml").contains("id=\"1000\""));
        assert!(part(&parts, "ppt/slides/slide3.xml").contains("prst=\"rect\""));
        assert_eq!(parts["ppt/media/image1.png"], images["photo"].bytes);
        assert!(part(&parts, "ppt/theme/theme1.xml").contains("F06432"));
    }

    #[test]
    fn automatic_layouts_are_semantic_and_cover_is_not_repeated() {
        let mut p = deck();
        p.slides = vec![
            slide("content"),
            slide("content"),
            slide("content"),
            slide("content"),
            slide("content"),
            slide("content"),
            slide("content"),
        ];
        for item in &mut p.slides {
            item.layout = None;
        }
        p.slides[1].body = Some("\u{4e00}\u{53e5}\u{7ed3}\u{8bba}".into());
        p.slides[1].takeaway = Some("Point".into());
        p.slides[2].items = (0..3)
            .map(|i| PresentationItem {
                title: format!("KPI {i}"),
                value: Some("90%".into()),
                body: None,
            })
            .collect();
        p.slides[3].items = (0..3)
            .map(|i| PresentationItem {
                title: format!("Step {i}"),
                value: None,
                body: Some("Action".into()),
            })
            .collect();
        p.slides[4].items = vec![
            PresentationItem {
                title: "A".into(),
                body: None,
                value: None,
            },
            PresentationItem {
                title: "B".into(),
                body: None,
                value: None,
            },
        ];
        p.slides[5].bullets = vec!["a".into(), "b".into(), "c".into()];
        p.slides[6].body = Some("Long-form evidence. ".repeat(80));
        let plan = plan_presentation(&p, &HashMap::new()).unwrap();
        assert_eq!(plan.pages[0].layout, Layout::Cover);
        assert_eq!(plan.pages[1].layout, Layout::Insight);
        assert_eq!(plan.pages[2].layout, Layout::Metrics);
        assert_eq!(plan.pages[3].layout, Layout::Process);
        assert_eq!(plan.pages[4].layout, Layout::Comparison);
        assert_eq!(plan.pages[5].layout, Layout::Grid);
        assert!(plan
            .pages
            .iter()
            .any(|page| page.source == 6 && page.layout == Layout::Content));
    }

    #[test]
    fn missing_image_invalid_layout_and_unbounded_inputs_fail_before_io() {
        let mut p = deck();
        p.slides[0].layout = Some("nope".into());
        assert!(plan_presentation(&p, &HashMap::new())
            .unwrap_err()
            .contains("layout"));
        p.slides[0].layout = Some("image-right".into());
        assert!(plan_presentation(&p, &HashMap::new())
            .unwrap_err()
            .contains("imageAttachmentId"));
        p.slides[0].image_attachment_id = Some("opaque".into());
        assert!(plan_presentation(&p, &HashMap::new())
            .unwrap_err()
            .contains("not present"));
        p.slides[0].image_attachment_id = None;
        p.slides[0].layout = None;
        p.slides[0].items = (0..7)
            .map(|i| PresentationItem {
                title: i.to_string(),
                body: None,
                value: None,
            })
            .collect();
        assert!(plan_presentation(&p, &HashMap::new())
            .unwrap_err()
            .contains("6 presentation items"));
        p.slides[0].items.clear();
        p.slides[0].elements = vec![
            serde_json::from_value(
                serde_json::json!({"kind":"rect","x":1,"y":1,"width":5,"height":5})
            )
            .unwrap();
            41
        ];
        assert!(plan_presentation(&p, &HashMap::new())
            .unwrap_err()
            .contains("40 custom elements"));
        p.slides = vec![slide("content"); MAX_INPUT_SLIDES + 1];
        assert!(plan_presentation(&p, &HashMap::new())
            .unwrap_err()
            .contains("40"));
    }

    #[test]
    fn long_body_paginates_without_truncating_or_shrinking() {
        let mut p = deck();
        p.slides[0].layout = Some("content".into());
        let original = "Long English and \u{4e2d}\u{6587} evidence remains editable. ".repeat(90);
        p.slides[0].body = Some(original.clone());
        p.slides[0].notes = Some("Notes survive pagination.".into());
        let (plan, parts) = archive(&p, &HashMap::new());
        assert!(plan.pages.len() > 1);
        let visible: String = plan.pages.iter().flat_map(|p| p.left.iter().flat_map(|b| &b.lines)).cloned().collect();
        assert_eq!(visible, original);
        assert!(parts.contains_key("ppt/notesMasters/notesMaster1.xml"));
    }

    #[test]
    fn ten_research_beats_keep_all_body_evidence_without_fragment_pages() {
        let mut p = deck();
        p.slides = vec![slide("cover"), slide("statement"), slide("insight"),
            slide("comparison"), slide("grid"), slide("process"), slide("insight"),
            slide("insight"), slide("two-column"), slide("statement")];
        for (index, source) in p.slides.iter_mut().enumerate() {
            source.title = format!("研究主题 {}", index + 1);
        }
        p.slides[0].body = Some("研究范围：具体产品与使用任务\n资料边界：公开证据与设计分析；不声称完成实测".into());
        for index in [1usize, 2, 6, 7, 9] {
            p.slides[index].body = Some("每页先说明研究问题，再给出可以核验的支持信息。".into());
            p.slides[index].bullets = vec!["记录调节动作与握持变化".into(), "区分事实与设计假设".into(), "缺失信息明确标为待验证".into()];
            p.slides[index].takeaway = Some("用证据支撑结论，不用拆句增加页数".into());
        }
        for (index, count) in [(3usize, 2usize), (4, 6), (5, 4)] {
            p.slides[index].items = (0..count).map(|i| PresentationItem {
                title: format!("维度 {}", i + 1), value: None,
                body: Some("核对具体来源、型号和年款；观察造型与操作，记录待验证的设计问题".into()),
            }).collect();
        }
        p.slides[8].left_title = Some("方向 A".into());
        p.slides[8].right_title = Some("方向 B".into());
        p.slides[8].left_body = Some("构想：按共同维度组织功能。\n\n收益：建立清晰的位置记忆。\n\n风险：模块与内部包装冲突。\n\n验证：盲操作与换握干涉。".into());
        p.slides[8].right_body = p.slides[8].left_body.clone();
        let (plan, _) = archive(&p, &HashMap::new());
        assert_eq!(plan.pages.len(), 10);
        assert!(plan.pages.iter().all(|page| page.continuation == 0));
        for (index, source) in p.slides.iter().enumerate() {
            let visible: String = plan.pages[index].left.iter().chain(&plan.pages[index].right)
                .flat_map(|block| block.lines.iter()).cloned().collect();
            let compact = |text: &str| text.chars().filter(|c| !c.is_whitespace()).collect::<String>();
            for text in source.body.iter().chain(&source.left_body).chain(&source.right_body).chain(&source.bullets) {
                assert!(compact(&visible).contains(&compact(text)), "slide {} lost body evidence", index + 1);
            }
            for (blocks, area) in [(&plan.pages[index].left, plan.pages[index].left_rect), (&plan.pages[index].right, plan.pages[index].right_rect)] {
                let used = blocks.iter().map(|b| b.lines.len() as i64 * plan.pages[index].body_line_pt + plan.pages[index].body_gap_pt).sum::<i64>() * EMU_PER_PT;
                assert!(used <= area.h, "body exceeds authored box");
            }
        }
    }

    #[test]
    fn authored_lower_diagram_band_does_not_overlap_body_or_takeaway() {
        let mut p = deck();
        p.slides[0] = slide("insight");
        p.slides[0].body = Some("原生图示应与正文和结论保留间距".into());
        p.slides[0].takeaway = Some("说明一个明确结论".into());
        p.slides[0].elements = vec![serde_json::from_value(serde_json::json!({
            "kind":"rect","x":9,"y":73,"width":24,"height":10,"fill":"#D8DFD7"
        })).unwrap()];
        let plan = plan_presentation(&p, &HashMap::new()).unwrap();
        let page = &plan.pages[0];
        let element = &page.elements[0];
        let y = f64::from(element.y) * SLIDE_H as f64 / 100.0;
        let bottom = f64::from(element.y + element.height) * SLIDE_H as f64 / 100.0;
        assert!((page.left_rect.y + page.left_rect.h) as f64 <= y);
        assert!(bottom < takeaway_rect(page.layout, false).y as f64);
    }

    #[test]
    fn images_are_contained_and_signature_checked() {
        let mut p = deck();
        p.slides[0].layout = Some("image-right".into());
        p.slides[0].image_attachment_id = Some("id".into());
        let (plan, parts) = archive(&p, &HashMap::from([("id".into(), png())]));
        verify_package(&parts);
        assert_eq!(plan.media.len(), 1);
        assert!(part(&parts, "ppt/slides/slide1.xml").contains("<p:pic>"));
        let mut bad = png();
        bad.width = 2;
        assert!(validate_image(&bad).is_err());
    }

    #[test]
    fn long_image_title_uses_bounded_adaptive_size_without_overflowing() {
        let mut p = deck();
        p.slides[0].layout = Some("image-right".into());
        p.slides[0].image_attachment_id = Some("img".into());
        p.slides[0].title = "这是一个需要在窄图文布局中保持完整且可读的较长产品概念标题与设计方向说明".into();
        let image = HashMap::from([("img".into(), png())]);
        let plan = plan_presentation(&p, &image).expect("adaptive title should fit");
        assert!(plan.pages[0].title.len() <= 3);
        assert!(plan.pages[0].title_pt < Layout::ImageRight.title_pt());
        let (_summary, _parts) = archive(&p, &image);
    }

    #[test]
    fn long_cover_subtitle_adapts_inside_two_line_limit() {
        let mut p = deck();
        p.slides[0].layout = Some("cover".into());
        p.slides[0].subtitle = Some("从重载转向系统到驾驶者的多功能控制界面与交互体验研究方向".into());
        let plan = plan_presentation(&p, &HashMap::new()).expect("cover subtitle should adapt");
        assert!(plan.pages[0].subtitle.len() <= 2);
        assert!(plan.pages[0].subtitle_pt <= 21);
    }

    #[test]
    fn focused_long_subtitle_and_image_right_geometry_are_validated() {
        let mut p = deck();
        p.slides[0].layout = Some("image-right".into());
        p.slides[0].image_attachment_id = Some("img".into());
        let image = HashMap::from([("img".into(), png())]);
        p.slides[0].subtitle = Some("Readable subtitle across two lines".into());
        assert!(plan_presentation(&p, &image).is_ok());
        p.slides[0].subtitle = Some("An intentionally extremely long subtitle that exceeds the safe text box width and must be rejected before any output file is created because silently overflowing the title region is not acceptable".into());
        assert!(plan_presentation(&p, &image)
            .unwrap_err()
            .contains("subtitle"));
        let plan = plan_presentation(
            &ChatPresentation {
                title: "T".into(),
                slides: vec![{
                    let mut s = slide("image-right");
                    s.image_attachment_id = Some("img".into());
                    s
                }],
                subtitle: None,
                theme: None,
                design_style: None,
                accent_color: None,
            },
            &image,
        )
        .unwrap();
        let photo = picture_rect(Layout::ImageRight, false, false);
        assert!(
            photo.x >= 0
                && photo.y >= 0
                && photo.x + photo.w <= SLIDE_W
                && photo.y + photo.h <= SLIDE_H
        );
        assert_eq!(plan.pages.len(), 1);
    }

    #[test]
    fn custom_color_and_fitted_layout_rectangles_stay_in_bounds() {
        for layout in LAYOUTS {
            if matches!(layout, Layout::ImageLeft | Layout::ImageRight) {
                continue;
            }
            let title = title_rect(layout, false);
            assert!(
                title.x >= 0
                    && title.y >= 0
                    && title.x + title.w <= SLIDE_W
                    && title.y + title.h <= SLIDE_H
            );
            let subtitle = subtitle_rect(layout, false);
            assert!(
                subtitle.x >= 0
                    && subtitle.y >= 0
                    && subtitle.x + subtitle.w <= SLIDE_W
                    && subtitle.y + subtitle.h <= SLIDE_H
            );
        }
        assert_eq!(accent_ink("FFFFFF"), "172033");
        assert_eq!(accent_ink("000000"), "FFFFFF");
    }
    #[test]
    fn inherited_subtitles_are_checked_in_the_final_image_layout() {
        let mut p = deck();
        p.slides[0].image_attachment_id = Some("img".into());
        p.subtitle = Some("A deliberately long inherited subtitle that fits a wide slide but not the narrow image column and must not overflow".into());
        let image = HashMap::from([("img".into(), png())]);
        let error = plan_presentation(&p, &image).unwrap_err();
        assert!(error.contains("subtitle"), "{error}");
        p.subtitle = Some("Readable subtitle across two lines".into());
        let (plan, parts) = archive(&p, &image);
        assert_eq!(plan.pages[0].layout, Layout::ImageRight);
        assert_eq!(plan.pages[0].subtitle.len(), 2);
        assert!(part(&parts, "ppt/slides/slide1.xml").contains("sz=\"1700\""));
    }

    #[test]
    fn structured_item_regions_fit_the_rendered_font_and_keep_process_values() {
        for layout in [
            Layout::Metrics,
            Layout::Process,
            Layout::Comparison,
            Layout::Grid,
        ] {
            for has_takeaway in [false, true] {
                for has_value in [false, true] {
                    let count = if layout == Layout::Comparison { 2 } else { 4 };
                    for index in 0..count {
                        let area = item_rect_with_takeaway(layout, index, count, has_takeaway);
                        for region in item_text_regions(layout, area, has_value) {
                            assert!(region.area.w > 0 && region.area.h > 0);
                            assert!(region.area.x + region.area.w <= SLIDE_W);
                            assert!(region.area.y + region.area.h <= SLIDE_H);
                            assert!(
                                region.max_lines as i64 * region.line_pt * EMU_PER_PT
                                    <= region.area.h
                            );
                        }
                    }
                }
            }
        }
        let mut p = deck();
        p.slides[0] = slide("process");
        p.slides[0].items = (0..3)
            .map(|index| PresentationItem {
                title: format!("Step {index}"),
                value: Some(format!("0{index}")),
                body: Some("Check".into()),
            })
            .collect();
        let (_, parts) = archive(&p, &HashMap::new());
        assert!(part(&parts, "ppt/slides/slide1.xml").contains("Process marker"));
        p.slides[0].items[0].value = Some("This cannot fit in a process node".into());
        assert!(plan_presentation(&p, &HashMap::new()).is_ok());
    }

    #[test]
    fn intentional_cover_art_is_not_overlaid_by_unrelated_default_motifs() {
        let mut p = deck();
        p.slides[0] = serde_json::from_value(serde_json::json!({"layout":"cover","title":"Design","elements":[{"kind":"ellipse","x":65,"y":25,"width":25,"height":40,"stroke":"#F06432","strokeWidth":3}]})).unwrap();
        let (_, parts) = archive(&p, &HashMap::new());
        let xml = part(&parts, "ppt/slides/slide1.xml");
        assert!(!xml.contains("Cover circle") && !xml.contains("Cover color field"));
        assert!(xml.contains("prst=\"ellipse\""));
    }
    #[test]
    fn visual_directions_and_all_palettes_roundtrip_without_editorial_fallback() {
        for (style, marker) in [
            ("editorial", "Cover circle"), ("technical", "Technical vertical grid"),
            ("minimal", "Minimal cover accent"), ("cinematic", "Cinematic horizon"),
            ("brutalist", "Brutalist block"), ("soft", "Soft cover bloom"),
        ] {
            for theme in ["light", "dark", "warm", "mono", "vivid", "pastel"] {
                let mut p = deck(); p.design_style = Some(style.into()); p.theme = Some(theme.into());
                p.slides = vec![slide("cover")];
                let (_, parts) = archive(&p, &HashMap::new());
                verify_package(&parts);
                assert!(part(&parts, "ppt/slides/slide1.xml").contains(marker), "{style}/{theme}");
            }
        }
        let mut p = deck(); p.slides = vec![slide("cover")];
        let (plan, parts) = archive(&p, &HashMap::new());
        assert_eq!(plan.style, DesignStyle::Custom);
        let xml = part(&parts, "ppt/slides/slide1.xml");
        assert!(!xml.contains("Cover circle") && !xml.contains("Minimal cover accent"));
    }

    #[test]
    fn canvas_keeps_authored_geometry_and_no_template_title_or_page_number() {
        let mut p = deck(); p.design_style = Some("editorial".into());
        p.slides = vec![serde_json::from_value(serde_json::json!({
            "layout":"canvas", "title":"Lower left title", "backgroundColor":"#13211C",
            "notes":"Full evidence remains editable in notes.",
            "elements":[
                {"kind":"rect","x":0,"y":0,"width":100,"height":12,"fill":"#C1653A"},
                {"kind":"text","x":8,"y":65,"width":70,"height":18,"text":"Lower left title","fontSize":36,"color":"#FFFFFF"}
            ]
        })).unwrap()];
        let (plan, parts) = archive(&p, &HashMap::new()); verify_package(&parts);
        assert_eq!(plan.pages.len(), 1);
        let xml = part(&parts, "ppt/slides/slide1.xml");
        assert!(xml.contains("x=\"975360\" y=\"4457700\""));
        assert!(xml.contains("Lower left title") && xml.contains("13211C"));
        for unwanted in ["name=\"Title\"", "Page number", "Cover circle", "Editorial content rail"] { assert!(!xml.contains(unwanted)); }
        assert!(part(&parts, "ppt/notesSlides/notesSlide1.xml").contains("Full evidence"));
        p.slides[0].body = Some("Must not silently disappear".into());
        assert!(plan_presentation(&p, &HashMap::new()).unwrap_err().contains("canvas"));
    }

    #[test]
    fn canvas_rejects_invisible_or_clipped_titles_instead_of_silently_losing_content() {
        let mut p = deck(); p.slides = vec![serde_json::from_value(serde_json::json!({
            "layout":"canvas", "title":"Visible", "elements":[
                {"kind":"text","x":5,"y":5,"width":1,"height":1,"text":"Visible","color":"#111111"}
            ]
        })).unwrap()];
        assert!(plan_presentation(&p, &HashMap::new()).unwrap_err().contains("canvas"));
        p.slides[0].elements[0].width=70.0; p.slides[0].elements[0].height=20.0;
        p.slides[0].elements[0].text=Some("Other".into());
        assert!(plan_presentation(&p, &HashMap::new()).unwrap_err().contains("title"));
    }

    #[test]
    fn explicit_dark_slide_surface_adjusts_body_not_only_the_title() {
        let mut p=deck(); p.theme=Some("light".into());
        p.slides[0].background_color=Some("#101010".into());
        p.slides[0].body=Some("Read this evidence".into());
        let (_, parts)=archive(&p, &HashMap::new());
        let xml=part(&parts, "ppt/slides/slide1.xml");
        let body=xml.split("name=\"Body\"").nth(1).unwrap().split("</p:sp>").next().unwrap();
        assert!(body.contains("F3F6FC"));
    }

}
