//! Resolve PPT images from persisted records in THIS conversation only.
//! Model-provided paths, URLs and image bytes are never accepted by this API.
use super::chat_presentation::{ChatPresentation, PresentationImage};
use rusqlite::{params, Connection, OptionalExtension};
use screenshots::image::{self, io::Reader, ImageOutputFormat};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufReader, Cursor, Read};
use std::path::Path;

const MAX_SOURCE_BYTES: u64 = 20_000_000;
const MAX_SOURCE_PIXELS: u64 = 40_000_000;
const MAX_EMBEDDED_BYTES: usize = 20_000_000;
const MAX_IMAGE_EDGE: u32 = 1920;

fn is_local_path(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && !value.contains("://")
        && !value.starts_with("data:")
        && !value.starts_with("blob:")
        && !value.starts_with("\\\\")
        && !value.starts_with("//")
}

fn generated_image_path(value: &Value, id: &str) -> Option<String> {
    let row = value.as_object()?;
    let matches = row.get("id").and_then(Value::as_str) == Some(id)
        || row.get("assetId").and_then(Value::as_str) == Some(id);
    if matches
        && row
            .get("type")
            .or_else(|| row.get("mediaType"))
            .and_then(Value::as_str)
            .unwrap_or("image")
            == "image"
    {
        if let Some(path) = row
            .get("path")
            .and_then(Value::as_str)
            .filter(|path| is_local_path(path))
        {
            return Some(path.to_string());
        }
    }
    for key in ["media", "outputs", "results"] {
        if let Some(values) = row.get(key).and_then(Value::as_array) {
            if let Some(path) = values
                .iter()
                .find_map(|item| generated_image_path(item, id))
            {
                return Some(path);
            }
        }
    }
    None
}

fn resolve_image_path(conn: &Connection, conversation: &str, id: &str) -> Result<String, String> {
    if id.is_empty()
        || id.len() > 180
        || id.contains('/')
        || id.contains('\\')
        || id.contains("://")
    {
        return Err(
            "PPT 图片必须使用本轮或当前会话已有的图片附件 ID，不能提供文件路径或网址".to_string(),
        );
    }
    let attachment: Option<String> = conn.query_row(
        "SELECT a.path FROM chat_attachments a JOIN chat_messages m ON m.id = a.message_id WHERE a.id = ?1 AND m.conversation_id = ?2 AND a.type = 'image' LIMIT 1",
        params![id, conversation], |row| row.get(0),
    ).optional().map_err(|error| format!("读取 PPT 图片附件失败：{error}"))?;
    if let Some(path) = attachment {
        return if is_local_path(&path) {
            Ok(path)
        } else {
            Err("PPT 图片尚未缓存到本地，请重新附加图片后重试；不会自动下载远程图片".to_string())
        };
    }
    // Only server-created media tool results may supply generated images. Never
    // scan ordinary assistant/user text or arbitrary tool payloads for paths.
    let mut statement = conn.prepare(
        "SELECT t.result_json FROM chat_tool_calls t JOIN chat_messages m ON m.id = t.message_id WHERE m.conversation_id = ?1 AND t.status = 'completed' AND t.tool_name IN ('generate_image','edit_image','generate_image_variants','batch_image_operation') AND t.result_json IS NOT NULL ORDER BY t.created_at DESC LIMIT 100",
    ).map_err(|error| format!("读取 PPT 生成图片失败：{error}"))?;
    let rows = statement
        .query_map([conversation], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    for row in rows {
        let json = row.map_err(|error| error.to_string())?;
        if json.len() > 2_000_000 {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(&json) {
            if let Some(path) = generated_image_path(&value, id) {
                return Ok(path);
            }
        }
    }
    Err(format!(
        "找不到当前会话中的 PPT 图片附件 {id}，请重新附图，不会读取其他会话的素材"
    ))
}

fn load_local_image(path: &Path) -> Result<PresentationImage, String> {
    if !path.is_absolute() || !is_local_path(&path.to_string_lossy()) {
        return Err("PPT 图片必须是已保存的本地图片附件".to_string());
    }
    let mut file = File::open(path)
        .map_err(|_| "PPT 图片文件已移动、删除或没有读取权限，请重新附图".to_string())?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_SOURCE_BYTES {
        return Err("PPT 单张原图不能超过 20MB".to_string());
    }
    let reader = Reader::new(BufReader::new(&file))
        .with_guessed_format()
        .map_err(|_| "无法识别 PPT 图片格式".to_string())?;
    let format = reader
        .format()
        .ok_or_else(|| "PPT 图片内容不是有效的 PNG/JPG/WebP 等栅格图片".to_string())?;
    let (width, height) = reader
        .into_dimensions()
        .map_err(|_| "无法读取 PPT 图片尺寸".to_string())?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_SOURCE_PIXELS {
        return Err("PPT 原图超过 4000 万像素，请缩小图片后重试".to_string());
    }
    // Read/decode the same open file after checking dimensions; a replaced file
    // path cannot bypass the header limits between our reads.
    use std::io::{Seek, SeekFrom};
    file.seek(SeekFrom::Start(0))
        .map_err(|error| error.to_string())?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_SOURCE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_SOURCE_BYTES {
        return Err("PPT 图片超过安全读取限制".to_string());
    }
    // Recheck the immutable byte snapshot in case the file was edited in place.
    let dimensions = Reader::with_format(Cursor::new(&bytes), format)
        .into_dimensions()
        .map_err(|_| "PPT 图片尺寸无效".to_string())?;
    if dimensions != (width, height) {
        return Err("PPT 图片在读取期间发生变化，请重试".to_string());
    }
    let mut reader = Reader::with_format(Cursor::new(&bytes), format);
    let mut limits = image::io::Limits::default();
    limits.max_alloc = Some(MAX_SOURCE_PIXELS * 4 + 8_000_000);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|_| "PPT 图片解码失败，请重新导出为 PNG 或 JPG".to_string())?;
    let resized = if width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE {
        decoded.resize(
            MAX_IMAGE_EDGE,
            MAX_IMAGE_EDGE,
            image::imageops::FilterType::Triangle,
        )
    } else {
        decoded
    };
    let mut output = Cursor::new(Vec::new());
    let alpha = resized.color().has_alpha();
    let format = if alpha {
        ImageOutputFormat::Png
    } else {
        ImageOutputFormat::Jpeg(88)
    };
    resized
        .write_to(&mut output, format)
        .map_err(|_| "PPT 图片标准化失败".to_string())?;
    Ok(PresentationImage {
        bytes: output.into_inner(),
        extension: if alpha { "png" } else { "jpg" }.to_string(),
        width: resized.width(),
        height: resized.height(),
    })
}

pub fn resolve_presentation_images(
    conn: &Connection,
    conversation: &str,
    presentation: &ChatPresentation,
) -> Result<HashMap<String, PresentationImage>, String> {
    let mut seen = HashSet::new();
    let mut images = HashMap::new();
    let mut total = 0;
    for slide in &presentation.slides {
        let Some(id) = slide
            .image_attachment_id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
        else {
            continue;
        };
        if !seen.insert(id.to_string()) {
            continue;
        }
        let path = resolve_image_path(conn, conversation, id)?;
        let image = load_local_image(Path::new(&path))?;
        total += image.bytes.len();
        if total > MAX_EMBEDDED_BYTES {
            return Err("PPT 嵌入图片总量超过 20MB，请减少图片后重试".to_string());
        }
        images.insert(id.to_string(), image);
    }
    Ok(images)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE chat_messages(id TEXT, conversation_id TEXT); CREATE TABLE chat_attachments(id TEXT, message_id TEXT, type TEXT, path TEXT); CREATE TABLE chat_tool_calls(message_id TEXT, tool_name TEXT, status TEXT, result_json TEXT, created_at INTEGER); INSERT INTO chat_messages VALUES ('m1','current'),('m2','private-other'); INSERT INTO chat_attachments VALUES ('my-image','m1','image','C:/fixture/mine.png'),('other-image','m2','image','C:/fixture/private.png'),('remote-image','m1','image','https://example.test/image.png'),('not-image','m1','file','C:/fixture/doc.txt');").unwrap();
        conn
    }
    #[test]
    fn restricts_images_to_the_current_conversation() {
        let conn = database();
        assert_eq!(
            resolve_image_path(&conn, "current", "my-image").unwrap(),
            "C:/fixture/mine.png"
        );
        for id in [
            "other-image",
            "not-image",
            "remote-image",
            "C:/secret.png",
            "https://example.test/a",
            "../x",
        ] {
            assert!(resolve_image_path(&conn, "current", id).is_err(), "{id}");
        }
    }
    #[test]
    fn generated_images_require_known_tool_and_current_conversation() {
        let conn = database();
        let result = r#"{"results":[{"media":[{"id":"generated-safe","type":"image","path":"C:/fixture/result.png"}]}]}"#;
        conn.execute(
            "INSERT INTO chat_tool_calls VALUES ('m1','generate_image_variants','completed',?1,1)",
            [result],
        )
        .unwrap();
        assert_eq!(
            resolve_image_path(&conn, "current", "generated-safe").unwrap(),
            "C:/fixture/result.png"
        );
        assert!(resolve_image_path(&conn, "private-other", "generated-safe").is_err());
        conn.execute(
            "INSERT INTO chat_tool_calls VALUES ('m1','web_search','completed',?1,2)",
            [r#"{"media":[{"id":"untrusted","path":"C:/secret.png"}]}"#],
        )
        .unwrap();
        assert!(resolve_image_path(&conn, "current", "untrusted").is_err());
    }
    #[test]
    fn rejects_remote_unc_and_relative_paths() {
        for path in [
            "https://host/a.png",
            "asset://host/a.png",
            "data:image/png;base64,x",
            "\\\\server\\share\\a.png",
            "//host/a.png",
            "",
        ] {
            assert!(!is_local_path(path));
        }
        assert!(load_local_image(Path::new("relative.png")).is_err());
    }
    #[test]
    fn reads_actual_image_bytes_not_the_extension_and_bounds_embedded_dimensions() {
        let path = std::env::temp_dir().join(format!(
            "ppt-image-{}-{}.wrong",
            std::process::id(),
            rand::random::<u32>()
        ));
        let picture = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            2000,
            20,
            image::Rgba([40, 80, 120, 150]),
        ));
        picture
            .save_with_format(&path, image::ImageFormat::Png)
            .unwrap();
        let result = load_local_image(&path).unwrap();
        assert_eq!(result.extension, "png");
        assert_eq!(result.width, 1920);
        assert!(result.height > 0);
        assert!(result.bytes.starts_with(b"\x89PNG"));
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn fails_invalid_or_missing_bytes_instead_of_creating_blank_pictures() {
        let path = std::env::temp_dir().join(format!("ppt-invalid-{}.png", rand::random::<u32>()));
        std::fs::write(&path, b"not an image").unwrap();
        assert!(load_local_image(&path).is_err());
        std::fs::remove_file(&path).unwrap();
        assert!(load_local_image(&path).is_err());
    }
}
