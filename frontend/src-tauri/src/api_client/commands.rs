// Tauri commands exposing API client to frontend

use crate::api_client::cache::MemoryCache;
use crate::api_client::client::ApiClient;
use crate::api_client::config::ApiConfig;
use crate::api_client::queue::UploadQueue;
use crate::api_client::types::*;
use crate::api_client::worker::UploadWorker;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

// ============================================================================
// Command Result Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct CommandResult<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T> CommandResult<T> {
    fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

// ============================================================================
// API Configuration Commands
// ============================================================================

#[tauri::command]
pub async fn get_api_config(
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<ApiConfig>, String> {
    match ApiConfig::load_from_db(&pool).await {
        Ok(config) => Ok(CommandResult::success(config)),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to load config: {}",
            e
        ))),
    }
}

#[tauri::command]
pub async fn set_api_config(
    base_url: String,
    api_key: Option<String>,
    pool: State<'_, sqlx::SqlitePool>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<ApiConfig>, String> {
    let config = ApiConfig::new(base_url, api_key);

    // Validate config
    if let Err(e) = config.validate() {
        return Ok(CommandResult::error(e));
    }

    // Save to database
    if let Err(e) = config.save_to_db(&pool).await {
        return Ok(CommandResult::error(format!("Failed to save config: {}", e)));
    }

    // Update ApiClient
    let mut client_guard = client.write().await;
    if let Err(e) = client_guard.update_config(config.clone()) {
        return Ok(CommandResult::error(format!(
            "Failed to update client: {}",
            e
        )));
    }

    Ok(CommandResult::success(config))
}

#[tauri::command]
pub async fn test_api_connection(
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<bool>, String> {
    let client = client.read().await;
    match client.health_check().await {
        Ok(_) => Ok(CommandResult::success(true)),
        Err(e) => Ok(CommandResult::error(format!("Connection failed: {}", e))),
    }
}

// ============================================================================
// Meeting Commands
// ============================================================================

#[tauri::command]
pub async fn list_meetings(
    limit: Option<u64>,
    offset: Option<u64>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<ListMeetingsResponse>, String> {
    let client = client.read().await;
    match client.list_meetings(limit, offset).await {
        Ok(response) => {
            // Cache meetings
            cache.set_meetings(response.meetings.clone()).await;
            Ok(CommandResult::success(response))
        }
        Err(e) => Ok(CommandResult::error(format!("Failed to list meetings: {}", e))),
    }
}

#[tauri::command]
pub async fn get_meeting(
    id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<Meeting>, String> {
    // Check cache first
    if let Some(meeting) = cache.get_meeting(&id).await {
        return Ok(CommandResult::success(meeting));
    }

    // Fetch from API
    let client = client.read().await;
    match client.get_meeting(&id).await {
        Ok(meeting) => {
            // Cache result
            cache.set_meeting(meeting.clone()).await;
            Ok(CommandResult::success(meeting))
        }
        Err(e) => Ok(CommandResult::error(format!("Failed to get meeting: {}", e))),
    }
}

#[tauri::command]
pub async fn update_meeting(
    id: String,
    title: Option<String>,
    #[allow(unused_mut)]
    mut participants: Option<Vec<String>>,
    date: Option<String>,
    location: Option<String>,
    organizer: Option<String>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<Meeting>, String> {
    use crate::api_client::types::UpdateMeetingRequest;
    use chrono::{DateTime, Utc};

    // Normalize empty optional title from frontend nulls that arrive as Some("")
    let title = title.and_then(|t| {
        let t = t.trim().to_string();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    });
    if let Some(list) = participants.as_mut() {
        *list = list
            .iter()
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty())
            .collect();
    }

    let parsed_date: Option<DateTime<Utc>> = match date {
        None => None,
        Some(s) => {
            let s = s.trim();
            if s.is_empty() {
                None
            } else {
                match DateTime::parse_from_rfc3339(s) {
                    Ok(dt) => Some(dt.with_timezone(&Utc)),
                    Err(e) => {
                        return Ok(CommandResult::error(format!(
                            "Invalid date (expected RFC3339): {}",
                            e
                        )));
                    }
                }
            }
        }
    };

    // location/organizer: Some("") clears on server; None leaves unchanged
    let location = location.map(|s| s.trim().to_string());
    let organizer = organizer.map(|s| s.trim().to_string());

    if title.is_none()
        && participants.is_none()
        && parsed_date.is_none()
        && location.is_none()
        && organizer.is_none()
    {
        return Ok(CommandResult::error(
            "At least one of title, date, participants, location, or organizer must be provided"
                .to_string(),
        ));
    }

    let request = UpdateMeetingRequest {
        title,
        date: parsed_date,
        participants,
        location,
        organizer,
    };

    let client = client.read().await;
    match client.update_meeting(&id, request).await {
        Ok(meeting) => {
            cache.set_meeting(meeting.clone()).await;
            Ok(CommandResult::success(meeting))
        }
        Err(e) => Ok(CommandResult::error(format!("Failed to update meeting: {}", e))),
    }
}

#[tauri::command]
pub async fn rename_meeting_speakers(
    id: String,
    mapping: std::collections::HashMap<String, String>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<RenameSpeakersResponse>, String> {
    if mapping.is_empty() {
        return Ok(CommandResult::error(
            "mapping must contain at least one entry".to_string(),
        ));
    }

    let cleaned: std::collections::HashMap<String, String> = mapping
        .into_iter()
        .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
        .filter(|(k, v)| !k.is_empty() && !v.is_empty())
        .collect();

    if cleaned.is_empty() {
        return Ok(CommandResult::error(
            "mapping must contain at least one non-empty rename".to_string(),
        ));
    }

    let request = RenameSpeakersRequest { mapping: cleaned };
    let client = client.read().await;
    match client.rename_speakers(&id, request).await {
        Ok(response) => {
            // Speaker labels live on transcript segments; drop cached transcript so next
            // fetch reflects renames. Meeting cache is unchanged.
            cache.remove_transcript(&id).await;
            Ok(CommandResult::success(response))
        }
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to rename speakers: {}",
            e
        ))),
    }
}

#[tauri::command]
pub async fn identify_meeting_speakers(
    id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<IdentifySpeakersResponse>, String> {
    let client = client.read().await;
    match client.identify_speakers(&id).await {
        Ok(response) => {
            cache.remove_transcript(&id).await;
            Ok(CommandResult::success(response))
        }
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to identify speakers: {}",
            e
        ))),
    }
}

// ============================================================================
// Voice bank / persons
// ============================================================================

#[tauri::command]
pub async fn list_persons(
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<ListPersonsResponse>, String> {
    let client = client.read().await;
    match client.list_persons().await {
        Ok(r) => Ok(CommandResult::success(r)),
        Err(e) => Ok(CommandResult::error(format!("Failed to list persons: {}", e))),
    }
}

#[tauri::command]
pub async fn create_person(
    name: String,
    aliases: Option<Vec<String>>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<Person>, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Ok(CommandResult::error("Person name cannot be empty".into()));
    }
    let request = CreatePersonRequest {
        name,
        aliases: aliases.unwrap_or_default(),
    };
    let client = client.read().await;
    match client.create_person(request).await {
        Ok(p) => Ok(CommandResult::success(p)),
        Err(e) => Ok(CommandResult::error(format!("Failed to create person: {}", e))),
    }
}

#[tauri::command]
pub async fn get_person(
    id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<Person>, String> {
    let client = client.read().await;
    match client.get_person(&id).await {
        Ok(p) => Ok(CommandResult::success(p)),
        Err(e) => Ok(CommandResult::error(format!("Failed to get person: {}", e))),
    }
}

#[tauri::command]
pub async fn update_person(
    id: String,
    name: Option<String>,
    aliases: Option<Vec<String>>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<Person>, String> {
    let request = UpdatePersonRequest { name, aliases };
    let client = client.read().await;
    match client.update_person(&id, request).await {
        Ok(p) => Ok(CommandResult::success(p)),
        Err(e) => Ok(CommandResult::error(format!("Failed to update person: {}", e))),
    }
}

#[tauri::command]
pub async fn delete_person(
    id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<bool>, String> {
    let client = client.read().await;
    match client.delete_person(&id).await {
        Ok(()) => Ok(CommandResult::success(true)),
        Err(e) => Ok(CommandResult::error(format!("Failed to delete person: {}", e))),
    }
}

#[tauri::command]
pub async fn list_person_samples(
    person_id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<ListVoiceprintSamplesResponse>, String> {
    let client = client.read().await;
    match client.list_person_samples(&person_id).await {
        Ok(r) => Ok(CommandResult::success(r)),
        Err(e) => Ok(CommandResult::error(format!("Failed to list samples: {}", e))),
    }
}

#[tauri::command]
pub async fn add_person_sample(
    person_id: String,
    file_path: String,
    duration_s: Option<f64>,
    meeting_id: Option<String>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<VoiceprintSample>, String> {
    let path = std::path::PathBuf::from(&file_path);
    if !path.exists() {
        return Ok(CommandResult::error(format!(
            "File not found: {}",
            file_path
        )));
    }
    let client = client.read().await;
    match client
        .add_person_sample(&person_id, &path, duration_s, meeting_id)
        .await
    {
        Ok(s) => Ok(CommandResult::success(s)),
        Err(e) => Ok(CommandResult::error(format!("Failed to add sample: {}", e))),
    }
}

#[tauri::command]
pub async fn delete_person_sample(
    person_id: String,
    sample_id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<bool>, String> {
    let client = client.read().await;
    match client.delete_person_sample(&person_id, &sample_id).await {
        Ok(()) => Ok(CommandResult::success(true)),
        Err(e) => Ok(CommandResult::error(format!("Failed to delete sample: {}", e))),
    }
}

#[tauri::command]
pub async fn rebuild_person_voiceprint(
    person_id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<RebuildVoiceprintResponse>, String> {
    let client = client.read().await;
    match client.rebuild_voiceprint(&person_id).await {
        Ok(r) => Ok(CommandResult::success(r)),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to rebuild voiceprint: {}",
            e
        ))),
    }
}

#[tauri::command]
pub async fn list_voiceprints(
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<ListVoiceprintsResponse>, String> {
    let client = client.read().await;
    match client.list_voiceprints().await {
        Ok(r) => Ok(CommandResult::success(r)),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to list voiceprints: {}",
            e
        ))),
    }
}

/// Download meeting recording as bytes for playback.
#[tauri::command]
pub async fn get_meeting_recording(
    meeting_id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<Vec<u8>>, String> {
    let client = client.read().await;
    match client.get_recording(&meeting_id).await {
        Ok(bytes) => Ok(CommandResult::success(bytes)),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to download recording: {}",
            e
        ))),
    }
}

/// Download person sample audio as bytes for playback.
#[tauri::command]
pub async fn get_person_sample_audio(
    person_id: String,
    sample_id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<Vec<u8>>, String> {
    let client = client.read().await;
    match client.get_person_sample_audio(&person_id, &sample_id).await {
        Ok(bytes) => Ok(CommandResult::success(bytes)),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to download sample audio: {}",
            e
        ))),
    }
}

#[tauri::command]
pub async fn delete_meeting(
    id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<bool>, String> {
    let client = client.read().await;
    match client.delete_meeting(&id).await {
        Ok(_) => {
            // Invalidate cache
            cache.remove_meeting(&id).await;
            Ok(CommandResult::success(true))
        }
        Err(e) => Ok(CommandResult::error(format!("Failed to delete meeting: {}", e))),
    }
}

#[tauri::command]
pub async fn retranscribe_meeting(
    id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<ImportResponse>, String> {
    let client = client.read().await;
    match client.retranscribe_meeting(&id).await {
        Ok(response) => {
            cache.remove_meeting(&id).await;
            Ok(CommandResult::success(response))
        }
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to retranscribe meeting: {}",
            e
        ))),
    }
}

// ============================================================================
// Transcript Commands
// ============================================================================

#[tauri::command]
pub async fn get_transcript(
    meeting_id: String,
    limit: Option<u64>,
    offset: Option<u64>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<TranscriptResponse>, String> {
    let client = client.read().await;
    match client.get_transcript(&meeting_id, limit, offset).await {
        Ok(response) => {
            // Cache transcript if complete
            if let Some(ref transcript) = response.transcript {
                cache
                    .set_transcript(meeting_id.clone(), transcript.clone())
                    .await;
            }
            Ok(CommandResult::success(response))
        }
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to get transcript: {}",
            e
        ))),
    }
}

#[tauri::command]
pub async fn search_transcripts(
    query: String,
    limit: Option<u64>,
    offset: Option<u64>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<GlobalTranscriptSearchResponse>, String> {
    let client = client.read().await;
    match client
        .search_all_transcripts(&query, limit, offset)
        .await
    {
        Ok(response) => Ok(CommandResult::success(response)),
        Err(e) => Ok(CommandResult::error(format!("Search failed: {}", e))),
    }
}

// ============================================================================
// Summary Commands
// ============================================================================

#[tauri::command]
pub async fn list_summaries(
    meeting_id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<SummaryListResponse>, String> {
    let client = client.read().await;
    match client.list_summaries(&meeting_id).await {
        Ok(response) => {
            // Cache summaries
            cache
                .set_summaries(meeting_id.clone(), response.summaries.clone())
                .await;
            Ok(CommandResult::success(response))
        }
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to list summaries: {}",
            e
        ))),
    }
}

fn parse_summary_template(template: &str) -> Result<SummaryTemplate, String> {
    SummaryTemplate::from_api_str(template)
        .ok_or_else(|| format!("Invalid template: {}", template))
}

#[tauri::command]
pub async fn get_summary(
    meeting_id: String,
    template: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<Option<Summary>>, String> {
    let template_enum = match parse_summary_template(&template) {
        Ok(t) => t,
        Err(e) => return Ok(CommandResult::error(e)),
    };

    let client = client.read().await;
    match client.get_summary(&meeting_id, &template_enum).await {
        Ok(summary) => Ok(CommandResult::success(Some(summary))),
        Err(ApiError::NotFound(_)) => Ok(CommandResult::success(None)),
        Err(e) => {
            // Some backends return 404-like API errors for missing template summaries
            let msg = e.to_string();
            if msg.contains("404") || msg.to_lowercase().contains("not found") {
                Ok(CommandResult::success(None))
            } else {
                Ok(CommandResult::error(format!("Failed to get summary: {}", e)))
            }
        }
    }
}

#[tauri::command]
pub async fn generate_summary(
    meeting_id: String,
    template: String,
    language: Option<String>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<ImportResponse>, String> {
    let template_enum = match parse_summary_template(&template) {
        Ok(t) => t,
        Err(e) => return Ok(CommandResult::error(e)),
    };

    let request = GenerateSummaryRequest {
        template: template_enum,
        language,
    };

    let client = client.read().await;
    match client.generate_summary(&meeting_id, request).await {
        Ok(response) => Ok(CommandResult::success(response)),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to generate summary: {}",
            e
        ))),
    }
}

// ============================================================================
// Job Commands
// ============================================================================

#[tauri::command]
pub async fn get_job_status(
    job_id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<JobStatusResponse>, String> {
    let client = client.read().await;
    match client.get_job_status(&job_id).await {
        Ok(status) => Ok(CommandResult::success(status)),
        Err(e) => Ok(CommandResult::error(format!("Failed to get job status: {}", e))),
    }
}

#[tauri::command]
pub async fn cancel_job(
    job_id: String,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<CancelJobResponse>, String> {
    let client = client.read().await;
    match client.cancel_job(&job_id).await {
        Ok(response) => Ok(CommandResult::success(response)),
        Err(e) => Ok(CommandResult::error(format!("Failed to cancel job: {}", e))),
    }
}

// ============================================================================
// Upload Queue Commands
// ============================================================================

#[tauri::command]
pub async fn get_upload_queue_count(
    queue: State<'_, Arc<UploadQueue>>,
) -> Result<CommandResult<i64>, String> {
    match queue.count_pending().await {
        Ok(count) => Ok(CommandResult::success(count)),
        Err(e) => Ok(CommandResult::error(format!("Failed to count queue: {}", e))),
    }
}

#[tauri::command]
pub async fn clear_upload_queue(
    queue: State<'_, Arc<UploadQueue>>,
) -> Result<CommandResult<bool>, String> {
    match queue.clear_all().await {
        Ok(_) => Ok(CommandResult::success(true)),
        Err(e) => Ok(CommandResult::error(format!("Failed to clear queue: {}", e))),
    }
}

// ============================================================================
// Worker Commands
// ============================================================================

#[tauri::command]
pub async fn start_upload_worker(
    worker: State<'_, Arc<UploadWorker>>,
) -> Result<CommandResult<bool>, String> {
    worker.start().await;
    Ok(CommandResult::success(true))
}

#[tauri::command]
pub async fn stop_upload_worker(
    worker: State<'_, Arc<UploadWorker>>,
) -> Result<CommandResult<bool>, String> {
    worker.stop().await;
    Ok(CommandResult::success(true))
}

#[tauri::command]
pub async fn is_upload_worker_running(
    worker: State<'_, Arc<UploadWorker>>,
) -> Result<CommandResult<bool>, String> {
    let running = worker.is_running().await;
    Ok(CommandResult::success(running))
}

// ============================================================================
// Cache Commands
// ============================================================================

#[tauri::command]
pub async fn clear_cache(cache: State<'_, Arc<MemoryCache>>) -> Result<CommandResult<bool>, String> {
    cache.clear_all().await;
    Ok(CommandResult::success(true))
}

#[tauri::command]
pub async fn get_cache_stats(
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<crate::api_client::cache::CacheStats>, String> {
    let stats = cache.get_cache_stats().await;
    Ok(CommandResult::success(stats))
}
