// HTTP client for ai-meeting-agent REST API

use crate::api_client::config::ApiConfig;
use crate::api_client::types::*;
use reqwest::{Client, Response, StatusCode};
use std::time::Duration;

/// HTTP client for ai-meeting-agent API
/// 
/// Features:
/// - Automatic auth header injection (X-API-Key or Authorization)
/// - Base URL configuration
/// - Timeout handling (30s default)
/// - Error mapping (HTTP status -> ApiError)
#[derive(Debug, Clone)]
pub struct ApiClient {
    client: Client,
    config: ApiConfig,
}

impl ApiClient {
    pub fn new(config: ApiConfig) -> ApiResult<Self> {
        config.validate().map_err(ApiError::InvalidConfig)?;

        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| ApiError::NetworkError(e.to_string()))?;

        Ok(Self { client, config })
    }

    /// Update client configuration
    pub fn update_config(&mut self, config: ApiConfig) -> ApiResult<()> {
        config.validate().map_err(ApiError::InvalidConfig)?;
        self.config = config;
        Ok(())
    }

    pub fn config(&self) -> &ApiConfig {
        &self.config
    }

    // ========================================================================
    // Internal HTTP Helpers
    // ========================================================================

    fn build_url(&self, path: &str) -> String {
        format!("{}{}", self.config.base_url.trim_end_matches('/'), path)
    }

    fn add_auth_header(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if let Some(ref api_key) = self.config.api_key {
            builder.header("X-API-Key", api_key)
        } else {
            builder
        }
    }

    async fn handle_response<T: serde::de::DeserializeOwned>(
        &self,
        response: Response,
    ) -> ApiResult<T> {
        let status = response.status();

        if status.is_success() {
            response
                .json::<T>()
                .await
                .map_err(|e| ApiError::ParseError(e.to_string()))
        } else if status == StatusCode::UNAUTHORIZED {
            Err(ApiError::Unauthorized)
        } else if status == StatusCode::NOT_FOUND {
            let text = response.text().await.unwrap_or_default();
            Err(ApiError::NotFound(text))
        } else {
            let text = response.text().await.unwrap_or_default();
            Err(ApiError::ApiError {
                status: status.as_u16(),
                message: text,
            })
        }
    }

    // ========================================================================
    // Health & Info
    // ========================================================================

    pub async fn health_check(&self) -> ApiResult<()> {
        let url = self.build_url("/health");
        let response = self.client.get(&url).send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(ApiError::NetworkError("Health check failed".to_string()))
        }
    }

    // ========================================================================
    // Meetings
    // ========================================================================

    pub async fn list_meetings(
        &self,
        limit: Option<u64>,
        offset: Option<u64>,
    ) -> ApiResult<ListMeetingsResponse> {
        let mut url = self.build_url("/meetings");
        
        let mut params = vec![];
        if let Some(limit) = limit {
            params.push(format!("limit={}", limit));
        }
        if let Some(offset) = offset {
            params.push(format!("offset={}", offset));
        }
        
        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    pub async fn get_meeting(&self, id: &str) -> ApiResult<Meeting> {
        let url = self.build_url(&format!("/meetings/{}", id));
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    pub async fn create_meeting(&self, request: CreateMeetingRequest) -> ApiResult<Meeting> {
        let url = self.build_url("/meetings");
        let builder = self.client.post(&url).json(&request);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    pub async fn update_meeting(
        &self,
        id: &str,
        request: UpdateMeetingRequest,
    ) -> ApiResult<Meeting> {
        let url = self.build_url(&format!("/meetings/{}", id));
        let builder = self.client.patch(&url).json(&request);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    pub async fn rename_speakers(
        &self,
        id: &str,
        request: RenameSpeakersRequest,
    ) -> ApiResult<RenameSpeakersResponse> {
        let url = self.build_url(&format!("/meetings/{}/speakers/rename", id));
        let builder = self.client.post(&url).json(&request);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    pub async fn identify_speakers(&self, id: &str) -> ApiResult<IdentifySpeakersResponse> {
        let url = self.build_url(&format!("/meetings/{}/speakers/identify", id));
        let long_client = Client::builder()
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|e| ApiError::NetworkError(e.to_string()))?;
        let builder = long_client.post(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    pub async fn clear_speaker_identification(&self, id: &str) -> ApiResult<ClearIdentificationResponse> {
        let url = self.build_url(&format!("/meetings/{}/speakers/clear-identification", id));
        let builder = self.client.patch(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    // ========================================================================
    // Voice bank / persons
    // ========================================================================

    pub async fn list_persons(&self) -> ApiResult<ListPersonsResponse> {
        let url = self.build_url("/persons");
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    pub async fn create_person(&self, request: CreatePersonRequest) -> ApiResult<Person> {
        let url = self.build_url("/persons");
        let builder = self.client.post(&url).json(&request);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    pub async fn get_person(&self, id: &str) -> ApiResult<Person> {
        let url = self.build_url(&format!("/persons/{}", id));
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    pub async fn update_person(
        &self,
        id: &str,
        request: UpdatePersonRequest,
    ) -> ApiResult<Person> {
        let url = self.build_url(&format!("/persons/{}", id));
        let builder = self.client.patch(&url).json(&request);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    pub async fn delete_person(&self, id: &str) -> ApiResult<()> {
        let url = self.build_url(&format!("/persons/{}", id));
        let builder = self.client.delete(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            Err(ApiError::ApiError {
                status: status.as_u16(),
                message: text,
            })
        }
    }

    pub async fn list_person_samples(
        &self,
        person_id: &str,
    ) -> ApiResult<ListVoiceprintSamplesResponse> {
        let url = self.build_url(&format!("/persons/{}/samples", person_id));
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    pub async fn add_person_sample(
        &self,
        person_id: &str,
        file_path: &std::path::Path,
        duration_s: Option<f64>,
        meeting_id: Option<String>,
    ) -> ApiResult<VoiceprintSample> {
        let url = self.build_url(&format!("/persons/{}/samples", person_id));

        let file_content = tokio::fs::read(file_path)
            .await
            .map_err(|e| ApiError::NetworkError(format!("Failed to read file: {}", e)))?;

        let filename = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| ApiError::NetworkError("Invalid filename".to_string()))?;

        let mut form = reqwest::multipart::Form::new().part(
            "file",
            reqwest::multipart::Part::bytes(file_content).file_name(filename.to_string()),
        );

        if let Some(d) = duration_s {
            form = form.text("duration_s", d.to_string());
        }
        if let Some(mid) = meeting_id {
            form = form.text("meeting_id", mid);
        }

        // Enrollment + embed can take longer than default 30s
        let long_client = Client::builder()
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|e| ApiError::NetworkError(e.to_string()))?;

        let builder = long_client.post(&url).multipart(form);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    pub async fn delete_person_sample(
        &self,
        person_id: &str,
        sample_id: &str,
    ) -> ApiResult<()> {
        let url = self.build_url(&format!(
            "/persons/{}/samples/{}",
            person_id, sample_id
        ));
        let builder = self.client.delete(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            Err(ApiError::ApiError {
                status: status.as_u16(),
                message: text,
            })
        }
    }

    pub async fn rebuild_voiceprint(
        &self,
        person_id: &str,
    ) -> ApiResult<RebuildVoiceprintResponse> {
        let url = self.build_url(&format!("/persons/{}/voiceprint/rebuild", person_id));
        let long_client = Client::builder()
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|e| ApiError::NetworkError(e.to_string()))?;
        let builder = long_client.post(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    pub async fn list_voiceprints(&self) -> ApiResult<ListVoiceprintsResponse> {
        let url = self.build_url("/voiceprints");
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;
        self.handle_response(response).await
    }

    /// Download person sample audio bytes (GET /persons/{person_id}/samples/{sample_id}/audio).
    pub async fn get_person_sample_audio(
        &self,
        person_id: &str,
        sample_id: &str,
    ) -> ApiResult<Vec<u8>> {
        let url = self.build_url(&format!(
            "/persons/{}/samples/{}/audio",
            person_id, sample_id
        ));
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        let status = response.status();
        if status.is_success() {
            let bytes = response
                .bytes()
                .await
                .map_err(|e| ApiError::NetworkError(e.to_string()))?;
            Ok(bytes.to_vec())
        } else {
            let text = response.text().await.unwrap_or_default();
            Err(ApiError::ApiError {
                status: status.as_u16(),
                message: text,
            })
        }
    }

    pub async fn delete_meeting(&self, id: &str) -> ApiResult<()> {
        let url = self.build_url(&format!("/meetings/{}", id));
        let builder = self.client.delete(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            Err(ApiError::ApiError {
                status: status.as_u16(),
                message: text,
            })
        }
    }

    pub async fn retranscribe_meeting(&self, id: &str) -> ApiResult<ImportResponse> {
        let url = self.build_url(&format!("/meetings/{}/retranscribe", id));
        let builder = self.client.post(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    // ========================================================================
    // Transcripts
    // ========================================================================

    pub async fn get_transcript(
        &self,
        meeting_id: &str,
        limit: Option<u64>,
        offset: Option<u64>,
    ) -> ApiResult<TranscriptResponse> {
        let mut url = self.build_url(&format!("/meetings/{}/transcript", meeting_id));
        
        let mut params = vec![];
        if let Some(limit) = limit {
            params.push(format!("limit={}", limit));
        }
        if let Some(offset) = offset {
            params.push(format!("offset={}", offset));
        }
        
        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    /// Global full-text search across all ready meetings' transcripts.
    /// `GET /transcripts/search?q=...&limit=...&offset=...`
    pub async fn search_all_transcripts(
        &self,
        query: &str,
        limit: Option<u64>,
        offset: Option<u64>,
    ) -> ApiResult<GlobalTranscriptSearchResponse> {
        let mut url = self.build_url("/transcripts/search");

        let mut params = vec![format!("q={}", urlencoding::encode(query))];
        if let Some(limit) = limit {
            params.push(format!("limit={}", limit));
        }
        if let Some(offset) = offset {
            params.push(format!("offset={}", offset));
        }

        url.push('?');
        url.push_str(&params.join("&"));

        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    // ========================================================================
    // Summaries
    // ========================================================================

    pub async fn list_summaries(&self, meeting_id: &str) -> ApiResult<SummaryListResponse> {
        let url = self.build_url(&format!("/meetings/{}/summary", meeting_id));
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    pub async fn get_summary(
        &self,
        meeting_id: &str,
        template: &SummaryTemplate,
    ) -> ApiResult<Summary> {
        let template_str = template.as_api_str();
        let url = self.build_url(&format!("/meetings/{}/summary/{}", meeting_id, template_str));
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    pub async fn generate_summary(
        &self,
        meeting_id: &str,
        request: GenerateSummaryRequest,
    ) -> ApiResult<ImportResponse> {
        let url = self.build_url(&format!("/meetings/{}/summary", meeting_id));
        let builder = self.client.post(&url).json(&request);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    /// Overwrite stored summary content (no LLM generation).
    pub async fn update_summary(
        &self,
        meeting_id: &str,
        template: &SummaryTemplate,
        request: UpdateSummaryRequest,
    ) -> ApiResult<Summary> {
        let template_str = match template {
            SummaryTemplate::KeyPoints => "key_points",
            SummaryTemplate::ActionItems => "action_items",
            SummaryTemplate::Decisions => "decisions",
            SummaryTemplate::Full => "full",
            SummaryTemplate::MeetingNotes => "meeting_notes",
        };
        let url = self.build_url(&format!("/meetings/{}/summary/{}", meeting_id, template_str));
        let builder = self.client.put(&url).json(&request);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    /// Download meeting recording bytes (GET /meetings/{id}/recording).
    pub async fn get_recording(&self, meeting_id: &str) -> ApiResult<Vec<u8>> {
        let url = self.build_url(&format!("/meetings/{}/recording", meeting_id));
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        let status = response.status();
        if status.is_success() {
            let bytes = response
                .bytes()
                .await
                .map_err(|e| ApiError::NetworkError(e.to_string()))?;
            Ok(bytes.to_vec())
        } else {
            let text = response.text().await.unwrap_or_default();
            Err(ApiError::ApiError {
                status: status.as_u16(),
                message: text,
            })
        }
    }

    // ========================================================================
    // Jobs
    // ========================================================================

    pub async fn list_jobs(&self) -> ApiResult<Vec<JobStatusResponse>> {
        let url = self.build_url("/jobs");
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    pub async fn get_job_status(&self, job_id: &str) -> ApiResult<JobStatusResponse> {
        let url = self.build_url(&format!("/jobs/{}/status", job_id));
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    pub async fn cancel_job(&self, job_id: &str) -> ApiResult<CancelJobResponse> {
        let url = self.build_url(&format!("/jobs/{}/cancel", job_id));
        let builder = self.client.post(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    // ========================================================================
    // Import
    // ========================================================================

    pub async fn import_audio(
        &self,
        file_path: &std::path::Path,
        title: Option<String>,
    ) -> ApiResult<ImportResponse> {
        let url = self.build_url("/import");
        
        // Read file content
        let file_content = tokio::fs::read(file_path)
            .await
            .map_err(|e| ApiError::NetworkError(format!("Failed to read file: {}", e)))?;
        
        let filename = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| ApiError::NetworkError("Invalid filename".to_string()))?;

        // Build multipart form
        let mut form = reqwest::multipart::Form::new()
            .part(
                "file",
                reqwest::multipart::Part::bytes(file_content)
                    .file_name(filename.to_string()),
            );

        if let Some(title) = title {
            form = form.text("title", title);
        }

        let builder = self.client.post(&url).multipart(form);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }

    // ========================================================================
    // Config
    // ========================================================================

    pub async fn get_config(&self) -> ApiResult<ApiConfigResponse> {
        let url = self.build_url("/config");
        let builder = self.client.get(&url);
        let builder = self.add_auth_header(builder);
        let response = builder.send().await?;

        self.handle_response(response).await
    }
}
