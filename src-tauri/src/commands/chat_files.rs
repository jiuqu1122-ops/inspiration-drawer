use printpdf::{
    Mm, Op, ParsedFont, PdfDocument, PdfFontHandle, PdfPage, PdfSaveOptions, Point, Pt, TextItem,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

const MAX_SOURCE_BYTES: usize = 2_000_000;
const MAX_OUTPUT_BYTES: u64 = 25_000_000;
const MAX_SHEETS: usize = 20;
const MAX_ROWS: usize = 20_000;
const MAX_COLUMNS: usize = 100;
const MAX_CELL_CHARS: usize = 32_000;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSpreadsheetSheet {
    pub name: String,
    pub rows: Vec<Vec<Value>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCreateFileRequest {
    pub conversation_id: String,
    pub file_name: String,
    pub format: String,
    pub content: Option<String>,
    pub sheets: Option<Vec<ChatSpreadsheetSheet>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatGeneratedFile {
    id: String,
    name: String,
    path: String,
    format: String,
    mime_type: String,
    size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatGeneratedFileResult {
    files: Vec<ChatGeneratedFile>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GeneratedFormat {
    Text,
    Markdown,
    Csv,
    Json,
    Docx,
    Xlsx,
    Pdf,
}

impl GeneratedFormat {
    fn parse(value: &str) -> Result<Self, String> {
        match value
            .trim()
            .trim_start_matches('.')
            .to_ascii_lowercase()
            .as_str()
        {
            "txt" | "text" => Ok(Self::Text),
            "md" | "markdown" => Ok(Self::Markdown),
            "csv" => Ok(Self::Csv),
            "json" => Ok(Self::Json),
            "docx" | "word" => Ok(Self::Docx),
            "xlsx" | "excel" => Ok(Self::Xlsx),
            "pdf" => Ok(Self::Pdf),
            _ => Err(
                "暂不支持该文件格式，可使用 TXT、Markdown、CSV、JSON、DOCX、XLSX 或 PDF"
                    .to_string(),
            ),
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Text => "txt",
            Self::Markdown => "md",
            Self::Csv => "csv",
            Self::Json => "json",
            Self::Docx => "docx",
            Self::Xlsx => "xlsx",
            Self::Pdf => "pdf",
        }
    }

    fn mime_type(self) -> &'static str {
        match self {
            Self::Text => "text/plain",
            Self::Markdown => "text/markdown",
            Self::Csv => "text/csv",
            Self::Json => "application/json",
            Self::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            Self::Xlsx => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            Self::Pdf => "application/pdf",
        }
    }
}

fn sanitize_component(value: &str, fallback: &str, max_chars: usize) -> String {
    let basename = Path::new(value)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(value);
    let mut sanitized = basename
        .chars()
        .filter(|character| !character.is_control())
        .map(|character| {
            if matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) {
                '_'
            } else {
                character
            }
        })
        .take(max_chars)
        .collect::<String>();
    sanitized = sanitized.trim().trim_matches('.').trim().to_string();
    if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized
    }
}

fn normalized_file_name(value: &str, format: GeneratedFormat) -> String {
    let fallback = format!("AI生成文件.{}", format.extension());
    let mut name = sanitize_component(value, &fallback, 96);
    let has_expected_extension = Path::new(&name)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(format.extension()));
    if !has_expected_extension {
        let stem = Path::new(&name)
            .file_stem()
            .and_then(|value| value.to_str())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("AI生成文件");
        name = format!("{stem}.{}", format.extension());
    }
    name
}

fn generated_root(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map(|path| path.join("generated").join("chat"))
        .map_err(|error| format!("无法确定文件生成目录：{error}"))
}

fn xml_escape(value: &str) -> String {
    value
        .chars()
        .filter(|character| matches!(*character, '\t' | '\n' | '\r') || (*character as u32) >= 0x20)
        .flat_map(|character| match character {
            '&' => "&amp;".chars().collect::<Vec<_>>(),
            '<' => "&lt;".chars().collect::<Vec<_>>(),
            '>' => "&gt;".chars().collect::<Vec<_>>(),
            '"' => "&quot;".chars().collect::<Vec<_>>(),
            '\'' => "&apos;".chars().collect::<Vec<_>>(),
            other => vec![other],
        })
        .collect()
}

fn strip_inline_markdown(value: &str) -> String {
    value
        .replace("**", "")
        .replace("__", "")
        .replace('`', "")
        .replace("~~", "")
}

fn zip_options() -> SimpleFileOptions {
    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)
}

fn add_zip_text(zip: &mut ZipWriter<File>, name: &str, content: &str) -> Result<(), String> {
    zip.start_file(name, zip_options())
        .map_err(|error| format!("创建文件内容失败：{error}"))?;
    zip.write_all(content.as_bytes())
        .map_err(|error| format!("写入文件内容失败：{error}"))
}

fn docx_paragraph(line: &str) -> String {
    if line.trim().is_empty() {
        return "<w:p/>".to_string();
    }
    let trimmed = line.trim();
    let (style, text) = if let Some(value) = trimmed.strip_prefix("### ") {
        (Some("Heading3"), value.to_string())
    } else if let Some(value) = trimmed.strip_prefix("## ") {
        (Some("Heading2"), value.to_string())
    } else if let Some(value) = trimmed.strip_prefix("# ") {
        (Some("Heading1"), value.to_string())
    } else if let Some(value) = trimmed
        .strip_prefix("- ")
        .or_else(|| trimmed.strip_prefix("* "))
    {
        (Some("ListParagraph"), format!("• {value}"))
    } else {
        (None, line.to_string())
    };
    let style_xml = style
        .map(|value| format!("<w:pPr><w:pStyle w:val=\"{value}\"/></w:pPr>"))
        .unwrap_or_default();
    format!(
        "<w:p>{style_xml}<w:r><w:rPr><w:rFonts w:ascii=\"Aptos\" w:hAnsi=\"Aptos\" w:eastAsia=\"Microsoft YaHei\"/></w:rPr><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
        xml_escape(&strip_inline_markdown(&text))
    )
}

fn write_docx(path: &Path, title: &str, content: &str) -> Result<(), String> {
    let file = File::create(path).map_err(|error| format!("创建 Word 文件失败：{error}"))?;
    let mut zip = ZipWriter::new(file);
    add_zip_text(
        &mut zip,
        "[Content_Types].xml",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>"#,
    )?;
    add_zip_text(
        &mut zip,
        "_rels/.rels",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>"#,
    )?;
    add_zip_text(
        &mut zip,
        "word/_rels/document.xml.rels",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>"#,
    )?;
    add_zip_text(
        &mut zip,
        "word/styles.xml",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr></w:style></w:styles>"#,
    )?;
    let paragraphs = content.lines().map(docx_paragraph).collect::<String>();
    let document = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>"#
    );
    add_zip_text(&mut zip, "word/document.xml", &document)?;
    let now = chrono::Utc::now().to_rfc3339();
    add_zip_text(
        &mut zip,
        "docProps/core.xml",
        &format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>{}</dc:title><dc:creator>Inspiration Drawer AI</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created></cp:coreProperties>"#,
            xml_escape(title)
        ),
    )?;
    add_zip_text(
        &mut zip,
        "docProps/app.xml",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Inspiration Drawer</Application></Properties>"#,
    )?;
    zip.finish()
        .map_err(|error| format!("完成 Word 文件失败：{error}"))?;
    Ok(())
}

fn excel_column_name(mut index: usize) -> String {
    let mut name = String::new();
    index += 1;
    while index > 0 {
        let remainder = (index - 1) % 26;
        name.insert(0, (b'A' + remainder as u8) as char);
        index = (index - 1) / 26;
    }
    name
}

fn cell_display_text(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::String(value) => value.clone(),
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

fn worksheet_xml(rows: &[Vec<Value>]) -> String {
    let column_count = rows
        .iter()
        .map(Vec::len)
        .max()
        .unwrap_or(0)
        .min(MAX_COLUMNS);
    let mut widths = vec![10usize; column_count];
    for row in rows.iter().take(MAX_ROWS) {
        for (index, value) in row.iter().take(MAX_COLUMNS).enumerate() {
            let width = cell_display_text(value).chars().count().clamp(4, 40) + 2;
            widths[index] = widths[index].max(width);
        }
    }
    let columns = widths
        .iter()
        .enumerate()
        .map(|(index, width)| {
            format!(
                "<col min=\"{}\" max=\"{}\" width=\"{}\" customWidth=\"1\"/>",
                index + 1,
                index + 1,
                width
            )
        })
        .collect::<String>();
    let sheet_rows = rows
        .iter()
        .take(MAX_ROWS)
        .enumerate()
        .map(|(row_index, row)| {
            let cells = row
                .iter()
                .take(MAX_COLUMNS)
                .enumerate()
                .map(|(column_index, value)| {
                    let reference = format!("{}{}", excel_column_name(column_index), row_index + 1);
                    let style = if row_index == 0 { " s=\"1\"" } else { "" };
                    match value {
                        Value::Null => format!("<c r=\"{reference}\"{style}/>"),
                        Value::Bool(value) => format!("<c r=\"{reference}\" t=\"b\"{style}><v>{}</v></c>", if *value { 1 } else { 0 }),
                        Value::Number(value) => format!("<c r=\"{reference}\"{style}><v>{value}</v></c>"),
                        _ => {
                            let text = cell_display_text(value).chars().take(MAX_CELL_CHARS).collect::<String>();
                            format!("<c r=\"{reference}\" t=\"inlineStr\"{style}><is><t xml:space=\"preserve\">{}</t></is></c>", xml_escape(&text))
                        }
                    }
                })
                .collect::<String>();
            format!("<row r=\"{}\">{cells}</row>", row_index + 1)
        })
        .collect::<String>();
    let frozen = if rows.len() > 1 {
        r#"<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>"#
    } else {
        r#"<sheetViews><sheetView workbookViewId="0"/></sheetViews>"#
    };
    let auto_filter = if rows.len() > 1 && column_count > 0 {
        format!(
            "<autoFilter ref=\"A1:{}{}\"/>",
            excel_column_name(column_count - 1),
            rows.len().min(MAX_ROWS)
        )
    } else {
        String::new()
    };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{frozen}<cols>{columns}</cols><sheetData>{sheet_rows}</sheetData>{auto_filter}</worksheet>"#
    )
}

fn unique_sheet_names(sheets: &[ChatSpreadsheetSheet]) -> Vec<String> {
    let mut used = Vec::<String>::new();
    sheets
        .iter()
        .take(MAX_SHEETS)
        .enumerate()
        .map(|(index, sheet)| {
            let base = sheet
                .name
                .chars()
                .map(|character| {
                    if matches!(character, '[' | ']' | ':' | '*' | '?' | '/' | '\\') {
                        '_'
                    } else {
                        character
                    }
                })
                .take(31)
                .collect::<String>()
                .trim_matches('\'')
                .trim()
                .to_string();
            let base = if base.is_empty() {
                format!("Sheet{}", index + 1)
            } else {
                base
            };
            let mut candidate = base.clone();
            let mut suffix = 2usize;
            while used
                .iter()
                .any(|value| value.eq_ignore_ascii_case(&candidate))
            {
                let suffix_text = format!(" ({suffix})");
                let keep = 31usize.saturating_sub(suffix_text.chars().count());
                candidate = format!(
                    "{}{}",
                    base.chars().take(keep).collect::<String>(),
                    suffix_text
                );
                suffix += 1;
            }
            used.push(candidate.clone());
            candidate
        })
        .collect()
}

fn write_xlsx(path: &Path, sheets: &[ChatSpreadsheetSheet]) -> Result<(), String> {
    if sheets.is_empty() {
        return Err("Excel 文件至少需要一个工作表".to_string());
    }
    if sheets.len() > MAX_SHEETS {
        return Err(format!("Excel 文件最多支持 {MAX_SHEETS} 个工作表"));
    }
    let total_rows = sheets.iter().map(|sheet| sheet.rows.len()).sum::<usize>();
    if total_rows > MAX_ROWS {
        return Err(format!("Excel 文件合计最多支持 {MAX_ROWS} 行"));
    }
    if sheets
        .iter()
        .flat_map(|sheet| &sheet.rows)
        .any(|row| row.len() > MAX_COLUMNS)
    {
        return Err(format!("Excel 文件每行最多支持 {MAX_COLUMNS} 列"));
    }
    let file = File::create(path).map_err(|error| format!("创建 Excel 文件失败：{error}"))?;
    let mut zip = ZipWriter::new(file);
    let sheet_names = unique_sheet_names(sheets);
    let overrides = sheets
        .iter()
        .take(MAX_SHEETS)
        .enumerate()
        .map(|(index, _)| format!("<Override PartName=\"/xl/worksheets/sheet{}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>", index + 1))
        .collect::<String>();
    add_zip_text(
        &mut zip,
        "[Content_Types].xml",
        &format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>{overrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>"#
        ),
    )?;
    add_zip_text(
        &mut zip,
        "_rels/.rels",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>"#,
    )?;
    let workbook_sheets = sheet_names
        .iter()
        .enumerate()
        .map(|(index, name)| {
            format!(
                "<sheet name=\"{}\" sheetId=\"{}\" r:id=\"rId{}\"/>",
                xml_escape(name),
                index + 1,
                index + 1
            )
        })
        .collect::<String>();
    add_zip_text(
        &mut zip,
        "xl/workbook.xml",
        &format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>{workbook_sheets}</sheets></workbook>"#
        ),
    )?;
    let workbook_rels = sheets
        .iter()
        .take(MAX_SHEETS)
        .enumerate()
        .map(|(index, _)| format!("<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{}.xml\"/>", index + 1, index + 1))
        .collect::<String>();
    add_zip_text(
        &mut zip,
        "xl/_rels/workbook.xml.rels",
        &format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{workbook_rels}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>"#
        ),
    )?;
    add_zip_text(
        &mut zip,
        "xl/styles.xml",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="11"/><name val="Aptos"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>"#,
    )?;
    for (index, sheet) in sheets.iter().take(MAX_SHEETS).enumerate() {
        add_zip_text(
            &mut zip,
            &format!("xl/worksheets/sheet{}.xml", index + 1),
            &worksheet_xml(&sheet.rows),
        )?;
    }
    let now = chrono::Utc::now().to_rfc3339();
    add_zip_text(
        &mut zip,
        "docProps/core.xml",
        &format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Inspiration Drawer AI</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created></cp:coreProperties>"#
        ),
    )?;
    add_zip_text(
        &mut zip,
        "docProps/app.xml",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Inspiration Drawer</Application></Properties>"#,
    )?;
    zip.finish()
        .map_err(|error| format!("完成 Excel 文件失败：{error}"))?;
    Ok(())
}

#[derive(Debug)]
struct PdfTextLine {
    text: String,
    size: f32,
    height: f32,
}

fn wrap_text(value: &str, max_width: usize) -> Vec<String> {
    if value.trim().is_empty() {
        return vec![String::new()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    let mut width = 0usize;
    for character in value.chars() {
        let char_width = if character.is_ascii() { 1 } else { 2 };
        if width + char_width > max_width && !current.is_empty() {
            lines.push(current.trim_end().to_string());
            current.clear();
            width = 0;
        }
        current.push(character);
        width += char_width;
    }
    if !current.is_empty() {
        lines.push(current.trim_end().to_string());
    }
    lines
}

fn pdf_text_lines(content: &str) -> Vec<PdfTextLine> {
    let mut output = Vec::new();
    for raw in content.lines() {
        let trimmed = raw.trim();
        let (text, size, height, width) = if let Some(value) = trimmed.strip_prefix("### ") {
            (value.to_string(), 14.0, 20.0, 74)
        } else if let Some(value) = trimmed.strip_prefix("## ") {
            (value.to_string(), 17.0, 24.0, 62)
        } else if let Some(value) = trimmed.strip_prefix("# ") {
            (value.to_string(), 22.0, 30.0, 48)
        } else if let Some(value) = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("* "))
        {
            (format!("• {value}"), 11.0, 17.0, 84)
        } else {
            (raw.to_string(), 11.0, 17.0, 88)
        };
        for line in wrap_text(&strip_inline_markdown(&text), width) {
            output.push(PdfTextLine {
                text: line,
                size,
                height,
            });
        }
    }
    if output.is_empty() {
        output.push(PdfTextLine {
            text: String::new(),
            size: 11.0,
            height: 17.0,
        });
    }
    output
}

fn pdf_font_candidates() -> Vec<(PathBuf, usize)> {
    let mut candidates = Vec::new();
    if let Some(windows_dir) = std::env::var_os("WINDIR") {
        let fonts = PathBuf::from(windows_dir).join("Fonts");
        candidates.extend([
            (fonts.join("msyh.ttc"), 0),
            (fonts.join("simhei.ttf"), 0),
            (fonts.join("simsun.ttc"), 0),
        ]);
    }
    candidates.extend([
        (PathBuf::from("/System/Library/Fonts/PingFang.ttc"), 0),
        (
            PathBuf::from("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
            0,
        ),
        (
            PathBuf::from("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            0,
        ),
    ]);
    candidates
}

fn write_pdf(path: &Path, title: &str, content: &str) -> Result<(), String> {
    let mut font_warnings = Vec::new();
    let font = pdf_font_candidates()
        .into_iter()
        .filter(|(path, _)| path.is_file())
        .find_map(|(path, index)| {
            let bytes = fs::read(path).ok()?;
            ParsedFont::from_bytes(&bytes, index, &mut font_warnings)
        })
        .ok_or_else(|| "未找到可用于生成 PDF 的系统字体".to_string())?;
    let mut document = PdfDocument::new(title);
    let font_id = document.add_font(&font);
    let mut pages = Vec::new();
    let lines = pdf_text_lines(content);
    let mut page_lines = Vec::<PdfTextLine>::new();
    let mut remaining_height = 730.0f32;
    for line in lines {
        if line.height > remaining_height && !page_lines.is_empty() {
            pages.push(std::mem::take(&mut page_lines));
            remaining_height = 730.0;
        }
        remaining_height -= line.height;
        page_lines.push(line);
    }
    if !page_lines.is_empty() {
        pages.push(page_lines);
    }
    let pdf_pages = pages
        .into_iter()
        .map(|lines| {
            let mut operations = vec![
                Op::StartTextSection,
                Op::SetTextCursor {
                    pos: Point::new(Mm(20.0), Mm(277.0)),
                },
            ];
            for line in lines {
                operations.push(Op::SetFont {
                    font: PdfFontHandle::External(font_id.clone()),
                    size: Pt(line.size),
                });
                operations.push(Op::SetLineHeight {
                    lh: Pt(line.height),
                });
                operations.push(Op::ShowText {
                    items: vec![TextItem::Text(if line.text.is_empty() {
                        " ".to_string()
                    } else {
                        line.text
                    })],
                });
                operations.push(Op::AddLineBreak);
            }
            operations.push(Op::EndTextSection);
            PdfPage::new(Mm(210.0), Mm(297.0), operations)
        })
        .collect::<Vec<_>>();
    let mut warnings = Vec::new();
    let bytes = document
        .with_pages(pdf_pages)
        .save(&PdfSaveOptions::default(), &mut warnings);
    fs::write(path, bytes).map_err(|error| format!("写入 PDF 文件失败：{error}"))
}

fn write_generated_file(
    path: &Path,
    format: GeneratedFormat,
    request: &ChatCreateFileRequest,
) -> Result<(), String> {
    let content = request.content.as_deref().unwrap_or_default();
    if content.len() > MAX_SOURCE_BYTES {
        return Err(format!(
            "文件内容不能超过 {} MB",
            MAX_SOURCE_BYTES / 1_000_000
        ));
    }
    if format == GeneratedFormat::Xlsx {
        let spreadsheet_bytes = serde_json::to_vec(request.sheets.as_deref().unwrap_or_default())
            .map_err(|error| format!("读取 Excel 数据失败：{error}"))?
            .len();
        if spreadsheet_bytes > MAX_SOURCE_BYTES {
            return Err(format!(
                "Excel 数据不能超过 {} MB",
                MAX_SOURCE_BYTES / 1_000_000
            ));
        }
    }
    match format {
        GeneratedFormat::Text | GeneratedFormat::Markdown => {
            fs::write(path, content).map_err(|error| format!("写入文本文件失败：{error}"))
        }
        GeneratedFormat::Csv => {
            let mut bytes = vec![0xEF, 0xBB, 0xBF];
            bytes.extend_from_slice(content.as_bytes());
            fs::write(path, bytes).map_err(|error| format!("写入 CSV 文件失败：{error}"))
        }
        GeneratedFormat::Json => {
            let value: Value = serde_json::from_str(content)
                .map_err(|error| format!("JSON 内容格式无效：{error}"))?;
            let pretty = serde_json::to_vec_pretty(&value)
                .map_err(|error| format!("整理 JSON 内容失败：{error}"))?;
            fs::write(path, pretty).map_err(|error| format!("写入 JSON 文件失败：{error}"))
        }
        GeneratedFormat::Docx => write_docx(path, &request.file_name, content),
        GeneratedFormat::Xlsx => write_xlsx(path, request.sheets.as_deref().unwrap_or_default()),
        GeneratedFormat::Pdf => write_pdf(path, &request.file_name, content),
    }
}

#[tauri::command]
pub async fn chat_create_file(
    app_handle: tauri::AppHandle,
    request: ChatCreateFileRequest,
) -> Result<ChatGeneratedFileResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let format = GeneratedFormat::parse(&request.format)?;
        let file_name = normalized_file_name(&request.file_name, format);
        let conversation = sanitize_component(&request.conversation_id, "conversation", 80);
        let directory = generated_root(&app_handle)?.join(conversation);
        fs::create_dir_all(&directory).map_err(|error| format!("创建文件目录失败：{error}"))?;
        let id = format!(
            "file-{}-{:08x}",
            chrono::Utc::now().timestamp_millis(),
            rand::random::<u32>()
        );
        let path = directory.join(format!("{}-{}", &id[5..], file_name));
        if let Err(error) = write_generated_file(&path, format, &request) {
            let _ = fs::remove_file(&path);
            return Err(error);
        }
        let size = fs::metadata(&path)
            .map_err(|error| format!("读取生成文件信息失败：{error}"))?
            .len();
        if size > MAX_OUTPUT_BYTES {
            let _ = fs::remove_file(&path);
            return Err(format!(
                "生成文件不能超过 {} MB",
                MAX_OUTPUT_BYTES / 1_000_000
            ));
        }
        Ok(ChatGeneratedFileResult {
            files: vec![ChatGeneratedFile {
                id,
                name: file_name,
                path: path.to_string_lossy().to_string(),
                format: format.extension().to_string(),
                mime_type: format.mime_type().to_string(),
                size,
            }],
        })
    })
    .await
    .map_err(|error| format!("文件生成任务失败：{error}"))?
}

#[tauri::command]
pub fn chat_copy_generated_file(
    app_handle: tauri::AppHandle,
    source_path: String,
    destination_path: String,
) -> Result<String, String> {
    let root = generated_root(&app_handle)?;
    fs::create_dir_all(&root).map_err(|error| format!("读取文件生成目录失败：{error}"))?;
    let resolved_root =
        fs::canonicalize(&root).map_err(|error| format!("读取文件生成目录失败：{error}"))?;
    let source =
        fs::canonicalize(&source_path).map_err(|error| format!("生成文件不存在：{error}"))?;
    if !source.is_file() || !source.starts_with(&resolved_root) {
        return Err("只能另存由 AI Chat 生成的文件".to_string());
    }
    let destination = PathBuf::from(destination_path);
    let parent = destination
        .parent()
        .ok_or_else(|| "另存位置无效".to_string())?;
    if !parent.is_dir() {
        return Err("另存文件夹不存在".to_string());
    }
    fs::copy(&source, &destination).map_err(|error| format!("另存文件失败：{error}"))?;
    Ok(destination.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        normalized_file_name, write_docx, write_pdf, write_xlsx, ChatSpreadsheetSheet,
        GeneratedFormat,
    };
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use zip::ZipArchive;

    fn temp_path(extension: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "inspiration-chat-file-{}-{}.{}",
            std::process::id(),
            rand::random::<u32>(),
            extension
        ))
    }

    #[test]
    fn sanitizes_generated_file_names() {
        assert_eq!(
            normalized_file_name("../季度:报告.exe", GeneratedFormat::Docx),
            "季度_报告.docx"
        );
        assert_eq!(
            normalized_file_name("数据", GeneratedFormat::Xlsx),
            "数据.xlsx"
        );
    }

    #[test]
    fn creates_valid_docx_package() {
        let path = temp_path("docx");
        write_docx(&path, "测试报告", "# 标题\n\n- 第一项\n正文").unwrap();
        let file = fs::File::open(&path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        assert!(archive.by_name("word/document.xml").is_ok());
        assert!(archive.by_name("word/styles.xml").is_ok());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn creates_valid_xlsx_package() {
        let path = temp_path("xlsx");
        write_xlsx(
            &path,
            &[ChatSpreadsheetSheet {
                name: "数据".to_string(),
                rows: vec![
                    vec![json!("名称"), json!("数量")],
                    vec![json!("示例"), json!(3)],
                ],
            }],
        )
        .unwrap();
        let file = fs::File::open(&path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        assert!(archive.by_name("xl/workbook.xml").is_ok());
        assert!(archive.by_name("xl/worksheets/sheet1.xml").is_ok());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn creates_pdf_with_chinese_text() {
        let path = temp_path("pdf");
        write_pdf(
            &path,
            "测试报告",
            "# 中文报告\n\n这是一段用于验证中文字体嵌入的正文。",
        )
        .unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.len() > 1_000);
        let _ = fs::remove_file(path);
    }
}
