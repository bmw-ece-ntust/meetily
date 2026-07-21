use super::client::{GithubClient, PublishResult};
use super::config::GithubExportConfig;
use super::permissions::{check_write_readiness, PermissionCheckResult};
use super::url_parse::parse_github_tree_url;
use crate::api_client::client::ApiClient;
use crate::api_client::types::{SummaryStatus, SummaryTemplate};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

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
pub struct GithubExportConfigResponse {
    pub github_token: Option<String>,
    pub repo_url: Option<String>,
    pub configured: bool,
}

#[tauri::command]
pub async fn get_github_export_config(
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<GithubExportConfigResponse>, String> {
    match GithubExportConfig::load_from_db(&pool).await {
        Ok(config) => Ok(CommandResult::success(GithubExportConfigResponse {
            configured: config.is_complete(),
            github_token: config.github_token,
            repo_url: config.repo_url,
        })),
        Err(e) => Ok(CommandResult::error(format!(
            "Failed to load GitHub export config: {e}"
        ))),
    }
}

#[tauri::command]
pub async fn set_github_export_config(
    github_token: Option<String>,
    repo_url: Option<String>,
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<GithubExportConfigResponse>, String> {
    let config = GithubExportConfig::new(github_token, repo_url);

    if let Some(url) = config.repo_url.as_deref() {
        if let Err(e) = parse_github_tree_url(url) {
            return Ok(CommandResult::error(e));
        }
    }

    if let Err(e) = config.save_to_db(&pool).await {
        return Ok(CommandResult::error(format!(
            "Failed to save GitHub export config: {e}"
        )));
    }

    Ok(CommandResult::success(GithubExportConfigResponse {
        configured: config.is_complete(),
        github_token: config.github_token,
        repo_url: config.repo_url,
    }))
}

#[tauri::command]
pub async fn test_github_export_permissions(
    github_token: Option<String>,
    repo_url: Option<String>,
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<CommandResult<PermissionCheckResult>, String> {
    let (token, url) = resolve_credentials(github_token, repo_url, &pool).await?;

    match check_write_readiness(&token, &url).await {
        Ok(result) => Ok(CommandResult::success(result)),
        Err(e) => Ok(CommandResult::error(e)),
    }
}

#[tauri::command]
pub async fn publish_meeting_to_github(
    meeting_id: String,
    pool: State<'_, sqlx::SqlitePool>,
    client: State<'_, Arc<RwLock<ApiClient>>>,
) -> Result<CommandResult<PublishResult>, String> {
    let config = match GithubExportConfig::load_from_db(&pool).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(CommandResult::error(format!(
                "Failed to load GitHub export config: {e}"
            )));
        }
    };

    if let Err(e) = config.validate_for_publish() {
        return Ok(CommandResult::error(e));
    }

    let token = config.github_token.clone().unwrap_or_default();
    let repo_url = config.repo_url.clone().unwrap_or_default();

    // Re-check write readiness before publishing
    match check_write_readiness(&token, &repo_url).await {
        Ok(result) if !result.ok => {
            return Ok(CommandResult::error(
                result
                    .error
                    .unwrap_or_else(|| "GitHub permission check failed".to_string()),
            ));
        }
        Err(e) => return Ok(CommandResult::error(e)),
        _ => {}
    }

    let parsed = match parse_github_tree_url(&repo_url) {
        Ok(p) => p,
        Err(e) => return Ok(CommandResult::error(e)),
    };

    let api = client.read().await;

    let meeting = match api.get_meeting(&meeting_id).await {
        Ok(m) => m,
        Err(e) => {
            return Ok(CommandResult::error(format!(
                "Failed to load meeting: {e}"
            )));
        }
    };

    let content = match load_publish_content(&api, &meeting_id).await {
        Ok(c) => c,
        Err(e) => return Ok(CommandResult::error(e)),
    };

    let date_str = meeting_date_filename(&meeting.date);
    let filename = format!("{date_str}-meeting-notes.md");
    let file_path = if parsed.dir_path.is_empty() {
        filename.clone()
    } else {
        format!("{}/{}", parsed.dir_path.trim_end_matches('/'), filename)
    };

    let gh = match GithubClient::new(&token) {
        Ok(c) => c,
        Err(e) => return Ok(CommandResult::error(e)),
    };

    let existing_sha = match gh.get_file_sha(&parsed, &file_path).await {
        Ok(s) => s,
        Err(e) => return Ok(CommandResult::error(e)),
    };

    let message = if existing_sha.is_some() {
        format!("docs: update meeting notes for {}", meeting.title)
    } else {
        format!("docs: add meeting notes for {}", meeting.title)
    };

    match gh
        .put_file(
            &parsed,
            &file_path,
            &content,
            &message,
            existing_sha.as_deref(),
        )
        .await
    {
        Ok(result) => Ok(CommandResult::success(result)),
        Err(e) => Ok(CommandResult::error(e)),
    }
}

async fn resolve_credentials(
    github_token: Option<String>,
    repo_url: Option<String>,
    pool: &sqlx::SqlitePool,
) -> Result<(String, String), String> {
    let saved = GithubExportConfig::load_from_db(pool)
        .await
        .map_err(|e| format!("Failed to load GitHub export config: {e}"))?;

    let token = github_token
        .and_then(|s| {
            let t = s.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        })
        .or(saved.github_token)
        .unwrap_or_default();

    let url = repo_url
        .and_then(|s| {
            let t = s.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        })
        .or(saved.repo_url)
        .unwrap_or_default();

    if token.is_empty() {
        return Err("GitHub token is required".to_string());
    }
    if url.is_empty() {
        return Err("Repository URL is required".to_string());
    }

    Ok((token, url))
}

async fn load_publish_content(api: &ApiClient, meeting_id: &str) -> Result<String, String> {
    // Prefer meeting_notes, then full, then any completed summary
    for template in [
        SummaryTemplate::MeetingNotes,
        SummaryTemplate::Full,
        SummaryTemplate::KeyPoints,
        SummaryTemplate::ActionItems,
        SummaryTemplate::Decisions,
    ] {
        if let Ok(summary) = api.get_summary(meeting_id, &template).await {
            if summary.status == SummaryStatus::Completed && !summary.content.trim().is_empty() {
                return Ok(summary.content);
            }
        }
    }

    // Fallback: list summaries
    if let Ok(list) = api.list_summaries(meeting_id).await {
        if let Some(summary) = list.summaries.iter().find(|s| {
            s.status == SummaryStatus::Completed && !s.content.trim().is_empty()
        }) {
            return Ok(summary.content.clone());
        }
    }

    Err(
        "No completed summary found. Generate a summary (prefer Meeting Notes template) first."
            .to_string(),
    )
}

fn meeting_date_filename(date: &DateTime<Utc>) -> String {
    date.format("%Y-%m-%d").to_string()
}
