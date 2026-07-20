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

    pub async fn get_meeting_metadata(&self, id: &str) -> ApiResult<MeetingMetadata> {
        let url = self.build_url(&format!("/meetings/{}/metadata", id));
        let builder = self.client.get(&url);
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

    pub async fn search_transcript(
        &self,
        meeting_id: &str,
        query: &str,
        limit: Option<u64>,
        offset: Option<u64>,
    ) -> ApiResult<TranscriptSearchResponse> {
        let mut url = self.build_url(&format!("/meetings/{}/transcript/search", meeting_id));
        
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
        let template_str = match template {
            SummaryTemplate::KeyPoints => "key_points",
            SummaryTemplate::ActionItems => "action_items",
            SummaryTemplate::Decisions => "decisions",
            SummaryTemplate::Full => "full",
        };
        
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

    // ========================================================================
    // Jobs
    // ========================================================================

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
