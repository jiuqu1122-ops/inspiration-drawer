use crate::ai_gateway::endpoint::join_api_endpoint;
use crate::ai_gateway::types::EffectiveApiProfile;

pub fn models_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/v1/models")
}

pub fn chat_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/v1/chat/completions")
}

pub fn responses_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/v1/responses")
}

pub fn image_generations_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/v1/images/generations")
}

pub fn image_edits_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/v1/images/edits")
}

pub fn video_generations_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/v1/video/generations")
}

pub fn balance_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/api/usage/token/")
}
