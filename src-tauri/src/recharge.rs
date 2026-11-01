use crate::renderer_diagnostics::{window_action, WindowAction};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{
    webview::{NewWindowFeatures, NewWindowResponse},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use url::Url;

const RECHARGE_URL: &str = "https://catfk.com/shop/JQMFPFJH";
const RECHARGE_WINDOW_LABEL: &str = "credit_recharge";
const PAYMENT_WINDOW_PREFIX: &str = "credit_recharge_payment_";
static NEXT_PAYMENT_WINDOW_ID: AtomicU64 = AtomicU64::new(1);

#[cfg(target_os = "windows")]
const CLOSE_PAGE_MESSAGE: &str = r#"{"inspirationRecharge":"close-page"}"#;
#[cfg(target_os = "windows")]
const CONTROLLED_CLOSE_SCRIPT: &str = r#"
(() => {
  if (window !== window.top) return;
  Object.defineProperty(window, 'close', {
    configurable: false,
    writable: false,
    value: () => window.chrome.webview.postMessage('{"inspirationRecharge":"close-page"}')
  });
})();
"#;

#[cfg(target_os = "windows")]
fn attach_controlled_close(window: &WebviewWindow) -> Result<(), String> {
    use webview2_com::{CoTaskMemPWSTR, WebMessageReceivedEventHandler};
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    // This bridge can only close its own commerce window. It grants no Tauri
    // command permissions to remote pages and accepts no target window label.
    window
        .with_webview(move |native| {
            let app_for_message = app.clone();
            let label_for_message = label.clone();
            let attach = || -> webview2_com::Result<()> {
                unsafe {
                    let webview = native.controller().CoreWebView2()?;
                    let mut token = 0;
                    webview.add_WebMessageReceived(
                        &WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                            if let Some(args) = args {
                                let mut message = Default::default();
                                if args.TryGetWebMessageAsString(&mut message).is_ok() {
                                    let message = CoTaskMemPWSTR::from(message);
                                    if message.to_string() == CLOSE_PAGE_MESSAGE {
                                        let app = app_for_message.clone();
                                        let label = label_for_message.clone();
                                        // Destroy after this WebView2 callback returns.
                                        let dispatcher = app.clone();
                                        let _ = dispatcher.run_on_main_thread(move || {
                                            if let Some(window) = app.get_webview_window(&label) {
                                                let _ = window_action(&window, WindowAction::Destroy, "attach_controlled_close");
                                            }
                                        });
                                    }
                                }
                            }
                            Ok(())
                        })),
                        &mut token,
                    )?;
                }
                Ok(())
            };
            if let Err(error) = attach() {
                log_recharge(
                    &app,
                    &format!("close bridge failed window={label}: {error}"),
                );
            }
        })
        .map_err(|error| error.to_string())
}

fn is_payment_url(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "http") || url.as_str() == "about:blank"
}

fn is_recharge_window(label: &str) -> bool {
    label == RECHARGE_WINDOW_LABEL || label.starts_with(PAYMENT_WINDOW_PREFIX)
}

fn log_recharge(app: &AppHandle, message: &str) {
    use std::io::Write;
    if let Ok(directory) = app.path().app_local_data_dir() {
        let directory = directory.join("logs");
        let _ = std::fs::create_dir_all(&directory);
        if let Ok(mut log) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(directory.join("recharge-window.log"))
        {
            let _ = writeln!(log, "{} {message}", chrono::Utc::now().to_rfc3339());
        }
    }
}

fn open_payment_window(
    app: &AppHandle,
    url: Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<tauri::Wry> {
    if !is_payment_url(&url) {
        log_recharge(app, &format!("blocked popup scheme={}", url.scheme()));
        return NewWindowResponse::Deny;
    }
    // Do not log payment URLs: their query strings may contain order tokens.
    log_recharge(
        app,
        &format!(
            "payment popup host={}",
            url.host_str().unwrap_or("about:blank")
        ),
    );
    let label = format!(
        "{PAYMENT_WINDOW_PREFIX}{}",
        NEXT_PAYMENT_WINDOW_ID.fetch_add(1, Ordering::Relaxed)
    );
    // WebView2 navigates this window to the requested URL after linking the
    // opener. Sharing window_features preserves window.open(), focus(), and
    // the shop's order-status polling instead of replacing the shop page.
    let blank_url = match Url::parse("about:blank") {
        Ok(url) => url,
        Err(_) => return NewWindowResponse::Deny,
    };
    match build_recharge_window(app, label, blank_url, Some(features)) {
        Ok(window) => NewWindowResponse::Create { window },
        Err(error) => {
            log_recharge(app, &format!("payment popup failed: {error}"));
            let _ = app.emit_to(
                "main",
                "credit-recharge-error",
                "支付窗口打开失败，请再次点击立即跳转。",
            );
            NewWindowResponse::Deny
        }
    }
}

fn build_recharge_window(
    app: &AppHandle,
    label: String,
    url: Url,
    features: Option<NewWindowFeatures>,
) -> Result<WebviewWindow, String> {
    let is_shop = label == RECHARGE_WINDOW_LABEL;
    let parent = app
        .get_webview_window(if is_shop {
            "main"
        } else {
            RECHARGE_WINDOW_LABEL
        })
        .or_else(|| app.get_webview_window("main"));
    let app_for_popup = app.clone();
    let app_for_page = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::External(url))
        .title(if is_shop {
            "积分充值"
        } else {
            "充值支付"
        })
        .inner_size(1000.0, 740.0)
        .min_inner_size(420.0, 480.0)
        .resizable(true)
        .decorations(true)
        .transparent(false)
        .visible(false)
        .focused(false)
        .drag_and_drop(false)
        .on_navigation(is_payment_url)
        .on_new_window(move |url, features| open_payment_window(&app_for_popup, url, features))
        .on_page_load(move |window, payload| {
            log_recharge(
                &app_for_page,
                &format!(
                    "page {:?} window={} host={}",
                    payload.event(),
                    window.label(),
                    payload.url().host_str().unwrap_or("about:blank")
                ),
            );
        });

    #[cfg(target_os = "windows")]
    {
        // Wry's default window.close handler calls DestroyWindow directly.
        // Route it through Tauri so window state and close notifications stay valid.
        builder = builder.initialization_script(CONTROLLED_CLOSE_SCRIPT);
    }

    if let Some(features) = features {
        builder = builder.window_features(features);
    } else {
        // Keep external commerce pages in a separate WebView2 environment,
        // outside the transparent canvas window and its privileged profile.
        let profile = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?
            .join("recharge-webview");
        builder = builder.data_directory(profile);
    }
    if let Some(parent) = parent {
        builder = builder
            .always_on_top(parent.is_always_on_top().unwrap_or(false))
            .parent(&parent)
            .map_err(|error| error.to_string())?;
        if let Ok(Some(monitor)) = parent.current_monitor() {
            let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
            builder = builder.inner_size(
                (size.width - 64.0).clamp(420.0, 1000.0),
                (size.height - 96.0).clamp(480.0, 740.0),
            );
        }
    }

    let window = builder.build().map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    if let Err(error) = attach_controlled_close(&window) {
        let _ = window_action(&window, WindowAction::Destroy, "build_recharge_window");
        return Err(error);
    }
    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            log_recharge(&app_for_close, &format!("window destroyed: {label}"));
            if is_shop {
                for (label, payment) in app_for_close.webview_windows() {
                    if label.starts_with(PAYMENT_WINDOW_PREFIX) {
                        let _ = window_action(&payment, WindowAction::Destroy, "build_recharge_window");
                    }
                }
                let _ = app_for_close.emit_to("main", "credit-recharge-closed", ());
            }
        }
    });
    if let Err(error) = window
        .center()
        .and_then(|_| window_action(&window, WindowAction::Show, "build_recharge_window"))
        .and_then(|_| window.set_focus())
    {
        let _ = window_action(&window, WindowAction::Destroy, "build_recharge_window");
        return Err(error.to_string());
    }
    Ok(window)
}

pub fn open_recharge_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(RECHARGE_WINDOW_LABEL) {
        window.unminimize().map_err(|error| error.to_string())?;
        window_action(&window, WindowAction::Show, "open_recharge_window").map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    log_recharge(app, "opening shop");
    let url = Url::parse(RECHARGE_URL).map_err(|error| error.to_string())?;
    build_recharge_window(app, RECHARGE_WINDOW_LABEL.into(), url, None).map(|_| ())
}

#[tauri::command]
pub async fn open_credit_recharge_window(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("充值只能从客户端主窗口打开。".into());
    }
    open_recharge_window(&app)
}

#[tauri::command]
pub async fn close_credit_recharge_window(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("充值窗口只能由客户端关闭。".into());
    }
    if let Some(shop) = app.get_webview_window(RECHARGE_WINDOW_LABEL) {
        // The shop's Destroyed handler closes its payments. Avoid destroying
        // a payment twice while that handler is processing the close request.
        return window_action(&shop, WindowAction::Destroy, "close_credit_recharge_window").map_err(|error| error.to_string());
    }
    for (label, window) in app.webview_windows() {
        if is_recharge_window(&label) {
            window_action(&window, WindowAction::Destroy, "close_credit_recharge_window").map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_web_payment_pages_and_blank_popup_openers() {
        for value in [
            RECHARGE_URL,
            "https://pay.example.com/checkout?order=1",
            "about:blank",
        ] {
            assert!(is_payment_url(&Url::parse(value).unwrap()));
        }
        for value in [
            "javascript:window.close()",
            "file:///C:/Windows/test.html",
            "tauri://localhost",
        ] {
            assert!(!is_payment_url(&Url::parse(value).unwrap()));
        }
    }

    #[test]
    fn closing_recharge_never_targets_the_canvas_or_other_windows() {
        assert!(is_recharge_window("credit_recharge"));
        assert!(is_recharge_window("credit_recharge_payment_1"));
        for label in ["main", "edge", "snip", "note_1"] {
            assert!(!is_recharge_window(label));
        }
    }
}
