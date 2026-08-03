//! Tauri commands for the Google Calendar/Gmail "send minutes" feature.

use super::auth;
use super::calendar::{self, CalendarEventMatch};
use super::config::GoogleConfig;
use super::gmail;
use crate::state::AppState;
use log::{error as log_error, info as log_info};
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

#[derive(Debug, Serialize)]
pub struct GoogleStatusResponse {
    /// OAuth client credentials saved.
    pub configured: bool,
    /// Refresh token present in keychain.
    pub connected: bool,
    /// Signed-in account email, if known.
    pub email: Option<String>,
    /// Client id echoed back so the settings form can prefill it.
    pub client_id: Option<String>,
}

#[tauri::command]
pub async fn get_google_status(
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<GoogleStatusResponse>, String> {
    let config = match GoogleConfig::load_from_db(&pool).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(CommandResult::error(format!(
                "Failed to load Google config: {e}"
            )))
        }
    };
    Ok(CommandResult::success(GoogleStatusResponse {
        configured: config.is_complete(),
        connected: auth::is_connected(),
        email: auth::stored_account_email(),
        client_id: config.client_id,
    }))
}

#[tauri::command]
pub async fn set_google_config(
    client_id: Option<String>,
    client_secret: Option<String>,
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<GoogleStatusResponse>, String> {
    let config = GoogleConfig::new(client_id, client_secret);
    if let Err(e) = config.save_to_db(&pool).await {
        return Ok(CommandResult::error(format!(
            "Failed to save Google config: {e}"
        )));
    }
    Ok(CommandResult::success(GoogleStatusResponse {
        configured: config.is_complete(),
        connected: auth::is_connected(),
        email: auth::stored_account_email(),
        client_id: config.client_id,
    }))
}

/// Runs the interactive OAuth flow. Blocks until the user finishes signing
/// in (or times out). Opens the system browser.
#[tauri::command]
pub async fn google_connect(
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<GoogleStatusResponse>, String> {
    let config = match GoogleConfig::load_from_db(&pool).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(CommandResult::error(format!(
                "Failed to load Google config: {e}"
            )))
        }
    };
    if !config.is_complete() {
        return Ok(CommandResult::error(
            "Save your Google OAuth client ID and secret first".to_string(),
        ));
    }

    match auth::connect(
        config.client_id.as_deref().unwrap_or_default(),
        config.client_secret.as_deref().unwrap_or_default(),
    )
    .await
    {
        Ok(email) => {
            log_info!("google oauth: connected as {}", email);
            Ok(CommandResult::success(GoogleStatusResponse {
                configured: true,
                connected: true,
                email: if email.is_empty() { None } else { Some(email) },
                client_id: config.client_id,
            }))
        }
        Err(e) => {
            log_error!("google oauth: connect failed: {}", e);
            Ok(CommandResult::error(e))
        }
    }
}

#[tauri::command]
pub async fn google_disconnect(
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<GoogleStatusResponse>, String> {
    let _ = auth::disconnect();
    let config = GoogleConfig::load_from_db(&pool).await.unwrap_or_default();
    Ok(CommandResult::success(GoogleStatusResponse {
        configured: config.is_complete(),
        connected: false,
        email: None,
        client_id: config.client_id,
    }))
}

#[derive(Debug, Serialize)]
pub struct FindEventResponse {
    pub event: Option<CalendarEventMatch>,
    pub self_email: Option<String>,
}

/// Finds the calendar event matching a meeting's time window and returns
/// its attendee list.
#[tauri::command]
pub async fn google_find_event(
    meeting_id: String,
    state: State<'_, AppState>,
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<FindEventResponse>, String> {
    let result = async {
        let config = GoogleConfig::load_from_db(&pool)
            .await
            .map_err(|e| format!("Failed to load Google config: {e}"))?;
        if !config.is_complete() {
            return Err("Google OAuth client not configured".to_string());
        }
        let token = auth::get_access_token(
            config.client_id.as_deref().unwrap_or_default(),
            config.client_secret.as_deref().unwrap_or_default(),
        )
        .await?;

        let meeting = {
            let client = state.api_client.read().await;
            client
                .get_meeting(&meeting_id)
                .await
                .map_err(|e| format!("Failed to load meeting: {e}"))?
        };

        let self_email = auth::stored_account_email();
        let event = calendar::find_event_for_meeting(
            &token,
            meeting.date,
            meeting.duration_seconds,
            self_email.as_deref(),
        )
        .await?;

        Ok::<_, String>((event, self_email))
    }
    .await;

    match result {
        Ok((event, self_email)) => Ok(CommandResult::success(FindEventResponse {
            event,
            self_email,
        })),
        Err(e) => Ok(CommandResult::error(e)),
    }
}

#[derive(Debug, Serialize)]
pub struct SendMinutesResponse {
    pub message_id: String,
    pub recipients: Vec<String>,
}

/// Sends the minutes markdown as a `.md` attachment to the given recipients.
#[tauri::command]
pub async fn google_send_minutes(
    meeting_id: String,
    recipients: Vec<String>,
    subject: String,
    markdown: String,
    state: State<'_, AppState>,
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<SendMinutesResponse>, String> {
    let result = async {
        let recipients: Vec<String> = recipients
            .into_iter()
            .map(|r| r.trim().to_string())
            .filter(|r| !r.is_empty())
            .collect();
        if recipients.is_empty() {
            return Err("No recipients selected".to_string());
        }
        if markdown.trim().is_empty() {
            return Err("Minutes content is empty".to_string());
        }

        let config = GoogleConfig::load_from_db(&pool)
            .await
            .map_err(|e| format!("Failed to load Google config: {e}"))?;
        if !config.is_complete() {
            return Err("Google OAuth client not configured".to_string());
        }
        let token = auth::get_access_token(
            config.client_id.as_deref().unwrap_or_default(),
            config.client_secret.as_deref().unwrap_or_default(),
        )
        .await?;

        let meeting_title = {
            let client = state.api_client.read().await;
            client
                .get_meeting(&meeting_id)
                .await
                .map(|m| m.title)
                .unwrap_or_else(|_| "meeting".to_string())
        };

        let safe_title: String = meeting_title
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let filename = format!("{} - minutes.md", safe_title.trim());

        let body = format!(
            "Hi,\n\nPlease find attached the meeting minutes for \"{meeting_title}\".\n\nSent from Meetily."
        );

        let message_id =
            gmail::send_minutes(&token, &recipients, &subject, &body, &filename, &markdown)
                .await?;

        Ok::<_, String>((message_id, recipients))
    }
    .await;

    match result {
        Ok((message_id, recipients)) => {
            log_info!(
                "google gmail: minutes for meeting {} sent to {} recipient(s)",
                meeting_id,
                recipients.len()
            );
            Ok(CommandResult::success(SendMinutesResponse {
                message_id,
                recipients,
            }))
        }
        Err(e) => {
            log_error!(
                "google gmail: failed to send minutes for meeting {}: {}",
                meeting_id,
                e
            );
            Ok(CommandResult::error(e))
        }
    }
}
