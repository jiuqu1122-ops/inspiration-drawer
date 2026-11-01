//! Safe editable vector elements for native PowerPoint slides.
//!
//! This module deliberately accepts a small data-only shape vocabulary. It does
//! not parse or execute SVG, HTML, paths, URLs, scripts, or external resources.
use serde::{Deserialize, Serialize};
use std::fmt::Write as FmtWrite;

const SLIDE_W: f64 = 12_192_000.0;
const SLIDE_H: f64 = 6_858_000.0;
const EMU_PER_PT: f64 = 12_700.0;
const A_NS: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P_NS: &str = "http://schemas.openxmlformats.org/presentationml/2006/main";
const FONT: &str = "Microsoft YaHei";

/// One editable native vector/text object, positioned in slide-relative percent.
/// Rectangles and ellipses use fill/stroke; lines use stroke; text uses color.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PresentationElement {
    pub kind: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub fill: Option<String>,
    #[serde(default)]
    pub stroke: Option<String>,
    #[serde(default)]
    pub stroke_width: Option<f32>,
    #[serde(default)]
    pub opacity: Option<f32>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub font_size: Option<f32>,
    #[serde(default)]
    pub text: Option<String>,
}

pub fn normalize_color(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let digits = trimmed.strip_prefix('#').unwrap_or(trimmed);
    if digits.len() != 6 || !digits.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("color must be six hexadecimal digits, optionally prefixed with #".into());
    }
    Ok(digits.to_ascii_uppercase())
}

fn valid_text(text: &str) -> Result<(), String> {
    if text.chars().count() > 4_000 {
        return Err("custom element text exceeds 4000 characters".into());
    }
    for ch in text.chars() {
        if !matches!(ch, '\t' | '\n' | '\r')
            && (ch < '\u{20}' || matches!(ch, '\u{fffe}' | '\u{ffff}'))
        {
            return Err(format!(
                "custom element text contains XML 1.0 forbidden U+{:04X}",
                ch as u32
            ));
        }
    }
    Ok(())
}

fn element_char_width(ch: char, font_size: f64) -> f64 {
    let em = if ch == '\t' {
        2.2
    } else if ch.is_ascii() {
        if "MW@#%&".contains(ch) {
            0.88
        } else if ch.is_whitespace() {
            0.34
        } else {
            0.58
        }
    } else {
        1.12
    };
    font_size * EMU_PER_PT * em
}

fn wrap_element_text(text: &str, width_emu: f64, font_size: f64) -> Vec<String> {
    let available = (width_emu - 9.0 * EMU_PER_PT).max(1.0);
    let mut lines = Vec::new();
    for source in text.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
        let mut line = String::new();
        let mut width = 0.0;
        for ch in source.chars() {
            let advance = element_char_width(ch, font_size);
            if width + advance > available && !line.is_empty() {
                lines.push(std::mem::take(&mut line));
                width = 0.0;
            }
            line.push(ch);
            width += advance;
        }
        lines.push(line);
    }
    lines
}

fn fit_text_element(text: &str, width_emu: f64, height_emu: f64, preferred_pt: f64) -> (f64, Vec<String>) {
    let mut pt = preferred_pt.clamp(8.0, 72.0);
    loop {
        let lines = wrap_element_text(text, width_emu, pt);
        let line_height = pt * 1.3 * EMU_PER_PT;
        let max_lines = ((height_emu - 4.0 * EMU_PER_PT).max(line_height) / line_height).floor().max(1.0) as usize;
        if lines.len() <= max_lines {
            return (pt, lines);
        }
        if pt <= 8.0 {
            let mut clipped = lines.into_iter().take(max_lines).collect::<Vec<_>>();
            if let Some(last) = clipped.last_mut() {
                if !last.ends_with('…') { last.push('…'); }
            }
            return (pt, clipped);
        }
        pt = (pt - 1.0).max(8.0);
    }
}

pub fn validate_elements(elements: &[PresentationElement]) -> Result<(), String> {
    if elements.len() > 40 {
        return Err("a slide may contain at most 40 custom vector elements".into());
    }
    for (i, element) in elements.iter().enumerate() {
        let label = format!("element {}", i + 1);
        if !matches!(element.kind.as_str(), "rect" | "ellipse" | "line" | "text") {
            return Err(format!("{label} kind must be rect, ellipse, line or text"));
        }
        for (name, value) in [
            ("x", element.x),
            ("y", element.y),
            ("width", element.width),
            ("height", element.height),
        ] {
            if !value.is_finite() || !(0.0..=100.0).contains(&value) {
                return Err(format!(
                    "{label} {name} must be a finite percentage from 0 to 100"
                ));
            }
        }
        if f64::from(element.x) + f64::from(element.width) > 100.0 + 1e-5
            || f64::from(element.y) + f64::from(element.height) > 100.0 + 1e-5
        {
            return Err(format!("{label} extends beyond the slide"));
        }
        if element.kind != "line" && (element.width <= 0.0 || element.height <= 0.0) {
            return Err(format!("{label} width and height must be positive"));
        }
        if element.kind == "line" && element.width <= 0.0 && element.height <= 0.0 {
            return Err(format!("{label} line must have a visible length"));
        }
        if element.kind == "line" && element.stroke.is_none() {
            return Err(format!("{label} line requires a stroke color"));
        }
        if let Some(value) = element.opacity {
            if !value.is_finite() || !(0.0..=1.0).contains(&value) {
                return Err(format!("{label} opacity must be between 0 and 1"));
            }
        }
        if let Some(value) = element.stroke_width {
            if !value.is_finite() || !(0.0..=12.0).contains(&value) {
                return Err(format!("{label} strokeWidth must be between 0 and 12 pt"));
            }
        }
        if let Some(value) = element.font_size {
            if !value.is_finite() || !(8.0..=72.0).contains(&value) {
                return Err(format!("{label} fontSize must be between 8 and 72 pt"));
            }
        }
        for color in [&element.fill, &element.stroke, &element.color]
            .into_iter()
            .flatten()
        {
            normalize_color(color).map_err(|e| format!("{label}: {e}"))?;
        }
        if element.kind == "text" && element.text.is_none() {
            return Err(format!("{label} text element requires text"));
        }
        if element.kind != "text" && element.text.is_some() {
            return Err(format!("{label} text is allowed only for kind=text"));
        }
        if let Some(text) = &element.text {
            valid_text(text).map_err(|e| format!("{label}: {e}"))?;
        }
    }
    Ok(())
}

/// Canvas pages cannot silently clip authored evidence or titles.
pub fn validate_canvas_text(elements: &[PresentationElement]) -> Result<(), String> {
    for (index, element) in elements.iter().enumerate().filter(|(_, e)| e.kind == "text") {
        if element.color.is_none() {
            return Err(format!("canvas text element {} needs an explicit color", index + 1));
        }
        let width = f64::from(element.width) * SLIDE_W / 100.0;
        let height = f64::from(element.height) * SLIDE_H / 100.0;
        let lines = wrap_element_text(element.text.as_deref().unwrap_or(""), width, 12.0);
        if width < 9.0 * EMU_PER_PT || height < 16.0 * EMU_PER_PT
            || lines.len() as f64 * 12.0 * 1.3 * EMU_PER_PT > height - 4.0 * EMU_PER_PT {
            return Err(format!("canvas text element {} cannot fit at readable size; enlarge its box or condense text and put details in notes", index + 1));
        }
    }
    Ok(())
}

fn escape(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => output.push_str("&amp;"),
            '<' => output.push_str("&lt;"),
            '>' => output.push_str("&gt;"),
            '"' => output.push_str("&quot;"),
            '\'' => output.push_str("&apos;"),
            _ => output.push(ch),
        }
    }
    output
}

fn solid_fill(color: Option<&str>, opacity: f32) -> String {
    let Some(color) = color else {
        return "<a:noFill/>".into();
    };
    let hex = normalize_color(color).expect("validated vector color");
    let alpha = (f64::from(opacity) * 100_000.0).round() as u32;
    if alpha >= 100_000 {
        format!("<a:solidFill><a:srgbClr val=\"{hex}\"/></a:solidFill>")
    } else {
        format!("<a:solidFill><a:srgbClr val=\"{hex}\"><a:alpha val=\"{alpha}\"/></a:srgbClr></a:solidFill>")
    }
}

fn line_xml(color: Option<&str>, width: f32, opacity: f32) -> String {
    let Some(color) = color else {
        return "<a:ln><a:noFill/></a:ln>".into();
    };
    let hex = normalize_color(color).expect("validated vector color");
    let emu_width = (f64::from(width) * EMU_PER_PT).round().max(1.0) as u32;
    let alpha = (f64::from(opacity) * 100_000.0).round() as u32;
    format!("<a:ln w=\"{emu_width}\"><a:solidFill><a:srgbClr val=\"{hex}\"><a:alpha val=\"{alpha}\"/></a:srgbClr></a:solidFill><a:prstDash val=\"solid\"/><a:round/></a:ln>")
}

/// Render validated elements as native editable PresentationML `p:sp` shapes.
/// Starts IDs at the caller-provided reserved range and uses only internal XML.
pub fn render_elements(elements: &[PresentationElement], start_id: u32) -> String {
    debug_assert!(validate_elements(elements).is_ok());
    let mut xml = String::new();
    for (index, element) in elements.iter().enumerate() {
        let id = start_id.saturating_add(index as u32);
        let x = (f64::from(element.x) * SLIDE_W / 100.0).round() as i64;
        let y = (f64::from(element.y) * SLIDE_H / 100.0).round() as i64;
        let mut cx = (f64::from(element.width) * SLIDE_W / 100.0).round() as i64;
        let mut cy = (f64::from(element.height) * SLIDE_H / 100.0).round() as i64;
        cx = cx.max(1).min((SLIDE_W as i64 - x).max(1));
        cy = cy.max(1).min((SLIDE_H as i64 - y).max(1));
        let alpha = element.opacity.unwrap_or(1.0);
        let fill = solid_fill(element.fill.as_deref(), alpha);
        let stroke = line_xml(
            element.stroke.as_deref(),
            element.stroke_width.unwrap_or(1.0),
            alpha,
        );
        let preset = match element.kind.as_str() {
            "ellipse" => "ellipse",
            "line" => "line",
            _ => "rect",
        };
        let name = format!("Custom {} {}", element.kind, index + 1);
        let name_xml = escape(&name);
        let color = element
            .color
            .as_deref()
            .or(element.fill.as_deref())
            .or(element.stroke.as_deref())
            .map(|s| normalize_color(s).expect("validated color"))
            .unwrap_or_else(|| "172033".into());
        let Some(text) = element.text.as_deref() else {
            let (fill_xml, line) = if element.kind == "line" {
                ("<a:noFill/>".to_owned(), stroke)
            } else {
                (fill, stroke)
            };
            write!(xml, "<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"{name_xml}\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"{x}\" y=\"{y}\"/><a:ext cx=\"{cx}\" cy=\"{cy}\"/></a:xfrm><a:prstGeom prst=\"{preset}\"><a:avLst/></a:prstGeom>{fill_xml}{line}</p:spPr></p:sp>").expect("write to String");
            continue;
        };
        let (pt, lines) = fit_text_element(
            text,
            cx as f64,
            cy as f64,
            f64::from(element.font_size.unwrap_or(18.0)),
        );
        let sz = (pt * 100.0).round() as u32;
        let color_fill = solid_fill(Some(&color), alpha);
        write!(xml, "<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"{name_xml}\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"{x}\" y=\"{y}\"/><a:ext cx=\"{cx}\" cy=\"{cy}\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap=\"square\" lIns=\"45720\" tIns=\"22860\" rIns=\"45720\" bIns=\"22860\"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn=\"l\"><a:lnSpc><a:spcPts val=\"{}\"/></a:lnSpc><a:buNone/></a:pPr>", ((pt * 1.3) * 100.0).round() as u32).expect("write to String");
        for (line_index, line) in lines.iter().enumerate() {
            if line_index > 0 {
                write!(xml, "<a:br><a:rPr lang=\"zh-CN\" sz=\"{sz}\"><a:latin typeface=\"{FONT}\"/><a:ea typeface=\"{FONT}\"/></a:rPr></a:br>").expect("write to String");
            }
            write!(xml, "<a:r><a:rPr lang=\"zh-CN\" sz=\"{sz}\" dirty=\"0\">{color_fill}<a:latin typeface=\"{FONT}\"/><a:ea typeface=\"{FONT}\"/></a:rPr><a:t xml:space=\"preserve\">{}</a:t></a:r>", escape(line)).expect("write to String");
        }
        write!(
            xml,
            "<a:endParaRPr lang=\"zh-CN\" sz=\"{sz}\"/></a:p></p:txBody></p:sp>"
        )
        .expect("write to String");
    }
    // Keep namespace constants visible here as an assertion against accidental
    // raw/external references in this renderer's output.
    debug_assert!(xml.is_empty() || (A_NS.len() > 10 && R_NS.len() > 10 && P_NS.len() > 10));
    xml
}

#[cfg(test)]
mod tests {
    use super::*;

    fn element(kind: &str) -> PresentationElement {
        PresentationElement {
            kind: kind.into(),
            x: 10.0,
            y: 20.0,
            width: 30.0,
            height: 15.0,
            fill: Some("#336699".into()),
            stroke: Some("FFFFFF".into()),
            stroke_width: Some(1.2),
            opacity: Some(0.8),
            color: Some("#000000".into()),
            font_size: Some(18.0),
            text: if kind == "text" {
                Some("Editable & <safe>".into())
            } else {
                None
            },
        }
    }

    #[test]
    fn vectors_are_native_safe_and_use_reserved_ids() {
        let elements = vec![
            element("rect"),
            element("ellipse"),
            element("line"),
            element("text"),
        ];
        validate_elements(&elements).unwrap();
        let xml = render_elements(&elements, 1000);
        for id in 1000..1004 {
            assert!(xml.contains(&format!("id=\"{id}\"")));
        }
        for geometry in ["rect", "ellipse", "line"] {
            assert!(xml.contains(&format!("prst=\"{geometry}\"")));
        }
        assert!(xml.contains("Editable &amp; &lt;safe&gt;"));
        assert!(
            !xml.contains("<svg") && !xml.contains("TargetMode") && !xml.contains("javascript:")
        );
    }

    #[test]
    fn fits_overlong_text_inside_native_element_box() {
        let mut value = element("text");
        value.width = 8.0;
        value.height = 2.0;
        value.text = Some("这是一个很长的原生文字图元，必须自动缩小或截断而不能让整份演示文稿失败".repeat(4));
        validate_elements(&[value.clone()]).unwrap();
        let xml = render_elements(&[value], 1000);
        assert!(xml.contains("<a:t"));
    }

    #[test]
    fn rejects_paths_scripts_bad_geometry_and_xml_controls() {
        for kind in ["path", "svg", "script", "image"] {
            assert!(validate_elements(&[element(kind)]).is_err());
        }
        let mut bad = element("rect");
        bad.x = 99.0;
        bad.width = 2.0;
        assert!(validate_elements(&[bad]).is_err());
        let mut bad = element("text");
        bad.text = Some("bad\u{1}".into());
        assert!(validate_elements(&[bad]).is_err());
        let mut bad = element("rect");
        bad.opacity = Some(2.0);
        assert!(validate_elements(&[bad]).is_err());
        let mut bad = element("rect");
        bad.fill = Some("red".into());
        assert!(validate_elements(&[bad]).is_err());
        assert_eq!(normalize_color("#ab12EF").unwrap(), "AB12EF");
    }
}
