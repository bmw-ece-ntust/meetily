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

/// Processes transcript and generates summary (Native SQLx implementation)
///
/// Spawns a background task and returns immediately with process_id
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
        "api_process_transcript (native) called for meeting_id: {}, model: {}",
        &m_id,
        &model
    );

    let pool = state.db_manager.pool().clone();
    let final_prompt = custom_prompt.unwrap_or_else(|| "".to_string());
    let final_template_id = template_id.unwrap_or_else(|| "daily_standup".to_string());

    // Normalise empty / whitespace-only to None so "" and null behave identically
    let summary_language = summary_language.and_then(|s| {
        let t = s.trim();
        if t.is_empty() { None } else { Some(t.to_string()) }
    });

    // Create or reset the process entry in the database
    SummaryProcessesRepository::create_or_reset_process(&pool, &m_id)
        .await
        .map_err(|e| format!("Failed to initialize process: {}", e))?;

    log_info!("✓ Summary process initialized for meeting_id: {}", &m_id);

    // Save transcript chunks data (matching Python backend behavior)
    let chunk_size = _chunk_size.unwrap_or(40000);
    let overlap = _overlap.unwrap_or(1000);

    TranscriptChunksRepository::save_transcript_data(
        &pool,
        &m_id,
        &text,
        &model,
        &model_name,
        chunk_size,
        overlap,
    )
    .await
    .map_err(|e| format!("Failed to save transcript data: {}", e))?;

    log_info!("✓ Transcript chunks saved for meeting_id: {}", &m_id);

    // Spawn background task for actual processing
    let meeting_id_clone = m_id.clone();
    tauri::async_runtime::spawn(async move {
        SummaryService::process_transcript_background(
            app,
            pool,
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

    // Trigger cancellation via the service
    let cancelled = SummaryService::cancel_summary(&meeting_id);

    if cancelled {
        // Update database status to cancelled
        let pool = state.db_manager.pool();
        if let Err(e) = SummaryProcessesRepository::update_process_cancelled(pool, &meeting_id).await {
            log_error!("Failed to update DB status to cancelled for {}: {}", meeting_id, e);
            return Err(format!("Failed to update cancellation status: {}", e));
        }

        log_info!("Successfully cancelled summary generation for meeting_id: {}", meeting_id);
        Ok(serde_json::json!({
            "message": "Summary generation cancelled successfully",
            "meeting_id": meeting_id,
        }))
    } else {
        log_warn!("No active summary generation found for meeting_id: {}", meeting_id);
        Ok(serde_json::json!({
            "message": "No active summary generation to cancel",
            "meeting_id": meeting_id,
        }))
    }
}
