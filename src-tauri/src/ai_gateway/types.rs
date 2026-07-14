use std::collections::BTreeMap;

use serde::Serialize;

use crate::license::types::AiGatewayKind;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredApiSettings {
    pub gateway_kind: Option<AiGatewayKind>,
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub headers: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveApiProfile {
    pub source: String,
    pub gateway_kind: AiGatewayKind,
    pub provider: String,
    pub base_url: String,
    #[serde(skip_serializing)]
    pub api_key: String,
    pub model: String,
    #[serde(skip_serializing)]
    pub headers: BTreeMap<String, String>,
    pub editable: bool,
    pub key_last4: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GatewayOperation {
    Models,
    ChatCompletions,
    Responses,
    ImageGenerations,
    ImageEdits,
    VideoGenerations,
    Balance,
    XaisUserProfile,
    XaisWorkerTaskStart,
    XaisWorkerTaskWait,
    XaisAttachmentUrls,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayConnectionResult {
    pub ok: bool,
    pub gateway_kind: AiGatewayKind,
    pub provider: String,
    pub model_count: usize,
    pub message: String,
    pub endpoint_kind: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiBalanceResult {
    pub available: bool,
    pub provider: String,
    pub gateway_kind: AiGatewayKind,
    pub total_granted: Option<f64>,
    pub total_used: Option<f64>,
    pub total_available: Option<f64>,
    pub unlimited: bool,
    pub currency: Option<String>,
    pub expires_at: Option<i64>,
    pub raw_summary: Option<String>,
    pub unsupported_reason: Option<String>,
    pub endpoint_kind: String,
    pub display: String,
}
