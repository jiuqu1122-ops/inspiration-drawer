use serde::Serialize;

use super::browser_detection::{BrowserDetection, BrowserKind};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtensionStatusKind {
    NotDetected,
    BrowserNotInstalled,
    ExtensionNotInstalled,
    Installing,
    WaitingForBrowserConfirmation,
    WaitingForPairing,
    Connected,
    TemporarilyDisconnected,
    Outdated,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserExtensionConnectionStatus {
    pub browser: BrowserKind,
    pub status: ExtensionStatusKind,
    pub extension_id: Option<String>,
    pub extension_version: Option<String>,
    pub last_seen: Option<u64>,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserExtensionStatusSnapshot {
    pub browsers: Vec<BrowserDetection>,
    pub extensions: Vec<BrowserExtensionConnectionStatus>,
    pub bridge_port: Option<u16>,
    pub protocol_version: u32,
    pub desktop_version: String,
    pub prepared_extension_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserExtensionInstallResult {
    pub browser: BrowserKind,
    pub mode: String,
    pub status: ExtensionStatusKind,
    pub prepared_extension_path: String,
    pub opened_url: String,
    pub instruction: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserExtensionDragPayload {
    pub drag_id: String,
    pub browser: BrowserKind,
    pub extension_id: String,
    pub kind: String,
    pub image_url: Option<String>,
    pub data_url: Option<String>,
    pub local_path: Option<String>,
    pub page_url: Option<String>,
    pub page_title: Option<String>,
    pub image_title: Option<String>,
    pub alt: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub source_type: String,
}
