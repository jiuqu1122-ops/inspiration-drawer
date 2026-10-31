//! Content-based image input/output for local enhancement. Never trusts a file suffix.
use screenshots::image::{self, io::Reader, DynamicImage, ImageError, ImageFormat};
use std::fs::File;
use std::io::{BufReader, BufWriter, Write};
use std::path::Path;

fn content_reader(path: &Path) -> Result<Reader<BufReader<File>>, String> {
    let file = File::open(path).map_err(|error| {
        match error.kind() {
            std::io::ErrorKind::NotFound => {
                "图片增强[读取原图]：原文件不存在或已被移动，请重新接入图片"
            }
            std::io::ErrorKind::PermissionDenied => {
                "图片增强[读取原图]：没有读取权限，请检查文件权限后重试"
            }
            _ => "图片增强[读取原图]：无法读取原文件，请确认文件可用后重试",
        }
        .to_string()
    })?;
    // Reader::open seeds the format from the suffix; start without a format so
    // unrecognized bytes cannot silently fall back to a misleading extension.
    let reader = Reader::new(BufReader::new(file))
        .with_guessed_format()
        .map_err(|_| "图片增强[识别格式]：无法读取图片内容，请检查文件是否完整".to_string())?;
    if reader.format().is_none() {
        return Err("图片增强[识别格式]：图片内容不是受支持的格式，或文件已损坏；请重新导出为 PNG、JPG 或 WebP".to_string());
    }
    Ok(reader)
}

fn decode_error(error: ImageError) -> String {
    match error {
        ImageError::Limits(_) => "图片增强[解码原图]：图片超过安全解码限制，请缩小原图后重试",
        ImageError::Unsupported(_) => {
            "图片增强[解码原图]：暂不支持此图片编码，请重新导出为 PNG、JPG 或 WebP"
        }
        ImageError::IoError(_) => "图片增强[解码原图]：文件读取中断或内容不完整，请重新接入图片",
        _ => "图片增强[解码原图]：图片内容损坏或编码无效，请重新导出图片后重试",
    }
    .to_string()
}

pub(crate) fn dimensions(path: &Path) -> Result<(u32, u32), String> {
    let size = content_reader(path)?
        .into_dimensions()
        .map_err(decode_error)?;
    if size.0 == 0 || size.1 == 0 {
        return Err("图片增强[识别尺寸]：图片尺寸无效".to_string());
    }
    Ok(size)
}

fn decode(path: &Path) -> Result<DynamicImage, String> {
    // Keep image 0.24's default allocation limit; do not use no_limits().
    content_reader(path)?.decode().map_err(decode_error)
}

pub(crate) fn save_image(
    image: &DynamicImage,
    output: &Path,
    output_format: &str,
) -> Result<(), String> {
    let format = match output_format {
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "webp" => ImageFormat::WebP,
        "png" => ImageFormat::Png,
        _ => return Err("图片增强[保存结果]：不支持的输出格式".to_string()),
    };
    // Normalize bit depth/channel layout for the engine and encoders. PNG/WebP
    // retain alpha. JPEG has no alpha: explicitly composite onto white instead
    // of failing or silently turning transparent pixels black.
    let normalized = if format == ImageFormat::Jpeg && image.color().has_alpha() {
        let rgba = image.to_rgba8();
        let rgb = image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
            let pixel = rgba.get_pixel(x, y);
            let alpha = u32::from(pixel[3]);
            let channel =
                |value: u8| ((u32::from(value) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
            image::Rgb([channel(pixel[0]), channel(pixel[1]), channel(pixel[2])])
        });
        DynamicImage::ImageRgb8(rgb)
    } else if image.color().has_alpha() {
        DynamicImage::ImageRgba8(image.to_rgba8())
    } else {
        DynamicImage::ImageRgb8(image.to_rgb8())
    };
    let file = File::create(output)
        .map_err(|_| "图片增强[保存结果]：无法创建输出文件，请检查空间和写入权限".to_string())?;
    let mut writer = BufWriter::new(file);
    normalized
        .write_to(&mut writer, format)
        .map_err(|_| "图片增强[保存结果]：图片编码失败，请更换输出格式后重试".to_string())?;
    writer
        .flush()
        .map_err(|_| "图片增强[保存结果]：写入失败，请检查剩余空间和写入权限".to_string())
}

pub(crate) fn resize_image(
    input: &Path,
    output: &Path,
    width: u32,
    height: u32,
    output_format: &str,
) -> Result<(), String> {
    if input == output {
        return Err("图片增强[准备输入]：不能覆盖原文件".to_string());
    }
    let image = decode(input)?;
    let resized = if image.width() == width.max(1) && image.height() == height.max(1) {
        image
    } else {
        image.resize_exact(
            width.max(1),
            height.max(1),
            image::imageops::FilterType::Lanczos3,
        )
    };
    save_image(&resized, output, output_format)
}

pub(crate) fn prepare_png(
    source: &Path,
    prepared: &Path,
    width: u32,
    height: u32,
) -> Result<(), String> {
    resize_image(source, prepared, width, height, "png").map_err(|error| {
        error
            .replacen("[保存结果]", "[准备输入]", 1)
            .replace("输出文件", "临时输入文件")
    })
}

pub(crate) fn engine_error(error: &str) -> String {
    // Child stderr may contain full input/output paths. Expose a useful category,
    // never the raw engine message (nor the original user's path) to the UI.
    let lower = error.to_ascii_lowercase();
    let reason = if lower.contains("超时")
        || lower.contains("timed out")
        || lower.contains("timeout")
    {
        "增强超时，请缩小图片或关闭占用显卡的程序后重试"
    } else if lower.contains("out of memory") || lower.contains("allocate") || lower.contains("oom")
    {
        "显存或内存不足，请缩小图片或关闭占用显卡的程序后重试"
    } else if lower.contains("vulkan") || lower.contains("gpu") {
        "显卡初始化或计算失败，请检查显卡驱动后重试"
    } else {
        "本地引擎执行失败，请检查引擎安装和显卡驱动后重试"
    };
    format!("图片增强[引擎执行]：{}", reason)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "drawer-image-input-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn png(&self, name: &str) -> PathBuf {
            let path = self.0.join(name);
            let image = DynamicImage::ImageRgba8(image::RgbaImage::from_fn(12, 8, |x, _| {
                image::Rgba([20, 80, 140, if x == 0 { 0 } else { 128 }])
            }));
            save_image(&image, &path, "png").unwrap();
            path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let parent = std::env::temp_dir().canonicalize().unwrap();
            if let Ok(path) = self.0.canonicalize() {
                assert!(path.starts_with(&parent) && path != parent);
                let _ = fs::remove_dir_all(path);
            }
        }
    }

    #[test]
    fn image_input_sniffs_no_suffix_unknown_suffix_and_mismatched_suffix() {
        let fixture = Fixture::new();
        for name in [
            "normal.png",
            "no_suffix",
            "unknown.bin",
            "actually_png.jpg",
            "中文图片及空格 缓存",
        ] {
            let source = fixture.png(name);
            let original = fs::read(&source).unwrap();
            assert_eq!(dimensions(&source).unwrap(), (12, 8), "{}", name);
            let prepared = fixture.0.join("engine_input.png");
            prepare_png(&source, &prepared, 12, 8).unwrap();
            assert_eq!(fs::read(&source).unwrap(), original);
            assert_eq!(
                image::guess_format(&fs::read(&prepared).unwrap()).unwrap(),
                ImageFormat::Png
            );
            assert_eq!(dimensions(&prepared).unwrap(), (12, 8));
            assert_eq!(decode(&prepared).unwrap().to_rgba8().get_pixel(0, 0)[3], 0);
            assert_eq!(
                decode(&prepared).unwrap().to_rgba8().get_pixel(1, 0)[3],
                128
            );
        }
    }

    #[test]
    fn image_input_pre_resize_preserves_alpha_and_dimensions() {
        let fixture = Fixture::new();
        let source = fixture.png("透明.png");
        let prepared = fixture.0.join("safe_input.png");
        prepare_png(&source, &prepared, 6, 4).unwrap();
        assert_eq!(dimensions(&prepared).unwrap(), (6, 4));
        assert!(decode(&prepared)
            .unwrap()
            .to_rgba8()
            .pixels()
            .all(|p| p[3] < 255));
        assert!(prepare_png(&source, &source, 6, 4)
            .unwrap_err()
            .contains("不能覆盖"));
        assert_eq!(dimensions(&source).unwrap(), (12, 8));
    }

    #[test]
    fn image_input_rejects_corrupt_and_missing_files_without_paths() {
        let fixture = Fixture::new();
        let source = fixture.0.join("私密项目.png");
        fs::write(&source, b"not an image").unwrap();
        let error = dimensions(&source).unwrap_err();
        assert!(error.contains("识别格式"));
        assert!(!error.contains("私密") && !error.contains(&fixture.0.display().to_string()));
        let valid = fixture.png("valid.png");
        let mut truncated = fs::read(&valid).unwrap();
        truncated.truncate(truncated.len() / 2);
        fs::write(&source, truncated).unwrap();
        assert!(prepare_png(&source, &fixture.0.join("prepared.png"), 12, 8).is_err());
        assert!(!fixture.0.join("prepared.png").exists());
        fs::remove_file(&source).unwrap();
        let missing = dimensions(&source).unwrap_err();
        assert!(missing.contains("原文件不存在"));
        assert!(!missing.contains("私密"));
    }

    #[test]
    fn image_input_jpg_output_is_real_jpeg_with_white_alpha_background() {
        let fixture = Fixture::new();
        let source = fixture.png("source_without_suffix");
        let output = fixture.0.join("output.jpg");
        resize_image(&source, &output, 24, 16, "jpg").unwrap();
        assert_eq!(
            image::guess_format(&fs::read(&output).unwrap()).unwrap(),
            ImageFormat::Jpeg
        );
        assert_eq!(dimensions(&output).unwrap(), (24, 16));
        assert!(!decode(&output).unwrap().color().has_alpha());
        let white = DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            8,
            8,
            image::Rgba([255, 0, 0, 0]),
        ));
        save_image(&white, &output, "jpg").unwrap();
        assert!(decode(&output)
            .unwrap()
            .to_rgb8()
            .pixels()
            .all(|p| p.0.iter().all(|v| *v >= 250)));
        // JPEG bytes must also work without an extension, just like PNG.
        let cached = fixture.0.join("cached_jpeg");
        fs::copy(&output, &cached).unwrap();
        prepare_png(&cached, &fixture.0.join("engine_input.png"), 8, 8).unwrap();
    }

    #[test]
    fn image_input_webp_is_not_png_with_a_webp_suffix() {
        let fixture = Fixture::new();
        let source = fixture.png("input.png");
        let output = fixture.0.join("output.webp");
        resize_image(&source, &output, 24, 16, "webp").unwrap();
        assert_eq!(
            image::guess_format(&fs::read(&output).unwrap()).unwrap(),
            ImageFormat::WebP
        );
        assert_eq!(dimensions(&output).unwrap(), (24, 16));
        let prepared = fixture.0.join("from_webp.png");
        prepare_png(&output, &prepared, 24, 16).unwrap();
        assert!(decode(&prepared)
            .unwrap()
            .to_rgba8()
            .pixels()
            .any(|p| p[3] < 255));
    }

    #[test]
    fn image_input_engine_failures_are_stage_specific_and_redacted() {
        let error = engine_error(r"failed to allocate at C:\Users\Private\secret.png");
        assert!(error.contains("引擎执行") && error.contains("内存不足"));
        assert!(!error.contains("secret") && !error.contains("Private"));
        assert!(engine_error("timeout").contains("超时"));
        assert!(engine_error("vkCreateInstance vulkan").contains("显卡"));
    }

    #[test]
    fn image_input_keeps_existing_intermediate_and_final_safety_caps() {
        for (width, height) in [(12, 8), (4096, 4096), (12000, 8000), (100000, 2000)] {
            let (safe_width, safe_height, _) =
                crate::realesrgan_safe_input_dimensions(width, height);
            assert!(
                safe_width * crate::REALESRGAN_NATIVE_SCALE
                    <= crate::REALESRGAN_SAFE_INTERMEDIATE_MAX_EDGE
            );
            assert!(
                safe_height * crate::REALESRGAN_NATIVE_SCALE
                    <= crate::REALESRGAN_SAFE_INTERMEDIATE_MAX_EDGE
            );
            assert!(
                u64::from(safe_width) * u64::from(safe_height) * 16
                    <= crate::REALESRGAN_SAFE_INTERMEDIATE_MAX_PIXELS
            );
            let (output_width, output_height, _) = crate::realesrgan_fit_dimensions_to_limit(
                width * 2,
                height * 2,
                crate::REALESRGAN_SAFE_FINAL_MAX_EDGE,
                crate::REALESRGAN_SAFE_FINAL_MAX_PIXELS,
            );
            assert!(output_width <= crate::REALESRGAN_SAFE_FINAL_MAX_EDGE);
            assert!(output_height <= crate::REALESRGAN_SAFE_FINAL_MAX_EDGE);
            assert!(
                u64::from(output_width) * u64::from(output_height)
                    <= crate::REALESRGAN_SAFE_FINAL_MAX_PIXELS
            );
        }
    }

    #[test]
    #[ignore = "requires DRAWER_REALESRGAN_TEST_ENGINE pointing to an existing local engine; never installs/downloads"]
    fn image_input_real_engine_normalized_png_to_2x_jpg() {
        let exe = PathBuf::from(
            std::env::var_os("DRAWER_REALESRGAN_TEST_ENGINE")
                .expect("set the existing engine executable path"),
        );
        assert!(exe.is_file());
        let fixture = Fixture::new();
        let source = fixture.0.join("中文原图实际是PNG.jpg");
        let original_image = DynamicImage::ImageRgba8(image::RgbaImage::from_fn(64, 64, |x, _| {
            image::Rgba([20, 80, 140, if x == 0 { 0 } else { 128 }])
        }));
        save_image(&original_image, &source, "png").unwrap();
        let original = fs::read(&source).unwrap();
        let prepared = fixture.0.join("engine_input.png");
        let enhanced = fixture.0.join("engine_output.png");
        let output = fixture.0.join("2x_output.jpg");
        prepare_png(&source, &prepared, 64, 64).unwrap();
        crate::run_realesrgan_image_on_path(
            &exe,
            exe.parent().unwrap(),
            &prepared,
            &enhanced,
            "general",
            "png",
        )
        .unwrap();
        assert_eq!(dimensions(&enhanced).unwrap(), (256, 256));
        assert!(decode(&enhanced).unwrap().color().has_alpha());
        assert!(decode(&enhanced)
            .unwrap()
            .to_rgba8()
            .pixels()
            .any(|pixel| pixel[3] < 255));
        crate::run_local_image_resize(&enhanced, &output, 128, 128, "jpg").unwrap();
        assert_eq!(dimensions(&output).unwrap(), (128, 128));
        assert_eq!(
            image::guess_format(&fs::read(&output).unwrap()).unwrap(),
            ImageFormat::Jpeg
        );
        assert_eq!(fs::read(&source).unwrap(), original);
    }

    #[test]
    fn image_input_preparation_write_errors_are_redacted_and_correctly_staged() {
        let fixture = Fixture::new();
        let source = fixture.png("original.png");
        let output = fixture.0.join("private_missing_dir").join("input.png");
        let original = fs::read(&source).unwrap();
        let error = prepare_png(&source, &output, 12, 8).unwrap_err();
        assert!(error.contains("[准备输入]"));
        assert!(!error.contains("private_missing_dir"));
        assert_eq!(fs::read(&source).unwrap(), original);
    }
}
