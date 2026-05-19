pub fn generate_video_thumbnail(video_path: &str, output_path: &str) -> Result<(), String> {
    use std::process::Command;
    
    // 模拟你 Electron 里的 ffmpeg(videoPath).screenshots(...)
    let status = Command::new("ffmpeg")
        .args([
            "-i", video_path,
            "-ss", "00:00:01",
            "-vframes", "1",
            "-s", "1280x720",
            output_path,
        ])
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() { Ok(()) } else { Err("FFmpeg failed".into()) }
}
