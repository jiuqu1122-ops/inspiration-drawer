//! Static SVG with bounded local filters. No scripts, CSS, links, external resources or raster images.
use quick_xml::{events::Event, Reader};
use std::{
    collections::{HashMap, HashSet},
    sync::LazyLock,
};
#[derive(serde::Deserialize)]
struct SvgCapabilities {
    tags: Vec<String>,
    attributes: Vec<String>,
}
fn svg_capabilities() -> &'static SvgCapabilities {
    static SPEC: LazyLock<SvgCapabilities> = LazyLock::new(|| {
        serde_json::from_str(include_str!(
            "../../../src/features/chat/tools/svgCapabilities.json"
        ))
        .expect("bundled SVG vocabulary")
    });
    &SPEC
}
fn local_reference(value: &str) -> Result<String, String> {
    let inner = value
        .trim()
        .strip_prefix("url(")
        .and_then(|s| s.strip_suffix(')'))
        .ok_or("SVG 只允许 url(#本文件id) 引用")?
        .trim();
    let inner = if inner.starts_with(['\"', '\'']) {
        let quote = inner.chars().next().unwrap();
        inner
            .strip_prefix(quote)
            .and_then(|s| s.strip_suffix(quote))
            .ok_or("SVG 引用格式无效")?
    } else {
        inner
    };
    let id = inner
        .strip_prefix('#')
        .ok_or("SVG 只允许本文件资源引用，不能访问外部地址")?;
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "_-".contains(c))
    {
        return Err("SVG 引用无效".into());
    }
    Ok(id.into())
}
fn bounded_numbers(value: &str, max: f64, nonnegative: bool) -> Result<Vec<f64>, String> {
    let numbers: Vec<f64> = value
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|s| !s.is_empty())
        .map(str::parse::<f64>)
        .collect::<Result<_, _>>()
        .map_err(|_| "SVG 滤镜参数必须为有限数值")?;
    if numbers.is_empty()
        || numbers
            .iter()
            .any(|n| !n.is_finite() || n.abs() > max || (nonnegative && *n < 0.))
    {
        return Err("SVG 参数超出安全预算".into());
    }
    Ok(numbers)
}
fn validate_static_attribute(tag: &str, name: &str, value: &str) -> Result<(), String> {
    let one_of = |allowed: &[&str]| {
        if allowed.contains(&value) {
            Ok(())
        } else {
            Err(format!("SVG {name} 的值不受支持"))
        }
    };
    match name {
        "paint-order" => {
            if value == "normal" {
                return Ok(());
            }
            let words: Vec<_> = value.split_whitespace().collect();
            if words.is_empty()
                || words.len() > 3
                || words
                    .iter()
                    .any(|w| !["fill", "stroke", "markers"].contains(w))
                || words.iter().collect::<HashSet<_>>().len() != words.len()
            {
                return Err("SVG paint-order 仅支持 normal 或 fill/stroke/markers 的排列".into());
            }
            Ok(())
        }
        "vector-effect" => one_of(&["none", "non-scaling-stroke"]),
        "filterUnits" | "primitiveUnits" => one_of(&["userSpaceOnUse", "objectBoundingBox"]),
        "color-interpolation" | "color-interpolation-filters" => {
            one_of(&["auto", "sRGB", "linearRGB"])
        }
        "stdDeviation" | "radius" if tag.starts_with("fe") => {
            if bounded_numbers(value, 32., true)?.len() > 2 {
                return Err("SVG 模糊或形态学参数最多两项".into());
            }
            Ok(())
        }
        "dx" | "dy" if tag.starts_with("fe") => {
            if bounded_numbers(value, 256., false)?.len() != 1 {
                return Err("SVG 滤镜参数必须为有限数值".into());
            }
            Ok(())
        }
        "x" | "y" | "width" | "height" if tag == "filter" || tag.starts_with("fe") => {
            let percentage = value.ends_with('%');
            let n = bounded_numbers(
                value.trim_end_matches('%'),
                if percentage { 400. } else { 16384. },
                matches!(name, "width" | "height"),
            )?;
            if n.len() != 1 || (matches!(name, "width" | "height") && n[0] == 0.) {
                return Err("SVG 滤镜区域尺寸无效".into());
            }
            Ok(())
        }
        "values" | "tableValues" | "slope" | "intercept" | "amplitude" | "exponent" | "k1"
        | "k2" | "k3" | "k4"
            if tag.starts_with("fe") =>
        {
            if bounded_numbers(value, 1000., false)?.len() > 256 {
                return Err("SVG 滤镜系数过多".into());
            }
            Ok(())
        }
        "mode" if tag == "feBlend" => one_of(&[
            "normal",
            "multiply",
            "screen",
            "darken",
            "lighten",
            "overlay",
            "color-dodge",
            "color-burn",
            "hard-light",
            "soft-light",
            "difference",
            "exclusion",
            "hue",
            "saturation",
            "color",
            "luminosity",
        ]),
        "operator" if tag == "feComposite" => {
            one_of(&["over", "in", "out", "atop", "xor", "arithmetic", "lighter"])
        }
        "operator" if tag == "feMorphology" => one_of(&["erode", "dilate"]),
        "type" if tag == "feColorMatrix" => {
            one_of(&["matrix", "saturate", "hueRotate", "luminanceToAlpha"])
        }
        "type" if tag.starts_with("feFunc") => {
            one_of(&["identity", "table", "discrete", "linear", "gamma"])
        }
        "in" | "in2" | "result" => {
            if value.len() > 100
                || !value
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "_-".contains(c))
            {
                return Err("SVG 滤镜输入或结果名称无效".into());
            }
            Ok(())
        }
        _ => Ok(()),
    }
}
fn root_dimension(value: &str) -> Result<(), String> {
    if value == "auto" {
        return Ok(());
    }
    let units = [
        ("%", 1., 400.),
        ("px", 1., 8192.),
        ("pt", 96. / 72., 8192.),
        ("pc", 16., 8192.),
        ("cm", 96. / 2.54, 8192.),
        ("mm", 96. / 25.4, 8192.),
        ("in", 96., 8192.),
        ("em", 16., 8192.),
        ("ex", 8., 8192.),
        ("", 1., 8192.),
    ];
    for (unit, scale, max) in units {
        if let Some(number) = value.trim().strip_suffix(unit) {
            if let Ok(n) = number.trim().parse::<f64>() {
                return if n.is_finite() && n > 0. && n * scale <= max {
                    Ok(())
                } else {
                    Err("SVG 根元素尺寸超出预算".into())
                };
            }
        }
    }
    Err("SVG 根元素尺寸需要有限数值或常用长度单位".into())
}
pub const MAX_SVG_BYTES: usize = 500_000;
pub fn validate_svg(source: &str) -> Result<(), String> {
    if source.len() > MAX_SVG_BYTES {
        return Err("SVG 超过 500 KB，请精简矢量路径".into());
    }
    let mut reader = Reader::from_str(source);
    reader.config_mut().check_end_names = true;
    let capabilities = svg_capabilities();
    let tags = &capabilities.tags;
    let attrs = &capabilities.attributes;
    let mut filter_count = 0;
    let mut filter_primitives = 0;
    let mut filter_references = 0;
    let mut viewport_area = 0_f64;
    let mut filter_area_factor = 1.44_f64;
    let mut stack: Vec<usize> = vec![];
    let mut names: Vec<String> = vec![];
    let mut ids = HashMap::new();
    let mut refs: Vec<(usize, String, String)> = vec![];
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
                if !tags.iter().any(|t| t == &tag) {
                    return Err(format!(
                        "SVG 不支持标签 {tag}；支持静态路径、文字、渐变、遮罩及有界滤镜，禁止脚本、位图或外部资源；请保留设计并修正该元素"
                    ));
                }
                let parent = stack.last().map(|&i| names[i].as_str());
                if tag == "filter" {
                    filter_count += 1;
                    if parent != Some("defs") || filter_count > 16 {
                        return Err("SVG filter 必须在 defs 中，最多 16 个".into());
                    }
                }
                if tag.starts_with("fe") {
                    filter_primitives += 1;
                    let expected = if tag == "feMergeNode" {
                        "feMerge"
                    } else if tag.starts_with("feFunc") {
                        "feComponentTransfer"
                    } else {
                        "filter"
                    };
                    if parent != Some(expected) || filter_primitives > 128 {
                        return Err("SVG 滤镜结构无效或超出 128 个处理步骤".into());
                    }
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
                let mut element_attributes = HashMap::new();
                for attribute in e.attributes() {
                    let a = attribute.map_err(|_| "SVG 属性重复或无效")?;
                    let name = std::str::from_utf8(a.key.as_ref()).map_err(|_| "SVG 属性无效")?;
                    if !attrs.iter().any(|a| a == name) {
                        return Err(format!(
                            "SVG 不支持属性 {name}；支持 paint-order、文字描边及有界静态滤镜，禁止事件、style、href 与外部资源；请保留设计并修正该属性"
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
                    // SVG presentation attributes are CSS values. Do not let escaped
                    // url/protocol spellings bypass the local-resource-only parser.
                    if value.contains('\\') {
                        return Err(
                            "SVG 属性不接受 CSS 转义；请使用普通静态值和本文件资源引用".into()
                        );
                    }
                    validate_static_attribute(&tag, name, &value)?;
                    element_attributes.insert(name.to_string(), value.to_string());
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
                        if stack.is_empty() {
                            viewport_area = n[2] * n[3];
                        }
                    }
                    if name != "xmlns" {
                        let lower = value.to_ascii_lowercase();
                        if lower.contains("url(") {
                            if !["fill", "stroke", "filter", "clip-path", "mask"].contains(&name) {
                                return Err("SVG 此属性不允许资源引用".into());
                            }
                            if refs.len() >= 4096 {
                                return Err("SVG 资源引用超出预算".into());
                            }
                            if name == "filter" {
                                filter_references += 1;
                            }
                            if filter_references > 64 {
                                return Err("SVG 滤镜实例超过 64 个".into());
                            }
                            refs.push((index, local_reference(&value)?, name.into()));
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
                if tag == "filter" {
                    let bounding_box_units = element_attributes
                        .get("filterUnits")
                        .is_none_or(|u| u != "userSpaceOnUse");
                    let mut scale = 1_f64;
                    for name in ["x", "y", "width", "height"] {
                        let value = element_attributes.get(name).map(String::as_str).unwrap_or(
                            if matches!(name, "width" | "height") {
                                "120%"
                            } else {
                                "-10%"
                            },
                        );
                        let percentage = value.ends_with('%');
                        let number =
                            bounded_numbers(value.trim_end_matches('%'), 16384., false)?[0];
                        if bounding_box_units && !percentage && number.abs() > 4. {
                            return Err("SVG objectBoundingBox 滤镜区域最多为原图的 4 倍，请使用百分比或正确的 userSpaceOnUse".into());
                        }
                        if matches!(name, "width" | "height") {
                            scale *= if percentage {
                                number / 100.
                            } else if bounding_box_units {
                                number
                            } else {
                                number / viewport_area.sqrt().max(1.)
                            };
                        }
                    }
                    filter_area_factor = filter_area_factor.max(scale);
                }
                if stack.is_empty() {
                    for name in ["width", "height"] {
                        if let Some(value) = element_attributes.get(name) {
                            root_dimension(value)?;
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
    if viewport_area
        * filter_area_factor
        * (filter_primitives.max(1) as f64)
        * (filter_references as f64)
        > 128_000_000.
    {
        return Err(
            "SVG 滤镜渲染成本超出预算；请缩小滤镜区域或减少重复滤镜，不能静默删除原设计".into(),
        );
    }
    // Gradient, mask and clip references must resolve to local resource definitions, never recursive rendering.
    let mut edges: HashMap<usize, Vec<usize>> = HashMap::new();
    for (parent, child) in tree_edges {
        edges.entry(parent).or_default().push(child);
    }
    for (from, id, attribute) in refs {
        let target = *ids.get(&id).ok_or("SVG 引用了不存在的 id")?;
        let allowed: &[&str] = match attribute.as_str() {
            "filter" => &["filter"],
            "mask" => &["mask"],
            "clip-path" => &["clipPath"],
            _ => &["linearGradient", "radialGradient"],
        };
        if !allowed.contains(&names[target].as_str()) {
            return Err(format!("SVG 参数或结构不符合安全静态矢量格式"));
        }
        edges.entry(from).or_default().push(target);
    }
    fn visit(
        n: usize,
        edges: &HashMap<usize, Vec<usize>>,
        visiting: &mut HashSet<usize>,
        done: &mut HashSet<usize>,
    ) -> Result<(), String> {
        if visiting.len() > 64 {
            return Err("SVG 资源引用链过深".into());
        }
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
    const LETTERING: &str =
        include_str!("../../../src/features/chat/tools/fixtures/reference-lettering.svg");
    fn svg(body: &str) -> String {
        format!(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600">{body}</svg>"#)
    }
    #[test]
    fn supports_reference_lettering_without_removing_outlines_gradients_or_shadows() {
        validate_svg(LETTERING).unwrap();
        for order in ["normal", "stroke fill", "fill stroke markers", "stroke"] {
            validate_svg(&svg(&format!(
                r#"<text paint-order="{order}" stroke="black" stroke-width="8">A &amp; B</text>"#
            )))
            .unwrap();
        }
    }
    #[test]
    fn supports_bounded_static_filter_pipeline() {
        for step in [
            r#"<feOffset dx="1" dy="-1"/>"#,
            r#"<feBlend in="SourceGraphic" in2="SourceAlpha" mode="multiply"/>"#,
            r#"<feColorMatrix type="saturate" values="0.5"/>"#,
            r#"<feComponentTransfer><feFuncA type="linear" slope="0.5" intercept="0"/></feComponentTransfer>"#,
            r#"<feMorphology operator="dilate" radius="2"/>"#,
        ] {
            validate_svg(&svg(&format!(r##"<defs><filter id="fx">{step}</filter></defs><path filter="url(#fx)" d="M0 0L10 10"/>"##))).unwrap();
        }
    }
    #[test]
    fn accepts_quoted_local_references_but_rejects_encoded_external_ones() {
        validate_svg(&LETTERING.replace("url(#shadow)", "url( &quot;#shadow&quot; )")).unwrap();
        for reference in [
            "url(https://evil.test/fx)",
            "url(&#104;ttps://evil.test/fx)",
            "url(data:image/svg+xml,bad)",
            "url(file:///secret)",
            "url(#missing)",
        ] {
            assert!(
                validate_svg(&LETTERING.replace("url(#shadow)", reference)).is_err(),
                "{reference}"
            );
        }
    }
    #[test]
    fn rejects_filter_resource_type_confusion_and_cycles() {
        assert!(validate_svg(
            &LETTERING.replace("filter=\"url(#shadow)\"", "filter=\"url(#metal)\"")
        )
        .is_err());
        assert!(
            validate_svg(&LETTERING.replace("fill=\"url(#metal)\"", "fill=\"url(#shadow)\""))
                .is_err()
        );
        assert!(validate_svg(&svg(r##"<defs><filter id="f"><feGaussianBlur filter="url(#f)" stdDeviation="1"/></filter></defs>"##)).is_err());
    }
    #[test]
    fn rejects_excessive_filter_cost_and_invalid_nesting() {
        for bad in [
            r#"<filter id="f"/>"#,
            r#"<defs><filter id="f"><feGaussianBlur stdDeviation="999"/></filter></defs>"#,
            r#"<defs><filter id="f"><feGaussianBlur stdDeviation="NaN"/></filter></defs>"#,
            r#"<defs><filter id="f" width="401%"/></defs>"#,
            r#"<defs><filter id="f"><feDropShadow dx="1e100"/></filter></defs>"#,
            r#"<feMergeNode in="SourceGraphic"/>"#,
            r#"<defs><filter id="f"><feImage href="https://evil.test/a"/></filter></defs>"#,
        ] {
            assert!(validate_svg(&svg(bad)).is_err(), "{bad}");
        }
        let steps = r#"<feGaussianBlur stdDeviation="1"/>"#.repeat(129);
        assert!(validate_svg(&svg(&format!(
            r#"<defs><filter id="f">{steps}</filter></defs>"#
        )))
        .is_err());
        let filters = (0..17)
            .map(|i| format!(r#"<filter id="f{i}"/>"#))
            .collect::<String>();
        assert!(validate_svg(&svg(&format!("<defs>{filters}</defs>"))).is_err());
    }
    #[test]
    fn rejects_active_content_even_inside_new_filter_elements() {
        for attr in [
            r#"onload="evil()""#,
            r#"style="filter:url(https://evil.test)""#,
            r#"href="file:///secret""#,
        ] {
            assert!(validate_svg(&svg(&format!(
                r#"<defs><filter id="f"><feDropShadow {attr}/></filter></defs>"#
            )))
            .is_err());
        }
        assert!(validate_svg(&svg(
            r#"<text paint-order="stroke onclick fill">Bad</text>"#
        ))
        .is_err());
    }

    #[test]
    fn bounds_filter_regions_even_without_percent_and_limits_aggregate_render_cost() {
        assert!(validate_svg(&svg(
            r#"<defs><filter id="f" width="400" height="400"/></defs>"#
        ))
        .is_err());
        assert!(validate_svg(&LETTERING.replace("width=\"900\"", "width=\"1e100\"")).is_err());
        assert!(validate_svg(
            &LETTERING.replace("viewBox=\"0 0 900 600\"", "viewBox=\"0 0 8192 8192\"")
        )
        .is_err());
        validate_svg(&svg(r#"<defs><filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="900" height="600"><feColorMatrix type="hueRotate" values="180"/></filter></defs>"#)).unwrap();
    }
    #[test]
    fn accepts_common_accessibility_attributes_and_physical_size_units() {
        validate_svg(&svg(r#"<g role="img" aria-label="logo" aria-hidden="false" aria-labelledby="caption" aria-describedby="description" focusable="false" xml:space="preserve"><title id="caption">A &amp; B</title><desc id="description">Reference lettering</desc><text paint-order="stroke fill">A</text></g>"#)).unwrap();
        for size in [
            "900", "900px", "100%", "100mm", "10cm", "4in", "72pt", "6pc", "auto",
        ] {
            validate_svg(&LETTERING.replace("width=\"900\"", &format!("width=\"{size}\"")))
                .unwrap();
        }
        for size in ["NaN", "-1cm", "1e100mm", "9999px", "url(https://evil)"] {
            assert!(validate_svg(
                &LETTERING.replace("width=\"900\"", &format!("width=\"{size}\""))
            )
            .is_err());
        }
    }
    #[test]
    fn rejects_css_escaped_resource_functions_in_exported_standalone_svg() {
        for value in [
            r"u\72l(//evil.test/fx)",
            r"url(\2f\2f evil.test/fx)",
            r"u&#92;72l(//evil.test/fx)",
        ] {
            assert!(validate_svg(&LETTERING.replace("url(#shadow)", value)).is_err());
        }
    }
}
