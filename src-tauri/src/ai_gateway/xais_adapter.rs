use crate::ai_gateway::endpoint::join_api_endpoint;
use crate::ai_gateway::types::EffectiveApiProfile;
use url::Url;

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

pub fn user_profile_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/xais/userProfile")
}

pub fn worker_task_start_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/xais/workerTaskStart")
}

pub fn worker_task_wait_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/xais/workerTaskWait")
}

pub fn attachment_urls_endpoint(profile: &EffectiveApiProfile) -> Result<String, String> {
    join_api_endpoint(&profile.base_url, "/xais/attUrls")
}

pub fn file_attachment_upload_url_endpoint(
    profile: &EffectiveApiProfile,
    extension: &str,
) -> Result<String, String> {
    let endpoint = join_api_endpoint(&profile.base_url, "/xais/fileAttachmentUploadUrl")?;
    let mut url = Url::parse(&endpoint).map_err(|error| format!("XAIS 上传地址无效：{error}"))?;
    url.query_pairs_mut().append_pair("ext", extension);
    Ok(url.to_string())
}

pub fn attachment_registration_endpoint(
    profile: &EffectiveApiProfile,
    name: &str,
) -> Result<String, String> {
    let endpoint = attachment_urls_endpoint(profile)?;
    let mut url = Url::parse(&endpoint).map_err(|error| format!("XAIS 附件地址无效：{error}"))?;
    url.query_pairs_mut().append_pair("att", name);
    Ok(url.to_string())
}
