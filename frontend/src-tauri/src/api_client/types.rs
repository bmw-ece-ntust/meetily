// API request/response types matching ai-meeting-agent API
// Synced with ai-meeting-agent/crates/core/src/models.rs and crates/server/src/types.rs

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};

// ============================================================================
// Meeting Types
// ============================================================================

/// Source of meeting metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MetadataSource {
    UserProvided,
    CalendarBot,
    Filename,
    FFprobe,
    Default,
}

/// Audio file metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub codec: Option<String>,
    pub sample_rate: Option<u32>,
    pub bit_rate: Option<u64>,
    pub channels: Option<u8>,
    pub file_size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub date: DateTime<Utc>,
    pub duration_seconds: Option<u64>,
    pub status: MeetingStatus,
    pub transcription: Option<TranscriptionInfo>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub organizer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata_source: Option<MetadataSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_metadata: Option<FileMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_date: Option<NaiveDateTime>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<String>>,
    /// Empty string clears the field on the server.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    /// Empty string clears the field on the server.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub organizer: Option<String>,
}

/// Bulk rename diarization speaker labels on the latest transcript version.
#[derive(Debug, Serialize, Deserialize)]
pub struct RenameSpeakersRequest {
    pub mapping: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameSpeakersResponse {
    pub updated_segments: u64,
    pub mapping: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSummaryRequest {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
}

// ============================================================================
// Transcript Types
// ============================================================================

/// Local database types for meeting details (used by database repository layer)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingDetails {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub transcripts: Vec<MeetingTranscript>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingTranscript {
    pub id: i32,
    pub text: String,
    pub timestamp: Option<String>,
    pub audio_start_time: Option<f64>,
    pub audio_end_time: Option<f64>,
    pub duration: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptResponse {
    pub meeting_id: String,
    pub status: MeetingStatus,
    pub transcript: Option<Transcript>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transcript {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub segments: Vec<TranscriptSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refined_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: u32,
    pub start: f64,
    pub end: f64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<Vec<u32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_logprob: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compression_ratio: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_speech_prob: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    /// Voice-bank person name from API JOIN (Alice, Guest-1); not stored as column.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub person_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identify_confidence: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refined_text: Option<String>,
}

// ============================================================================
// Voice bank / persons
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Person {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePersonRequest {
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePersonRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aliases: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListPersonsResponse {
    pub persons: Vec<Person>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceprintSample {
    pub id: String,
    pub person_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voiceprint_id: Option<String>,
    pub audio_path: String,
    pub duration_s: f64,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meeting_id: Option<String>,
    #[serde(default)]
    pub segment_ids: Vec<u32>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListVoiceprintSamplesResponse {
    pub samples: Vec<VoiceprintSample>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceprintMetaResponse {
    pub id: String,
    pub person_id: String,
    pub model: String,
    pub dim: u32,
    pub enrolled_from: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListVoiceprintsResponse {
    pub voiceprints: Vec<VoiceprintMetaResponse>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebuildVoiceprintResponse {
    pub rebuilt: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voiceprint: Option<VoiceprintMetaResponse>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeakerIdentityResponse {
    pub diar_label: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub person_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    pub speech_s: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentifySpeakersResponse {
    pub meeting_id: String,
    pub updated_segments: u64,
    pub matched: u32,
    pub guests: u32,
    pub skipped: u32,
    pub identities: Vec<SpeakerIdentityResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClearIdentificationResponse {
    pub meeting_id: String,
    pub cleared_segments: u64,
}

/// Matched transcript segment from global search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchedSegment {
    pub segment_id: u32,
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub timestamp: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
}

/// Meeting with matched transcript segments from global search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSearchResult {
    pub id: String,
    pub title: String,
    pub date: DateTime<Utc>,
    pub duration_seconds: Option<u64>,
    pub status: MeetingStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<String>>,
    pub matched_segments: Vec<MatchedSegment>,
    pub match_count: usize,
    pub relevance_score: f64,
}

/// Response from `GET /transcripts/search`.
#[derive(Debug, Serialize, Deserialize)]
pub struct GlobalTranscriptSearchResponse {
    pub query: String,
    pub total_meetings: u64,
    pub limit: u32,
    pub offset: u32,
    pub meetings: Vec<MeetingSearchResult>,
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

/// Wire format matches ai-meeting-agent:
/// `keypoints` | `actionitems` | `decisions` | `full` | `meeting_notes` | `meetingnotes`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SummaryTemplate {
    #[serde(
        rename = "keypoints",
        alias = "key_points",
        alias = "KeyPoints",
        alias = "keyPoints"
    )]
    KeyPoints,
    #[serde(
        rename = "actionitems",
        alias = "action_items",
        alias = "ActionItems",
        alias = "actionItems"
    )]
    ActionItems,
    #[serde(rename = "decisions", alias = "Decisions")]
    Decisions,
    #[serde(rename = "full", alias = "Full")]
    Full,
    #[serde(
        rename = "meeting_notes",
        alias = "meetingnotes",
        alias = "MeetingNotes",
        alias = "meetingNotes"
    )]
    MeetingNotes,
}

impl SummaryTemplate {
    /// Path/query segment for GET `/meetings/{id}/summary/{template}`
    pub fn as_api_str(&self) -> &'static str {
        match self {
            SummaryTemplate::KeyPoints => "keypoints",
            SummaryTemplate::ActionItems => "actionitems",
            SummaryTemplate::Decisions => "decisions",
            SummaryTemplate::Full => "full",
            SummaryTemplate::MeetingNotes => "meeting_notes",
        }
    }

    pub fn from_api_str(s: &str) -> Option<Self> {
        match s {
            "key_points" | "keypoints" | "KeyPoints" | "keyPoints" => Some(Self::KeyPoints),
            "action_items" | "actionitems" | "ActionItems" | "actionItems" => {
                Some(Self::ActionItems)
            }
            "decisions" | "Decisions" => Some(Self::Decisions),
            "full" | "Full" => Some(Self::Full),
            "meeting_notes" | "meetingnotes" | "MeetingNotes" | "meetingNotes" => {
                Some(Self::MeetingNotes)
            }
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SummaryStatus {
    #[serde(alias = "Pending")]
    Pending,
    #[serde(alias = "Processing")]
    Processing,
    #[serde(alias = "Completed")]
    Completed,
    #[serde(alias = "Failed")]
    Failed,
}

impl std::fmt::Display for SummaryStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SummaryStatus::Pending => write!(f, "Pending"),
            SummaryStatus::Processing => write!(f, "Processing"),
            SummaryStatus::Completed => write!(f, "Completed"),
            SummaryStatus::Failed => write!(f, "Failed"),
        }
    }
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
    Retranscribe,
    Identify,
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
    pub status: JobState,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CancelJobResponse {
    pub job_id: String,
    pub cancelled: bool,
}

// ============================================================================
// Live meeting bots (proxied via agent POST /bots → meeting-bot worker)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBotRequest {
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meeting_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_meeting_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bot_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBotResponse {
    #[serde(default)]
    pub job_id: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

impl CreateBotResponse {
    pub fn bot_id(&self) -> Option<String> {
        self.job_id
            .clone()
            .or_else(|| self.id.clone())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotJob {
    pub id: String,
    pub platform: String,
    pub status: String,
    #[serde(default)]
    pub meeting_url: Option<String>,
    #[serde(default)]
    pub native_meeting_id: Option<String>,
    #[serde(default)]
    pub bot_name: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub recording_path: Option<String>,
    #[serde(default)]
    pub meeting_agent_job_id: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListBotsResponse {
    #[serde(default)]
    pub bots: Vec<BotJob>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListBotPlatformsResponse {
    #[serde(default)]
    pub platforms: Vec<PlatformInfo>,
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
