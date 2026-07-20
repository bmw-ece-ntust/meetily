// Audio import via ai-meeting-agent REST API.

use crate::api_client::client::ApiClient;
use crate::api_client::types::JobState;
use crate::state::AppState;
use anyhow::{anyhow, Result};
use log::{error, info};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::RwLock;

use super::constants::AUDIO_EXTENSIONS;

const MAX_CONCURRENT_IMPORTS: usize = 3;
const MAX_FILE_SIZE_BYTES: u64 = 20 * 1024 * 1024 * 1024;

static ACTIVE_IMPORTS: AtomicUsize = AtomicUsize::new(0);
static CANCELLED_JOBS: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioFileInfo {
    pub path: String,
    pub filename: String,
    pub duration_seconds: f64,
    pub size_bytes: u64,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgress {
    pub job_id: String,
    pub stage: String,
    pub progress_percentage: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub job_id: String,
    pub meeting_id: String,
    pub title: String,
    pub segments_count: usize,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportError {
    pub job_id: Option<String>,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportStarted {
    pub job_id: String,
    pub message: String,
}

fn try_acquire_import_slot() -> Result<(), String> {
    loop {
        let current = ACTIVE_IMPORTS.load(Ordering::SeqCst);
        if current >= MAX_CONCURRENT_IMPORTS {
            return Err(format!(
                "Maximum of {} concurrent imports already running",
                MAX_CONCURRENT_IMPORTS
            ));
        }
        if ACTIVE_IMPORTS
            .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            return Ok(());
        }
    }
}

fn release_import_slot() {
    ACTIVE_IMPORTS.fetch_sub(1, Ordering::SeqCst);
}

fn mark_cancelled(job_id: &str) {
    if let Ok(mut set) = CANCELLED_JOBS.lock() {
        set.insert(job_id.to_string());
    }
}

fn is_cancelled(job_id: &str) -> bool {
    CANCELLED_JOBS
        .lock()
        .map(|set| set.contains(job_id))
        .unwrap_or(false)
}

fn clear_cancelled(job_id: &str) {
    if let Ok(mut set) = CANCELLED_JOBS.lock() {
        set.remove(job_id);
    }
}

pub fn is_import_in_progress() -> bool {
    ACTIVE_IMPORTS.load(Ordering::SeqCst) > 0
}

pub fn active_import_count() -> usize {
    ACTIVE_IMPORTS.load(Ordering::SeqCst)
}

pub fn cancel_import(job_id: Option<&str>) {
    if let Some(id) = job_id {
        mark_cancelled(id);
        return;
    }
    // No job_id: cancel all tracked jobs is not available without list; no-op global flag removed
}

pub fn validate_audio_file(path: &Path) -> Result<AudioFileInfo> {
    if !path.exists() {
        return Err(anyhow!("File does not exist: {}", path.display()));
    }

    let metadata = std::fs::metadata(path)?;
    if metadata.len() == 0 {
        return Err(anyhow!("File is empty"));
    }
    if metadata.len() > MAX_FILE_SIZE_BYTES {
        return Err(anyhow!("File too large: maximum supported size is 20GB"));
    }

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_lowercase)
        .ok_or_else(|| anyhow!("File has no extension"))?;

    if !AUDIO_EXTENSIONS.contains(&extension.as_str()) {
        return Err(anyhow!("Unsupported audio format: {}", extension));
    }

    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow!("Invalid file name"))?
        .to_string();

    Ok(AudioFileInfo {
        path: path.to_string_lossy().to_string(),
        filename,
        duration_seconds: 0.0,
        size_bytes: metadata.len(),
        format: extension,
    })
}

fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    job_id: &str,
    stage: &str,
    progress: u32,
    message: &str,
) {
    let _ = app.emit(
        "import-progress",
        ImportProgress {
            job_id: job_id.to_string(),
            stage: stage.to_string(),
            progress_percentage: progress,
            message: message.to_string(),
        },
    );
}

#[tauri::command]
pub async fn select_and_validate_audio_command<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<AudioFileInfo>, String> {
    let app_clone = app.clone();
    let file_path = tokio::task::spawn_blocking(move || {
        app_clone
            .dialog()
            .file()
            .add_filter(
                "Audio Files",
                &AUDIO_EXTENSIONS.iter().map(|s| *s).collect::<Vec<_>>(),
            )
            .blocking_pick_file()
    })
    .await
    .map_err(|e| format!("File dialog task failed: {}", e))?;

    match file_path {
        Some(path) => validate_audio_file(Path::new(&path.to_string()))
            .map(Some)
            .map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn validate_audio_file_command(path: String) -> Result<AudioFileInfo, String> {
    validate_audio_file(Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_import_audio_command<R: Runtime>(
    app: AppHandle<R>,
    source_path: String,
    title: String,
    _language: Option<String>,
    _model: Option<String>,
    _provider: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<ImportStarted, String> {
    try_acquire_import_slot()?;

    let source = PathBuf::from(&source_path);
    if let Err(e) = validate_audio_file(&source) {
        release_import_slot();
        return Err(e.to_string());
    }

    let response = {
        let client = state.api_client.read().await;
        match client.import_audio(&source, Some(title.clone())).await {
            Ok(r) => r,
            Err(e) => {
                release_import_slot();
                return Err(format!("Failed to start import: {}", e));
            }
        }
    };

    let api_client = state.api_client.clone();
    let job_id = response.job_id.clone();
    clear_cancelled(&job_id);

    let job_id_for_spawn = job_id.clone();
    tauri::async_runtime::spawn(async move {
        let result =
            poll_import_job(app.clone(), api_client, job_id_for_spawn.clone(), title).await;
        release_import_slot();
        clear_cancelled(&job_id_for_spawn);

        match result {
            Ok(result) => {
                let _ = app.emit(
                    "import-complete",
                    serde_json::json!({
                        "job_id": result.job_id,
                        "meeting_id": result.meeting_id,
                        "title": result.title,
                        "segments_count": result.segments_count,
                        "duration_seconds": result.duration_seconds
                    }),
                );
            }
            Err(e) => {
                error!("Import failed: {}", e);
                let _ = app.emit(
                    "import-error",
                    ImportError {
                        job_id: Some(job_id_for_spawn),
                        error: e.to_string(),
                    },
                );
            }
        }
    });

    info!("Started import job {}", job_id);
    Ok(ImportStarted {
        job_id,
        message: "Import started".to_string(),
    })
}

async fn poll_import_job<R: Runtime>(
    app: AppHandle<R>,
    api_client: Arc<RwLock<ApiClient>>,
    job_id: String,
    title: String,
) -> Result<ImportResult> {
    loop {
        if is_cancelled(&job_id) {
            let client = api_client.read().await;
            let _ = client.cancel_job(&job_id).await;
            return Err(anyhow!("Import cancelled"));
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        let status = {
            let client = api_client.read().await;
            client.get_job_status(&job_id).await?
        };

        let latest_progress = status.progress.last();
        let progress = latest_progress
            .and_then(|event| event.percent)
            .map(|percent| percent.clamp(0.0, 100.0) as u32)
            .unwrap_or(match status.state {
                JobState::Pending => 10,
                JobState::Processing => 50,
                JobState::Completed => 100,
                JobState::Failed | JobState::Cancelled => 0,
            });
        let stage = latest_progress
            .map(|event| event.stage.as_str())
            .unwrap_or(match status.state {
                JobState::Pending => "queued",
                JobState::Processing => "transcribing",
                JobState::Completed => "complete",
                JobState::Failed => "failed",
                JobState::Cancelled => "cancelled",
            });
        let message = latest_progress
            .map(|event| event.message.as_str())
            .unwrap_or("Import in progress...");
        emit_progress(&app, &job_id, stage, progress, message);

        match status.state {
            JobState::Completed => {
                let meeting_id = status
                    .meeting_id
                    .ok_or_else(|| anyhow!("Import completed without meeting id"))?;
                let transcript_response = {
                    let client = api_client.read().await;
                    client.get_transcript(&meeting_id, None, None).await?
                };
                let transcript = transcript_response.transcript;
                let segments_count = transcript
                    .as_ref()
                    .map(|transcript| transcript.segments.len())
                    .unwrap_or(0);
                let duration_seconds = transcript
                    .as_ref()
                    .and_then(|transcript| transcript.duration)
                    .unwrap_or(0.0);

                return Ok(ImportResult {
                    job_id,
                    meeting_id,
                    title,
                    segments_count,
                    duration_seconds,
                });
            }
            JobState::Failed => {
                return Err(anyhow!(
                    status
                        .error
                        .unwrap_or_else(|| "Import failed".to_string())
                ));
            }
            JobState::Cancelled => return Err(anyhow!("Import cancelled")),
            JobState::Pending | JobState::Processing => {}
        }
    }
}

#[tauri::command]
pub async fn cancel_import_command(job_id: Option<String>) -> Result<(), String> {
    if let Some(id) = job_id {
        if !is_import_in_progress() && !is_cancelled(&id) {
            // Still allow marking cancel if race with start
        }
        mark_cancelled(&id);
        return Ok(());
    }

    if !is_import_in_progress() {
        return Err("No import in progress".to_string());
    }
    // Without job_id, cannot cancel specific job; keep backward-compat error
    Err("job_id required to cancel an import".to_string())
}

#[tauri::command]
pub async fn is_import_in_progress_command() -> bool {
    is_import_in_progress()
}

#[tauri::command]
pub async fn active_import_count_command() -> usize {
    active_import_count()
}
