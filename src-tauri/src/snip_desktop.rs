use screenshots::image::{imageops, Rgba, RgbaImage};
use screenshots::Screen;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DesktopRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl DesktopRect {
    pub fn union_bounds(rects: impl IntoIterator<Item = (i32, i32, u32, u32)>) -> Option<Self> {
        let mut iter = rects.into_iter();
        let (x, y, width, height) = iter.next()?;
        let mut min_x = x;
        let mut min_y = y;
        let mut max_x = x.saturating_add(width as i32);
        let mut max_y = y.saturating_add(height as i32);
        for (next_x, next_y, next_width, next_height) in iter {
            min_x = min_x.min(next_x);
            min_y = min_y.min(next_y);
            max_x = max_x.max(next_x.saturating_add(next_width as i32));
            max_y = max_y.max(next_y.saturating_add(next_height as i32));
        }
        Some(Self {
            x: min_x,
            y: min_y,
            width: (max_x - min_x).max(1) as u32,
            height: (max_y - min_y).max(1) as u32,
        })
    }

    pub fn destination_for(self, screen_x: i32, screen_y: i32) -> (i64, i64) {
        (i64::from(screen_x.saturating_sub(self.x)), i64::from(screen_y.saturating_sub(self.y)))
    }
}

pub struct CapturedScreen {
    pub x: i32,
    pub y: i32,
    pub image: RgbaImage,
}

pub struct FrozenSnipDesktop {
    pub bounds: DesktopRect,
    pub screens: Vec<CapturedScreen>,
}

pub fn stitch_screen_captures(
    bounds: DesktopRect,
    captures: impl IntoIterator<Item = ((i32, i32), RgbaImage)>,
) -> RgbaImage {
    let mut canvas = RgbaImage::from_pixel(
        bounds.width.max(1),
        bounds.height.max(1),
        Rgba([0, 0, 0, 255]),
    );
    for ((x, y), image) in captures {
        let (dx, dy) = bounds.destination_for(x, y);
        imageops::overlay(&mut canvas, &image, dx, dy);
    }
    canvas
}

pub fn map_viewport_crop(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
    image_width: u32,
    image_height: u32,
) -> (u32, u32, u32, u32) {
    let image_w = image_width.max(1);
    let image_h = image_height.max(1);
    let scale_x = image_w as f64 / viewport_width.max(1.0);
    let scale_y = image_h as f64 / viewport_height.max(1.0);
    let sx = (x * scale_x).round().max(0.0).min((image_w - 1) as f64) as u32;
    let sy = (y * scale_y).round().max(0.0).min((image_h - 1) as f64) as u32;
    let max_w = image_w.saturating_sub(sx).max(1);
    let max_h = image_h.saturating_sub(sy).max(1);
    let sw = (width * scale_x).round().max(1.0).min(max_w as f64) as u32;
    let sh = (height * scale_y).round().max(1.0).min(max_h as f64) as u32;
    (sx, sy, sw, sh)
}

pub fn crop_from_screens(
    frozen: &FrozenSnipDesktop,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
) -> RgbaImage {
    let (sx, sy, sw, sh) = map_viewport_crop(
        x,
        y,
        width,
        height,
        viewport_width,
        viewport_height,
        frozen.bounds.width,
        frozen.bounds.height,
    );
    let crop_x = frozen.bounds.x.saturating_add(sx as i32);
    let crop_y = frozen.bounds.y.saturating_add(sy as i32);
    let crop_w = sw as i32;
    let crop_h = sh as i32;

    for screen in &frozen.screens {
        let screen_w = screen.image.width() as i32;
        let screen_h = screen.image.height() as i32;
        if crop_x >= screen.x
            && crop_y >= screen.y
            && crop_x + crop_w <= screen.x + screen_w
            && crop_y + crop_h <= screen.y + screen_h
        {
            return imageops::crop_imm(
                &screen.image,
                (crop_x - screen.x) as u32,
                (crop_y - screen.y) as u32,
                sw,
                sh,
            )
            .to_image();
        }
    }

    let mut out = RgbaImage::from_pixel(sw.max(1), sh.max(1), Rgba([0, 0, 0, 255]));
    for screen in &frozen.screens {
        let screen_w = screen.image.width() as i32;
        let screen_h = screen.image.height() as i32;
        let ix = crop_x.max(screen.x);
        let iy = crop_y.max(screen.y);
        let ix2 = (crop_x + crop_w).min(screen.x + screen_w);
        let iy2 = (crop_y + crop_h).min(screen.y + screen_h);
        if ix2 <= ix || iy2 <= iy {
            continue;
        }
        let piece = imageops::crop_imm(
            &screen.image,
            (ix - screen.x) as u32,
            (iy - screen.y) as u32,
            (ix2 - ix) as u32,
            (iy2 - iy) as u32,
        )
        .to_image();
        imageops::overlay(&mut out, &piece, i64::from(ix - crop_x), i64::from(iy - crop_y));
    }
    out
}

pub fn capture_all_screens() -> Result<FrozenSnipDesktop, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    if screens.is_empty() {
        return Err("no screen available".to_string());
    }
    let bounds = DesktopRect::union_bounds(screens.iter().map(|screen| {
        (
            screen.display_info.x,
            screen.display_info.y,
            screen.display_info.width,
            screen.display_info.height,
        )
    }))
    .ok_or_else(|| "no screen available".to_string())?;

    let captured = if screens.len() == 1 {
        let screen = &screens[0];
        vec![CapturedScreen {
            x: screen.display_info.x,
            y: screen.display_info.y,
            image: screen.capture().map_err(|e| e.to_string())?,
        }]
    } else {
        let handles: Vec<_> = screens
            .into_iter()
            .map(|screen| {
                std::thread::spawn(move || {
                    let image = screen.capture().map_err(|e| e.to_string())?;
                    Ok::<_, String>(CapturedScreen {
                        x: screen.display_info.x,
                        y: screen.display_info.y,
                        image,
                    })
                })
            })
            .collect();
        let mut captured = Vec::with_capacity(handles.len());
        for handle in handles {
            captured.push(handle.join().map_err(|_| "screen capture thread failed".to_string())??);
        }
        captured
    };

    Ok(FrozenSnipDesktop {
        bounds,
        screens: captured,
    })
}

#[cfg(test)]
mod tests {
    use super::{crop_from_screens, stitch_screen_captures, CapturedScreen, DesktopRect, FrozenSnipDesktop};
    use screenshots::image::{Rgba, RgbaImage};

    fn solid(width: u32, height: u32, color: [u8; 4]) -> RgbaImage {
        RgbaImage::from_pixel(width, height, Rgba(color))
    }

    #[test]
    fn union_bounds_covers_a_left_and_right_monitor() {
        let bounds = DesktopRect::union_bounds([
            (0, 0, 1920, 1080),
            (1920, 0, 1920, 1080),
        ])
        .expect("bounds");
        assert_eq!(
            bounds,
            DesktopRect {
                x: 0,
                y: 0,
                width: 3840,
                height: 1080
            }
        );
    }

    #[test]
    fn union_bounds_supports_a_monitor_to_the_left() {
        let bounds = DesktopRect::union_bounds([
            (0, 0, 1920, 1080),
            (-1680, 0, 1680, 1050),
        ])
        .expect("bounds");
        assert_eq!(
            bounds,
            DesktopRect {
                x: -1680,
                y: 0,
                width: 3600,
                height: 1080
            }
        );
    }

    #[test]
    fn map_viewport_crop_keeps_the_selection_inside_the_image() {
        assert_eq!(
            super::map_viewport_crop(10.0, 20.0, 40.0, 30.0, 100.0, 100.0, 200, 200),
            (20, 40, 80, 60)
        );
    }

    #[test]
    fn stitch_places_each_screen_on_the_virtual_desktop() {
        let bounds = DesktopRect {
            x: -10,
            y: 0,
            width: 14,
            height: 4,
        };
        let mut left = RgbaImage::new(4, 4);
        let mut right = RgbaImage::new(4, 4);
        left.put_pixel(0, 0, Rgba([255, 0, 0, 255]));
        right.put_pixel(0, 0, Rgba([0, 255, 0, 255]));
        let canvas = stitch_screen_captures(bounds, [((-10, 0), left), ((0, 0), right)]);
        assert_eq!(canvas.get_pixel(0, 0), &Rgba([255, 0, 0, 255]));
        assert_eq!(canvas.get_pixel(10, 0), &Rgba([0, 255, 0, 255]));
    }

    #[test]
    fn crop_from_screens_uses_a_single_monitor_without_stitching() {
        let frozen = FrozenSnipDesktop {
            bounds: DesktopRect { x: 0, y: 0, width: 8, height: 4 },
            screens: vec![
                CapturedScreen { x: 0, y: 0, image: solid(4, 4, [255, 0, 0, 255]) },
                CapturedScreen { x: 4, y: 0, image: solid(4, 4, [0, 255, 0, 255]) },
            ],
        };
        let cropped = crop_from_screens(&frozen, 5.0, 1.0, 2.0, 2.0, 8.0, 4.0);
        assert_eq!(cropped.dimensions(), (2, 2));
        assert_eq!(cropped.get_pixel(0, 0), &Rgba([0, 255, 0, 255]));
    }

    #[test]
    fn crop_from_screens_joins_adjacent_monitors() {
        let frozen = FrozenSnipDesktop {
            bounds: DesktopRect { x: 0, y: 0, width: 8, height: 4 },
            screens: vec![
                CapturedScreen { x: 0, y: 0, image: solid(4, 4, [255, 0, 0, 255]) },
                CapturedScreen { x: 4, y: 0, image: solid(4, 4, [0, 255, 0, 255]) },
            ],
        };
        let cropped = crop_from_screens(&frozen, 2.0, 0.0, 4.0, 1.0, 8.0, 4.0);
        assert_eq!(cropped.dimensions(), (4, 1));
        assert_eq!(cropped.get_pixel(0, 0), &Rgba([255, 0, 0, 255]));
        assert_eq!(cropped.get_pixel(3, 0), &Rgba([0, 255, 0, 255]));
    }
}
