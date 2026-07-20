// Audio import via ai-meeting-agent REST API.

use crate::api_client::client::ApiClient;
use crate::api_client::types::JobState;
use crate::state::AppState;
use anyhow::{anyhow, Result};
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::RwLock;

use super::constants::AUDIO_EXTENSIONS;

static IMPORT_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static IMPORT_CANCELLED: AtomicBool = AtomicBool::new(false);
const MAX_FILE_SIZE_BYTES: u64 = 20 * 1024 * 1024 * 1024;

struct ImportGuard;

impl ImportGuard {
    fn acquire() -> Result<Self, String> {
        if IMPORT_IN_PROGRESS
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("Import already in progress".to_string());
        }
        Ok(Self)
    }
}

impl Drop for ImportGuard {
    fn drop(&mut self) {
        IMPORT_IN_PROGRESS.store(false, Ordering::SeqCst);
    }
}

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
    pub stage: String,
    pub progress_percentage: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub meeting_id: String,
    pub title: String,
    pub segments_count: usize,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportError {
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportStarted {
    pub message: String,
}

pub fn is_import_in_progress() -> bool {
    IMPORT_IN_PROGRESS.load(Ordering::SeqCst)
}

pub fn cancel_import() {
    IMPORT_CANCELLED.store(true, Ordering::SeqCst);
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

fn emit_progress<R: Runtime>(app: &AppHandle<R>, stage: &str, progress: u32, message: &str) {
    let _ = app.emit(
        "import-progress",
        ImportProgress {
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
            .add_filter("Audio Files", &AUDIO_EXTENSIONS.iter().map(|s| *s).collect::<Vec<_>>())
            .blocking_pick_file()
    })
    .await
    .map_err(|e| format!("File dialog task failed: {}", e))?;

    match file_path {
        Some(path) => validate_audio_file(Path::new(&path.to_string())).map(Some).map_err(|e| e.to_string()),
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
    if IMPORT_IN_PROGRESS.load(Ordering::SeqCst) {
        return Err("Import already in progress".to_string());
    }

    let source = PathBuf::from(&source_path);
    validate_audio_file(&source).map_err(|e| e.to_string())?;

    let response = {
        let client = state.api_client.read().await;
        client
            .import_audio(&source, Some(title.clone()))
            .await
            .map_err(|e| format!("Failed to start import: {}", e))?
    };

    let api_client = state.api_client.clone();
    let job_id = response.job_id.clone();

    tauri::async_runtime::spawn(async move {
        let _guard = match ImportGuard::acquire() {
            Ok(guard) => guard,
            Err(e) => {
                error!("Import guard acquire failed: {}", e);
                return;
            }
        };
        IMPORT_CANCELLED.store(false, Ordering::SeqCst);

        let result = poll_import_job(app.clone(), api_client, job_id, title).await;
        match result {
            Ok(result) => {
                let _ = app.emit(
                    "import-complete",
                    serde_json::json!({
                        "meeting_id": result.meeting_id,
                        "title": result.title,
                        "segments_count": result.segments_count,
                        "duration_seconds": result.duration_seconds
                    }),
                );
            }
            Err(e) => {
                error!("Import failed: {}", e);
                let _ = app.emit("import-error", ImportError { error: e.to_string() });
            }
        }
    });

    info!("Started import job {}", response.job_id);
    Ok(ImportStarted {
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
        if IMPORT_CANCELLED.load(Ordering::SeqCst) {
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
        emit_progress(&app, stage, progress, message);

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
                    meeting_id,
                    title,
                    segments_count,
                    duration_seconds,
                });
            }
            JobState::Failed => {
                return Err(anyhow!(status.error.unwrap_or_else(|| "Import failed".to_string())));
            }
            JobState::Cancelled => return Err(anyhow!("Import cancelled")),
            JobState::Pending | JobState::Processing => {}
        }
    }
}

#[tauri::command]
pub async fn cancel_import_command() -> Result<(), String> {
    if !is_import_in_progress() {
        return Err("No import in progress".to_string());
    }
    cancel_import();
    Ok(())
}

#[tauri::command]
pub async fn is_import_in_progress_command() -> bool {
    is_import_in_progress()
}
