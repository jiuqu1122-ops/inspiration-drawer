//! Static SVG deliverables only. No scripts, CSS, links, external resources or raster masquerading as vectors.
use quick_xml::{events::Event, Reader};
use std::collections::{HashMap, HashSet};
pub const MAX_SVG_BYTES: usize = 500_000;
pub fn validate_svg(source: &str) -> Result<(), String> {
    if source.len() > MAX_SVG_BYTES {
        return Err("SVG 超过 500 KB，请精简矢量路径".into());
    }
    let mut reader = Reader::from_str(source);
    reader.config_mut().check_end_names = true;
    let tags = [
        "svg",
        "g",
        "defs",
        "path",
        "rect",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
        "text",
        "tspan",
        "title",
        "desc",
        "linearGradient",
        "radialGradient",
        "stop",
        "clipPath",
        "mask",
    ];
    let attrs = [
        "xmlns",
        "id",
        "width",
        "height",
        "viewBox",
        "x",
        "y",
        "x1",
        "y1",
        "x2",
        "y2",
        "cx",
        "cy",
        "r",
        "rx",
        "ry",
        "d",
        "points",
        "transform",
        "fill",
        "fill-opacity",
        "fill-rule",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-miterlimit",
        "stroke-dasharray",
        "stroke-dashoffset",
        "stroke-opacity",
        "opacity",
        "clip-path",
        "clip-rule",
        "mask",
        "font-family",
        "font-size",
        "font-weight",
        "letter-spacing",
        "text-anchor",
        "dominant-baseline",
        "dx",
        "dy",
        "gradientUnits",
        "gradientTransform",
        "spreadMethod",
        "offset",
        "stop-color",
        "stop-opacity",
        "fx",
        "fy",
        "fr",
        "maskUnits",
        "maskContentUnits",
        "clipPathUnits",
        "preserveAspectRatio",
        "role",
        "aria-label",
    ];
    let mut stack: Vec<usize> = vec![];
    let mut names: Vec<String> = vec![];
    let mut ids = HashMap::new();
    let mut refs: Vec<(usize, String)> = vec![];
    let mut roots = 0;
    let mut count = 0;
    let mut tree_edges = vec![];
    loop {
        let event = reader
            .read_event()
            .map_err(|e| format!("SVG XML 无效：{e}"))?;
        let empty = matches!(&event, Event::Empty(_));
        match event {
            Event::Start(e) | Event::Empty(e) => {
                let tag = std::str::from_utf8(e.name().as_ref())
                    .map_err(|_| "SVG 标签必须是 UTF-8")?
                    .to_string();
                if !tags.contains(&tag.as_str()) {
                    return Err(format!(
                        "SVG 不支持标签 {tag}；只能生成静态矢量，不含脚本或外部资源"
                    ));
                }
                if stack.is_empty() {
                    roots += 1;
                    if roots != 1 || tag != "svg" {
                        return Err("SVG 需要唯一的 svg 根元素".into());
                    }
                }
                count += 1;
                if count > 10_000 || stack.len() > 64 {
                    return Err("SVG 图层过多或嵌套过深".into());
                }
                let index = names.len();
                if let Some(parent) = stack.last() {
                    tree_edges.push((*parent, index));
                }
                names.push(tag.clone());
                let mut has_viewbox = false;
                let mut has_namespace = false;
                for attribute in e.attributes() {
                    let a = attribute.map_err(|_| "SVG 属性重复或无效")?;
                    let name = std::str::from_utf8(a.key.as_ref()).map_err(|_| "SVG 属性无效")?;
                    if !attrs.contains(&name) {
                        return Err(format!(
                            "SVG 不支持属性 {name}；禁止事件、style、href 与外部资源"
                        ));
                    }
                    let value = a
                        .decode_and_unescape_value(reader.decoder())
                        .map_err(|_| "SVG 属性实体无效")?;
                    if value.len() > 150_000
                        || value.chars().any(|c| c.is_control() && !c.is_whitespace())
                    {
                        return Err("SVG 属性值过长或含控制字符".into());
                    }
                    if name == "xmlns" {
                        if value != "http://www.w3.org/2000/svg" {
                            return Err("SVG 命名空间无效".into());
                        }
                        has_namespace = true;
                    }
                    if name == "id" {
                        if value.is_empty()
                            || value.len() > 100
                            || !value
                                .chars()
                                .all(|c| c.is_ascii_alphanumeric() || "_-".contains(c))
                            || ids.insert(value.to_string(), index).is_some()
                        {
                            return Err("SVG id 无效或重复".into());
                        }
                    }
                    if name == "viewBox" {
                        let n: Vec<f64> = value
                            .split(|c: char| c.is_whitespace() || c == ',')
                            .filter(|s| !s.is_empty())
                            .map(str::parse::<f64>)
                            .collect::<Result<_, _>>()
                            .map_err(|_| "SVG viewBox 无效")?;
                        if n.len() != 4
                            || n.iter().any(|n| !n.is_finite() || n.abs() > 100_000.)
                            || n[2] <= 0.
                            || n[3] <= 0.
                            || n[2] > 8192.
                            || n[3] > 8192.
                        {
                            return Err("SVG viewBox 尺寸应为 1～8192".into());
                        }
                        has_viewbox = true;
                    }
                    if name != "xmlns" {
                        let lower = value.to_ascii_lowercase();
                        if lower.contains("url(") {
                            let Some(id) = value
                                .strip_prefix("url(#")
                                .and_then(|s| s.strip_suffix(')'))
                            else {
                                return Err("SVG 只允许 url(#本文件id) 引用".into());
                            };
                            if id.is_empty()
                                || !id
                                    .chars()
                                    .all(|c| c.is_ascii_alphanumeric() || "_-".contains(c))
                            {
                                return Err("SVG 引用无效".into());
                            }
                            refs.push((index, id.into()));
                        } else if lower.contains("://")
                            || lower.contains("javascript:")
                            || lower.contains("data:")
                            || lower.contains("file:")
                            || lower.contains("@import")
                        {
                            return Err("SVG 禁止外部链接、数据资源和危险协议".into());
                        }
                    }
                }
                if stack.is_empty() && (!has_viewbox || !has_namespace) {
                    return Err("SVG 根元素需要 xmlns 与有效 viewBox".into());
                }
                if !empty {
                    stack.push(index);
                }
            }
            Event::End(_) => {
                if stack.pop().is_none() {
                    return Err("SVG 闭合标签无效".into());
                }
            }
            Event::Text(t) => {
                if stack.is_empty()
                    && !t
                        .xml_content()
                        .map_err(|_| "SVG 文本编码无效")?
                        .trim()
                        .is_empty()
                {
                    return Err("SVG 根元素外不能有文本".into());
                }
            }
            Event::CData(_) => {
                if stack.is_empty() {
                    return Err("SVG 根元素外不能有内容".into());
                }
            }
            Event::GeneralRef(reference) => {
                let value = std::str::from_utf8(reference.as_ref()).map_err(|_| "SVG 实体无效")?;
                if !["amp", "lt", "gt", "quot", "apos"].contains(&value)
                    && !value.strip_prefix("#x").is_some_and(|n| {
                        u32::from_str_radix(n, 16)
                            .ok()
                            .and_then(char::from_u32)
                            .is_some()
                    })
                    && !value
                        .strip_prefix('#')
                        .is_some_and(|n| n.parse::<u32>().ok().and_then(char::from_u32).is_some())
                {
                    return Err("SVG 只允许标准或数字实体".into());
                }
            }
            Event::Decl(_) | Event::Comment(_) => {}
            Event::Eof => break,
            _ => return Err("SVG 禁止 DTD、处理指令和自定义实体".into()),
        }
    }
    if roots != 1 || !stack.is_empty() {
        return Err("SVG 文档不完整".into());
    }
    // Gradient, mask and clip references must resolve to local resource definitions, never recursive rendering.
    let mut edges: HashMap<usize, Vec<usize>> = HashMap::new();
    for (parent, child) in tree_edges {
        edges.entry(parent).or_default().push(child);
    }
    for (from, id) in refs {
        let target = *ids.get(&id).ok_or("SVG 引用了不存在的 id")?;
        if !["linearGradient", "radialGradient", "mask", "clipPath"]
            .contains(&names[target].as_str())
        {
            return Err("SVG 引用目标不是本地渐变/遮罩/裁切定义".into());
        }
        edges.entry(from).or_default().push(target);
    }
    fn visit(
        n: usize,
        edges: &HashMap<usize, Vec<usize>>,
        visiting: &mut HashSet<usize>,
        done: &mut HashSet<usize>,
    ) -> Result<(), String> {
        if visiting.len() > 64 { return Err("SVG 资源引用链过深".into()); }
        if done.contains(&n) {
            return Ok(());
        }
        if !visiting.insert(n) {
            return Err("SVG 禁止循环资源引用".into());
        }
        for target in edges.get(&n).into_iter().flatten() {
            visit(*target, edges, visiting, done)?;
        }
        visiting.remove(&n);
        done.insert(n);
        Ok(())
    }
    let mut done = HashSet::new();
    for n in edges.keys() {
        visit(*n, &edges, &mut HashSet::new(), &mut done)?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    const CAT: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>矢量小猫</title><defs><linearGradient id="coat"><stop offset="0" stop-color="#f6d5a6"/><stop offset="1" stop-color="#d89a5d"/></linearGradient></defs><path d="M 52 100 L 48 30 L 100 65 Q 128 50 156 65 L 210 30 L 205 100 Q 225 220 128 224 Q 30 220 52 100 Z" fill="url(#coat)" stroke="#49372d" stroke-width="5"/><circle cx="93" cy="126" r="7"/><circle cx="163" cy="126" r="7"/><path d="M 120 151 L 136 151 L 128 160 Z" fill="#cd797d"/></svg>"##;
    #[test]
    fn validates_real_editable_vector_cat_and_gradient() {
        validate_svg(CAT).unwrap();
    }
    #[test]
    fn rejects_active_content_and_external_resources() {
        for bad in [
            "<script>alert(1)</script>",
            "<foreignObject/>",
            "<image href=\"https://evil.test/a.png\"/>",
            "<style>path{fill:red}</style>",
            "<animate attributeName=\"x\"/>",
            "<a href=\"javascript:evil\"/>",
        ] {
            let svg = format!(
                "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\">{bad}</svg>"
            );
            assert!(validate_svg(&svg).is_err(), "{bad}");
        }
        for attr in [
            "onload=\"alert(1)\"",
            "style=\"fill:red\"",
            "fill=\"url(https://evil.test/a)\"",
            "fill=\"url(&#106;avascript:evil)\"",
        ] {
            assert!(validate_svg(&format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><path d=\"M0 0\" {attr}/></svg>")).is_err());
        }
    }
    #[test]
    fn rejects_malformed_missing_dimensions_entities_and_oversize() {
        for bad in [
            "<svg/>",
            "<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///secret'>]><svg>&x;</svg>",
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><g></svg>",
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 NaN 10\"/>",
        ] {
            assert!(validate_svg(bad).is_err());
        }
        assert!(validate_svg(&"x".repeat(MAX_SVG_BYTES + 1)).is_err());
    }
}
