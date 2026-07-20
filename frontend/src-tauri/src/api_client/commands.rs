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
    client: State<'_, Arc<RwLock<ApiClient>>>,
    cache: State<'_, Arc<MemoryCache>>,
) -> Result<CommandResult<Meeting>, String> {
    use crate::api_client::types::UpdateMeetingRequest;
    
    let request = UpdateMeetingRequest {
        title,
        date: None,
    };
    
    let client = client.read().await;
    match client.update_meeting(&id, request).await {
        Ok(meeting) => {
            // Update cache
            cache.set_meeting(meeting.clone()).await;
            Ok(CommandResult::success(meeting))
        }
        Err(e) => Ok(CommandResult::error(format!("Failed to update meeting: {}", e))),
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

#[tauri::command]
pub async fn generate_summary(
    meeting_id: String,
    template: String,
    language: Option<String>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<ImportResponse>, String> {
    // Parse template
    let template_enum = match template.as_str() {
        "key_points" => SummaryTemplate::KeyPoints,
        "action_items" => SummaryTemplate::ActionItems,
        "decisions" => SummaryTemplate::Decisions,
        "full" => SummaryTemplate::Full,
        _ => {
            return Ok(CommandResult::error(format!("Invalid template: {}", template)));
        }
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
