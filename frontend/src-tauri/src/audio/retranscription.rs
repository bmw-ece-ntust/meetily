// Retranscription via ai-meeting-agent REST API.

use crate::api_client::types::JobState;
use crate::api_client::client::ApiClient;
use crate::state::AppState;
use anyhow::{anyhow, Result};
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::RwLock;
use tauri::{AppHandle, Emitter, Runtime};

/// Global flag to track if retranscription is in progress.
static RETRANSCRIPTION_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Global flag to signal cancellation.
static RETRANSCRIPTION_CANCELLED: AtomicBool = AtomicBool::new(false);

struct RetranscriptionGuard;

impl RetranscriptionGuard {
    fn acquire() -> Result<Self, String> {
        if RETRANSCRIPTION_IN_PROGRESS
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("Retranscription already in progress".to_string());
        }
        Ok(Self)
    }
}

impl Drop for RetranscriptionGuard {
    fn drop(&mut self) {
        RETRANSCRIPTION_IN_PROGRESS.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetranscriptionProgress {
    pub meeting_id: String,
    pub stage: String,
    pub progress_percentage: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetranscriptionResult {
    pub meeting_id: String,
    pub segments_count: usize,
    pub duration_seconds: f64,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetranscriptionError {
    pub meeting_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetranscriptionStarted {
    pub meeting_id: String,
    pub job_id: String,
    pub message: String,
}

pub fn is_retranscription_in_progress() -> bool {
    RETRANSCRIPTION_IN_PROGRESS.load(Ordering::SeqCst)
}

pub fn cancel_retranscription() {
    RETRANSCRIPTION_CANCELLED.store(true, Ordering::SeqCst);
}

fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    meeting_id: &str,
    stage: &str,
    progress: u32,
    message: &str,
) {
    let _ = app.emit(
        "retranscription-progress",
        RetranscriptionProgress {
            meeting_id: meeting_id.to_string(),
            stage: stage.to_string(),
            progress_percentage: progress,
            message: message.to_string(),
        },
    );
}

#[tauri::command]
pub async fn start_retranscription_command<R: Runtime>(
    app: AppHandle<R>,
    meeting_id: String,
    _meeting_folder_path: String,
    _language: Option<String>,
    _model: Option<String>,
    _provider: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<RetranscriptionStarted, String> {
    if RETRANSCRIPTION_IN_PROGRESS.load(Ordering::SeqCst) {
        return Err("Retranscription already in progress".to_string());
    }

    let response = {
        let client = state.api_client.read().await;
        client
            .retranscribe_meeting(&meeting_id)
            .await
            .map_err(|e| format!("Failed to start retranscription: {}", e))?
    };

    let job_id = response.job_id.clone();
    let meeting_id_clone = meeting_id.clone();
    let api_client = state.api_client.clone();

    tauri::async_runtime::spawn(async move {
        let _guard = match RetranscriptionGuard::acquire() {
            Ok(guard) => guard,
            Err(e) => {
                error!("Retranscription guard acquire failed: {}", e);
                return;
            }
        };
        RETRANSCRIPTION_CANCELLED.store(false, Ordering::SeqCst);

        let result = poll_retranscription_job_with_state(
            app.clone(),
            meeting_id_clone.clone(),
            job_id,
            api_client,
        )
        .await;

        match result {
            Ok(res) => {
                let _ = app.emit(
                    "retranscription-complete",
                    serde_json::json!({
                        "meeting_id": res.meeting_id,
                        "segments_count": res.segments_count,
                        "duration_seconds": res.duration_seconds,
                        "language": res.language
                    }),
                );
            }
            Err(e) => {
                error!("Retranscription failed: {}", e);
                let _ = app.emit(
                    "retranscription-error",
                    RetranscriptionError {
                        meeting_id: meeting_id_clone,
                        error: e.to_string(),
                    },
                );
            }
        }
    });

    info!("Started retranscription job {} for meeting {}", response.job_id, meeting_id);
    Ok(RetranscriptionStarted {
        meeting_id,
        job_id: response.job_id,
        message: "Retranscription started".to_string(),
    })
}

async fn poll_retranscription_job_with_state<R: Runtime>(
    app: AppHandle<R>,
    meeting_id: String,
    job_id: String,
    api_client: Arc<RwLock<ApiClient>>,
) -> Result<RetranscriptionResult> {
    loop {
        if RETRANSCRIPTION_CANCELLED.load(Ordering::SeqCst) {
            let client = api_client.read().await;
            let _ = client.cancel_job(&job_id).await;
            return Err(anyhow!("Retranscription cancelled"));
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
            .unwrap_or("Retranscription in progress...");

        emit_progress(&app, &meeting_id, stage, progress, message);

        match status.state {
            JobState::Completed => {
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
                let language = transcript.and_then(|transcript| transcript.language);

                return Ok(RetranscriptionResult {
                    meeting_id,
                    segments_count,
                    duration_seconds,
                    language,
                });
            }
            JobState::Failed => {
                return Err(anyhow!(
                    status.error.unwrap_or_else(|| "Retranscription failed".to_string())
                ));
            }
            JobState::Cancelled => return Err(anyhow!("Retranscription cancelled")),
            JobState::Pending | JobState::Processing => {}
        }
    }
}

#[tauri::command]
pub async fn cancel_retranscription_command() -> Result<(), String> {
    if !is_retranscription_in_progress() {
        return Err("No retranscription in progress".to_string());
    }
    cancel_retranscription();
    Ok(())
}

#[tauri::command]
pub async fn is_retranscription_in_progress_command() -> bool {
    is_retranscription_in_progress()
}
