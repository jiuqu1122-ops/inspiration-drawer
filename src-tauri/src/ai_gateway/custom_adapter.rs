use crate::ai_gateway::openai_compatible_adapter;
use crate::ai_gateway::types::EffectiveApiProfile;

pub fn models_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    openai_compatible_adapter::models_endpoint(profile)
}

pub fn chat_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    openai_compatible_adapter::chat_endpoint(profile)
}

pub fn responses_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    openai_compatible_adapter::responses_endpoint(profile)
}

pub fn image_generations_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    openai_compatible_adapter::image_generations_endpoint(profile)
}

pub fn image_edits_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    openai_compatible_adapter::image_edits_endpoint(profile)
}

pub fn video_generations_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    openai_compatible_adapter::video_generations_endpoint(profile)
}
