// API request/response types matching ai-meeting-agent API.md spec

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ============================================================================
// Meeting Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub date: DateTime<Utc>,
    pub duration_seconds: Option<u64>,
    pub status: MeetingStatus,
    pub audio_file: Option<String>,
    pub transcription: Option<TranscriptionInfo>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MeetingStatus {
    Importing,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionInfo {
    pub provider: String,
    pub model: String,
    pub completed_at: DateTime<Utc>,
    pub version: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListMeetingsResponse {
    pub meetings: Vec<Meeting>,
    pub total: u64,
    pub limit: u64,
    pub offset: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMeetingRequest {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateMeetingRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<DateTime<Utc>>,
}

// ============================================================================
// Transcript Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptResponse {
    pub meeting_id: String,
    pub status: MeetingStatus,
    pub transcript: Option<Transcript>,
    pub total_segments: u64,
    pub limit: u64,
    pub offset: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transcript {
    pub text: String,
    pub segments: Vec<TranscriptSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: u32,
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptSearchResponse {
    pub meeting_id: String,
    pub query: String,
    pub results: Vec<TranscriptSearchResult>,
    pub total: u64,
    pub limit: u64,
    pub offset: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSearchResult {
    pub segment_id: u32,
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub rank: f64,
}

// ============================================================================
// Summary Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryListResponse {
    pub meeting_id: String,
    pub summaries: Vec<Summary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    pub id: String,
    pub meeting_id: String,
    pub template: SummaryTemplate,
    pub language: Option<String>,
    pub status: SummaryStatus,
    pub content: String,
    pub key_points: Vec<String>,
    pub action_items: Vec<String>,
    pub decisions: Vec<String>,
    pub provider: String,
    pub model: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SummaryTemplate {
    KeyPoints,
    ActionItems,
    Decisions,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SummaryStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateSummaryRequest {
    pub template: SummaryTemplate,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

// ============================================================================
// Job Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStatusResponse {
    pub job_id: String,
    pub job_type: JobType,
    pub state: JobState,
    pub progress: Vec<ProgressEvent>,
    pub meeting_id: Option<String>,
    pub template: Option<String>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobType {
    Import,
    Summary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobState {
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

impl JobState {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            JobState::Completed | JobState::Failed | JobState::Cancelled
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub stage: String,
    pub message: String,
    pub timestamp: DateTime<Utc>,
    pub percent: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResponse {
    pub job_id: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CancelJobResponse {
    pub job_id: String,
    pub cancelled: bool,
}

// ============================================================================
// Metadata Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingMetadata {
    pub meeting_id: String,
    pub participants: Vec<String>,
    pub location: Option<String>,
    pub organizer: Option<String>,
    pub metadata_source: String,
    pub recording_date: Option<DateTime<Utc>>,
    pub platform: Option<String>,
    pub file_metadata: FileMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub original_filename: String,
    pub size_bytes: u64,
    pub duration_seconds: Option<u64>,
}

// ============================================================================
// Config Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfigResponse {
    pub transcription: TranscriptionConfig,
    pub summary: SummaryConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionConfig {
    pub provider: String,
    pub api_key: String, // Masked as "****" in responses
    pub base_url: String,
    pub model: String,
    pub chunk_seconds: f64,
    pub chunk_concurrency: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryConfig {
    pub provider: String,
    pub api_key: String, // Masked as "****" in responses
    pub base_url: String,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: u32,
    pub language: Option<String>,
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("HTTP request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),

    #[error("API returned error {status}: {message}")]
    ApiError { status: u16, message: String },

    #[error("Failed to parse response: {0}")]
    ParseError(String),

    #[error("Meeting not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: invalid or missing API key")]
    Unauthorized,

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Network error: {0}")]
    NetworkError(String),
}

pub type ApiResult<T> = Result<T, ApiError>;
