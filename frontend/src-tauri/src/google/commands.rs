//! Tauri commands for the Google Calendar/Gmail feature.
//!
//! Thin proxies: the server (ai-meeting-agent) owns all Google OAuth
//! credentials and tokens. The desktop holds nothing.

use crate::api_client::types::{
    GoogleConnectResponse, GoogleMeetingEventResponse, GoogleSendMinutesResponse,
    GoogleStatusResponse,
};
use crate::state::AppState;
use log::error as log_error;
use serde::Serialize;
use tauri::State;

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

async fn proxy<T, F>(call: F) -> Result<CommandResult<T>, String>
where
    F: std::future::Future<Output = Result<T, crate::api_client::types::ApiError>>,
{
    match call.await {
        Ok(v) => Ok(CommandResult::success(v)),
        Err(e) => {
            log_error!("google proxy call failed: {}", e);
            Ok(CommandResult::error(format!("{e}")))
        }
    }
}

#[tauri::command]
pub async fn get_google_status(
    state: State<'_, AppState>,
) -> Result<CommandResult<GoogleStatusResponse>, String> {
    let client = state.api_client.read().await.clone();
    proxy(async move { client.google_status().await }).await
}

/// Returns the Google consent URL; the frontend opens it in the browser.
/// The OAuth flow completes entirely server-side.
#[tauri::command]
pub async fn google_connect_url(
    state: State<'_, AppState>,
) -> Result<CommandResult<GoogleConnectResponse>, String> {
    let client = state.api_client.read().await.clone();
    proxy(async move { client.google_connect_url().await }).await
}

#[tauri::command]
pub async fn google_set_auto_join(
    email: String,
    auto_join: bool,
    state: State<'_, AppState>,
) -> Result<CommandResult<serde_json::Value>, String> {
    let client = state.api_client.read().await.clone();
    proxy(async move { client.google_set_auto_join(&email, auto_join).await }).await
}

#[tauri::command]
pub async fn google_disconnect_account(
    email: String,
    state: State<'_, AppState>,
) -> Result<CommandResult<serde_json::Value>, String> {
    let client = state.api_client.read().await.clone();
    proxy(async move { client.google_disconnect_account(&email).await }).await
}

/// Resolve the calendar event for a meeting (linked or found by time window).
#[tauri::command]
pub async fn google_find_event(
    meeting_id: String,
    state: State<'_, AppState>,
) -> Result<CommandResult<GoogleMeetingEventResponse>, String> {
    let client = state.api_client.read().await.clone();
    proxy(async move { client.google_meeting_event(&meeting_id).await }).await
}

/// Manual minutes send with explicit recipients. Server owns content + Gmail.
#[tauri::command]
pub async fn google_send_minutes(
    meeting_id: String,
    recipients: Vec<String>,
    subject: Option<String>,
    state: State<'_, AppState>,
) -> Result<CommandResult<GoogleSendMinutesResponse>, String> {
    let client = state.api_client.read().await.clone();
    proxy(async move {
        client
            .google_send_minutes(&meeting_id, recipients, subject)
            .await
    })
    .await
}
