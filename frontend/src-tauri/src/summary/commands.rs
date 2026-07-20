use crate::database::repositories::{
    meeting::MeetingsRepository,
    summary::SummaryProcessesRepository, transcript_chunk::TranscriptChunksRepository,
};
use crate::state::AppState;
use crate::summary::metadata::{
    read_detected_summary_language_from_metadata, read_summary_language_from_metadata,
    write_detected_summary_language_to_metadata, write_summary_language_to_metadata,
};
use crate::summary::language_detection::{
    detect_summary_language, SummaryLanguageDetection,
};
use crate::summary::service::SummaryService;
use log::{error as log_error, info as log_info, warn as log_warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

#[derive(Debug, Serialize, Deserialize)]
pub struct SummaryResponse {
    pub status: String,
    #[serde(rename = "meetingName")]
    pub meeting_name: Option<String>,
    pub meeting_id: String,
    pub start: Option<String>,
    pub end: Option<String>,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessTranscriptResponse {
    pub message: String,
    pub process_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SummaryLanguageStorage {
    Metadata,
    LocalFallback,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSummaryLanguagePreference {
    pub language: Option<String>,
    pub storage: SummaryLanguageStorage,
}

impl MeetingSummaryLanguagePreference {
    fn metadata(language: Option<String>) -> Self {
        Self {
            language,
            storage: SummaryLanguageStorage::Metadata,
        }
    }

    fn local_fallback() -> Self {
        Self {
            language: None,
            storage: SummaryLanguageStorage::LocalFallback,
        }
    }
}

enum MeetingFolderResolution {
    Folder(PathBuf),
    NoFolder,
}

/// Saves a meeting summary (Native SQLx implementation)
///
/// Expected format: { "markdown": "...", "summary_json": [...BlockNote blocks...] }
#[tauri::command]
pub async fn api_save_meeting_summary<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_id: String,
    summary: serde_json::Value,
    _auth_token: Option<String>,
) -> Result<serde_json::Value, String> {
    log_info!(
        "api_save_meeting_summary (native) called for meeting_id: {}",
        meeting_id
    );
    let pool = state.db_manager.pool();

    match SummaryProcessesRepository::update_meeting_summary(pool, &meeting_id, &summary).await {
        Ok(true) => {
            log_info!("Summary saved successfully for meeting_id: {}", meeting_id);
            Ok(serde_json::json!({
                "message": "Meeting summary saved successfully"
            }))
        }
        Ok(false) => {
            log_warn!(
                "Meeting not found or invalid JSON for meeting_id: {}",
                meeting_id
            );
            Err("Meeting not found or can't convert the json".into())
        }
        Err(e) => {
            log_error!("Failed to save meeting summary for {}: {}", meeting_id, e);
            Err(e.to_string())
        }
    }
}

/// Gets the per-meeting summary language override from metadata.json.
#[tauri::command]
pub async fn api_get_meeting_summary_language<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_id: String,
) -> Result<MeetingSummaryLanguagePreference, String> {
    log_info!(
        "api_get_meeting_summary_language called for meeting_id: {}",
        meeting_id
    );

    match resolve_meeting_folder(state.db_manager.pool(), &meeting_id).await? {
        MeetingFolderResolution::Folder(folder) => read_summary_language_from_metadata(&folder)
            .map(MeetingSummaryLanguagePreference::metadata)
            .map_err(|e| e.to_string()),
        MeetingFolderResolution::NoFolder => Ok(MeetingSummaryLanguagePreference::local_fallback()),
    }
}

/// Saves or clears the per-meeting summary language override in metadata.json.
#[tauri::command]
pub async fn api_save_meeting_summary_language<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_id: String,
    summary_language: Option<String>,
) -> Result<MeetingSummaryLanguagePreference, String> {
    log_info!(
        "api_save_meeting_summary_language called for meeting_id: {}, language: {:?}",
        meeting_id,
        summary_language
    );

    match resolve_meeting_folder(state.db_manager.pool(), &meeting_id).await? {
        MeetingFolderResolution::Folder(folder) => {
            write_summary_language_to_metadata(&folder, summary_language.as_deref())
                .map_err(|e| e.to_string())?;
            read_summary_language_from_metadata(&folder)
                .map(MeetingSummaryLanguagePreference::metadata)
                .map_err(|e| e.to_string())
        }
        MeetingFolderResolution::NoFolder => Ok(MeetingSummaryLanguagePreference::local_fallback()),
    }
}

/// Gets the cached Auto-detected summary language from metadata.json.
#[tauri::command]
pub async fn api_get_meeting_detected_summary_language<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_id: String,
) -> Result<MeetingSummaryLanguagePreference, String> {
    log_info!(
        "api_get_meeting_detected_summary_language called for meeting_id: {}",
        meeting_id
    );

    match resolve_meeting_folder(state.db_manager.pool(), &meeting_id).await? {
        MeetingFolderResolution::Folder(folder) => read_detected_summary_language_from_metadata(&folder)
            .map(MeetingSummaryLanguagePreference::metadata)
            .map_err(|e| e.to_string()),
        MeetingFolderResolution::NoFolder => Ok(MeetingSummaryLanguagePreference::local_fallback()),
    }
}

/// Saves or clears the cached Auto-detected summary language in metadata.json.
#[tauri::command]
pub async fn api_save_meeting_detected_summary_language<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_id: String,
    detected_summary_language: Option<String>,
) -> Result<MeetingSummaryLanguagePreference, String> {
    log_info!(
        "api_save_meeting_detected_summary_language called for meeting_id: {}, language: {:?}",
        meeting_id,
        detected_summary_language
    );

    match resolve_meeting_folder(state.db_manager.pool(), &meeting_id).await? {
        MeetingFolderResolution::Folder(folder) => {
            write_detected_summary_language_to_metadata(&folder, detected_summary_language.as_deref())
                .map_err(|e| e.to_string())?;
            read_detected_summary_language_from_metadata(&folder)
                .map(MeetingSummaryLanguagePreference::metadata)
                .map_err(|e| e.to_string())
        }
        MeetingFolderResolution::NoFolder => Ok(MeetingSummaryLanguagePreference::local_fallback()),
    }
}

/// Detects the dominant supported summary language from transcript segments.
#[tauri::command]
pub async fn api_detect_transcript_summary_language(
    transcript_texts: Vec<String>,
) -> Result<SummaryLanguageDetection, String> {
    Ok(detect_summary_language(&transcript_texts))
}

async fn resolve_meeting_folder(
    pool: &sqlx::SqlitePool,
    meeting_id: &str,
) -> Result<MeetingFolderResolution, String> {
    let meeting = MeetingsRepository::get_meeting_metadata(pool, meeting_id)
        .await
        .map_err(|e| format!("Failed to load meeting metadata: {}", e))?
        .ok_or_else(|| format!("Meeting not found: {}", meeting_id))?;

    let Some(folder_path) = meeting.folder_path.filter(|p| !p.trim().is_empty()) else {
        return Ok(MeetingFolderResolution::NoFolder);
    };

    Ok(MeetingFolderResolution::Folder(PathBuf::from(folder_path)))
}

/// Gets summary status and data (Native SQLx implementation)
///
/// Returns summary status (pending/processing/completed/failed) and parsed result data
#[tauri::command]
pub async fn api_get_summary<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_id: String,
    _auth_token: Option<String>,
) -> Result<SummaryResponse, String> {
    log_info!(
        "api_get_summary called for meeting_id: {}",
        meeting_id
    );

    // Use API client to fetch summary from ai-meeting-agent
    let client = state.api_client.read().await;
    let cache = state.memory_cache.clone();

    // Check cache first
    if let Some(cached_summaries) = cache.get_summaries(&meeting_id).await {
        log_info!("Using cached summaries for meeting {}", meeting_id);
        
        // Find the "full" template summary (or first available)
        if let Some(summary) = cached_summaries.iter().find(|s| matches!(s.template, crate::api_client::types::SummaryTemplate::Full))
            .or_else(|| cached_summaries.first()) 
        {
            let data = serde_json::json!({
                "id": summary.id,
                "content": summary.content,
                "key_points": summary.key_points,
                "action_items": summary.action_items,
                "decisions": summary.decisions,
            });

            return Ok(SummaryResponse {
                status: summary.status.to_string().to_lowercase(),
                meeting_name: None, // Will be fetched separately by frontend if needed
                meeting_id: meeting_id.clone(),
                start: None,
                end: None,
                data: Some(data),
                error: None,
            });
        }
    }

    // Fetch from API
    match client.list_summaries(&meeting_id).await {
        Ok(summaries_response) => {
            log_info!("Successfully retrieved {} summaries from API for meeting {}", 
                summaries_response.summaries.len(), meeting_id);

            // Cache all summaries
            cache.set_summaries(meeting_id.clone(), summaries_response.summaries.clone()).await;

            // Find the "full" template summary (or first available)
            if let Some(summary) = summaries_response.summaries.iter()
                .find(|s| matches!(s.template, crate::api_client::types::SummaryTemplate::Full))
                .or_else(|| summaries_response.summaries.first())
            {
                let data = serde_json::json!({
                    "id": summary.id,
                    "content": summary.content,
                    "key_points": summary.key_points,
                    "action_items": summary.action_items,
                    "decisions": summary.decisions,
                });

                Ok(SummaryResponse {
                    status: summary.status.to_string().to_lowercase(),
                    meeting_name: None, // Will be fetched separately by frontend if needed
                    meeting_id: meeting_id.clone(),
                    start: None,
                    end: None,
                    data: Some(data),
                    error: None,
                })
            } else {
                log_info!("No summaries found for meeting {}", meeting_id);
                Ok(SummaryResponse {
                    status: "idle".to_string(),
                    meeting_name: None,
                    meeting_id,
                    start: None,
                    end: None,
                    data: None,
                    error: None,
                })
            }
        }
        Err(e) => {
            log_error!("Error retrieving summaries from API for meeting {}: {}", meeting_id, e);
            
            // Return idle state instead of error for better UX
            Ok(SummaryResponse {
                status: "idle".to_string(),
                meeting_name: None,
                meeting_id,
                start: None,
                end: None,
                data: None,
                error: Some(format!("Failed to retrieve summary: {}", e)),
            })
        }
    }
}

/// Processes transcript and generates summary using API client
///
/// Triggers summary generation on ai-meeting-agent and returns job_id for polling
#[tauri::command]
pub async fn api_process_transcript<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    text: String,
    model: String,
    model_name: String,
    meeting_id: Option<String>,
    _chunk_size: Option<i32>,
    _overlap: Option<i32>,
    custom_prompt: Option<String>,
    template_id: Option<String>,
    summary_language: Option<String>,
    _auth_token: Option<String>,
) -> Result<ProcessTranscriptResponse, String> {
    use uuid::Uuid;

    let m_id = meeting_id.unwrap_or_else(|| format!("meeting-{}", Uuid::new_v4()));
    log_info!(
        "api_process_transcript called for meeting_id: {}, model: {}",
        &m_id,
        &model
    );

    // Parse template from template_id (daily_standup, project_review, etc.)
    let template = match template_id.as_deref() {
        Some("key_points") => crate::api_client::types::SummaryTemplate::KeyPoints,
        Some("action_items") => crate::api_client::types::SummaryTemplate::ActionItems,
        Some("decisions") => crate::api_client::types::SummaryTemplate::Decisions,
        _ => crate::api_client::types::SummaryTemplate::Full,
    };

    // Normalize empty/whitespace language to None
    let language = summary_language.and_then(|s| {
        let t = s.trim();
        if t.is_empty() { None } else { Some(t.to_string()) }
    });

    // Use API client to trigger summary generation
    let client = state.api_client.read().await;
    
    let request = crate::api_client::types::GenerateSummaryRequest {
        template,
        language,
    };

    match client.generate_summary(&m_id, request).await {
        Ok(response) => {
            log_info!("Successfully triggered summary generation for meeting {}, job_id: {}", 
                m_id, response.job_id);

            // Spawn background task to poll job status and emit events
            let app_clone = app.clone();
            let job_id = response.job_id.clone();
            let meeting_id_clone = m_id.clone();
            let client_clone = state.api_client.clone();
            let cache_clone = state.memory_cache.clone();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = poll_summary_job(
                    app_clone,
                    client_clone,
                    cache_clone,
                    &job_id,
                    &meeting_id_clone,
                ).await {
                    log_error!("Error polling summary job {}: {}", job_id, e);
                }
            });

            Ok(ProcessTranscriptResponse {
                message: "Summary generation started".to_string(),
                process_id: response.job_id,
            })
        }
        Err(e) => {
            log_error!("Error triggering summary generation for meeting {}: {}", m_id, e);
            Err(format!("Failed to start summary generation: {}", e))
        }
    }
}

/// Poll summary job status and emit events to frontend
async fn poll_summary_job<R: Runtime>(
    app: AppHandle<R>,
    client: std::sync::Arc<tokio::sync::RwLock<crate::api_client::client::ApiClient>>,
    cache: crate::api_client::cache::MemoryCache,
    job_id: &str,
    meeting_id: &str,
) -> Result<(), String> {
    use std::time::Duration;

    log_info!("Starting to poll summary job {}", job_id);

    loop {
        tokio::time::sleep(Duration::from_secs(3)).await;

        let client_guard = client.read().await;
        match client_guard.get_job_status(job_id).await {
            Ok(status) => {
                log_debug!("Summary job {} state: {:?}", job_id, status.state);

                // Emit progress event
                if let Err(e) = app.emit("job-progress", serde_json::json!({
                    "job_id": job_id,
                    "job_type": "summary",
                    "state": format!("{:?}", status.state).to_lowercase(),
                    "progress": status.progress,
                    "meeting_id": meeting_id,
                })) {
                    log_error!("Failed to emit job-progress event: {}", e);
                }

                // Check if job is terminal
                if status.state.is_terminal() {
                    match status.state {
                        crate::api_client::types::JobState::Completed => {
                            log_info!("Summary job {} completed successfully", job_id);

                            // Fetch the generated summary and cache it
                            drop(client_guard); // Release read lock before async operation
                            let client_guard = client.read().await;
                            if let Ok(summaries) = client_guard.list_summaries(meeting_id).await {
                                cache.set_summaries(meeting_id.to_string(), summaries.summaries).await;
                            }

                            // Emit completion event
                            if let Err(e) = app.emit("job-completed", serde_json::json!({
                                "job_id": job_id,
                                "job_type": "summary",
                                "state": "completed",
                                "meeting_id": meeting_id,
                            })) {
                                log_error!("Failed to emit job-completed event: {}", e);
                            }
                        }
                        crate::api_client::types::JobState::Failed => {
                            log_error!("Summary job {} failed: {:?}", job_id, status.error);

                            // Emit failure event
                            if let Err(e) = app.emit("job-completed", serde_json::json!({
                                "job_id": job_id,
                                "job_type": "summary",
                                "state": "failed",
                                "meeting_id": meeting_id,
                                "error": status.error,
                            })) {
                                log_error!("Failed to emit job-completed event: {}", e);
                            }
                        }
                        crate::api_client::types::JobState::Cancelled => {
                            log_info!("Summary job {} was cancelled", job_id);

                            // Emit cancellation event
                            if let Err(e) = app.emit("job-completed", serde_json::json!({
                                "job_id": job_id,
                                "job_type": "summary",
                                "state": "cancelled",
                                "meeting_id": meeting_id,
                            })) {
                                log_error!("Failed to emit job-completed event: {}", e);
                            }
                        }
                        _ => {}
                    }

                    break; // Exit polling loop
                }
            }
            Err(e) => {
                log_error!("Error polling summary job {}: {}", job_id, e);
                
                // Emit error event
                if let Err(emit_err) = app.emit("job-completed", serde_json::json!({
                    "job_id": job_id,
                    "job_type": "summary",
                    "state": "failed",
                    "meeting_id": meeting_id,
                    "error": format!("Polling error: {}", e),
                })) {
                    log_error!("Failed to emit job-completed event: {}", emit_err);
                }

                return Err(format!("Failed to poll job status: {}", e));
            }
        }
    }

    Ok(())
}
            meeting_id_clone.clone(),
            text,
            model,
            model_name,
            final_prompt,
            final_template_id,
            summary_language,
        )
        .await;
    });

    log_info!("🚀 Background task spawned for meeting_id: {}", &m_id);

    Ok(ProcessTranscriptResponse {
        message: "Summary generation started".to_string(),
        process_id: m_id,
    })
}

/// Cancels an ongoing summary generation process
///
/// This command triggers the cancellation token for the specified meeting,
/// stopping the summary generation gracefully.
#[tauri::command]
pub async fn api_cancel_summary<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_id: String,
) -> Result<serde_json::Value, String> {
    log_info!("api_cancel_summary called for meeting_id: {}", meeting_id);

    // Note: We need the job_id to cancel via API, but the frontend only provides meeting_id
    // For now, we'll need to track active job_ids per meeting_id
    // This is a limitation - the API requires job_id for cancellation
    
    log_warn!("API-based summary cancellation requires job_id tracking (not yet implemented)");
    log_warn!("Summary will complete or fail naturally");

    Ok(serde_json::json!({
        "message": "Summary cancellation not yet supported via API (requires job_id tracking)",
        "meeting_id": meeting_id,
    }))
}

// TODO: Implement job_id tracking per meeting_id to enable cancellation
// Options:
// 1. Add job_id -> meeting_id mapping in MemoryCache
// 2. Store active job_id in AppState per meeting
// 3. Return job_id from api_process_transcript and require frontend to track it
