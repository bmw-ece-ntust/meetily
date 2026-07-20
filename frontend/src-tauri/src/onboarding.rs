use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;
use log::{info, warn, error};
use anyhow::Result;

use crate::state::AppState;
use crate::database::repositories::setting::SettingsRepository;


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OnboardingStatus {
    pub version: String,
    pub completed: bool,
    pub current_step: u8,
    pub api_config: ApiConfig,
    pub last_updated: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ApiConfig {
    pub configured: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_url: Option<String>,
}

impl Default for OnboardingStatus {
    fn default() -> Self {
        Self {
            version: "2.0".to_string(),
            completed: false,
            current_step: 1,
            api_config: ApiConfig {
                configured: false,
                api_url: None,
            },
            last_updated: chrono::Utc::now().to_rfc3339(),
        }
    }
}


/// Load onboarding status from store
pub async fn load_onboarding_status<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<OnboardingStatus> {
    // Try to load from Tauri store
    let store = match app.store("onboarding-status.json") {
        Ok(store) => store,
        Err(e) => {
            warn!("Failed to access onboarding store: {}, using defaults", e);
            return Ok(OnboardingStatus::default());
        }
    };

    // Try to get the status from store
    let status = if let Some(value) = store.get("status") {
        match serde_json::from_value::<OnboardingStatus>(value.clone()) {
            Ok(s) => {
                info!("Loaded onboarding status from store - Step: {}, Completed: {}",
                      s.current_step, s.completed);
                s
            }
            Err(e) => {
                warn!("Failed to deserialize onboarding status: {}, using defaults", e);
                OnboardingStatus::default()
            }
        }
    } else {
        info!("No stored onboarding status found, using defaults");
        OnboardingStatus::default()
    };

    Ok(status)
}

/// Save onboarding status to store
pub async fn save_onboarding_status<R: Runtime>(
    app: &AppHandle<R>,
    status: &OnboardingStatus,
) -> Result<()> {
    info!("Saving onboarding status: step={}, completed={}",
          status.current_step, status.completed);

    // Get or create store
    let store = app.store("onboarding-status.json")
        .map_err(|e| anyhow::anyhow!("Failed to access onboarding store: {}", e))?;

    // Update last_updated timestamp
    let mut status = status.clone();
    status.last_updated = chrono::Utc::now().to_rfc3339();

    // Serialize status to JSON value
    let status_value = serde_json::to_value(&status)
        .map_err(|e| anyhow::anyhow!("Failed to serialize onboarding status: {}", e))?;

    // Save to store
    store.set("status", status_value);

    // Persist to disk
    store.save()
        .map_err(|e| anyhow::anyhow!("Failed to save onboarding store to disk: {}", e))?;

    info!("Successfully persisted onboarding status to disk");
    Ok(())
}

/// Reset onboarding status (delete from store)
pub async fn reset_onboarding_status<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<()> {
    info!("Resetting onboarding status");

    let store = app.store("onboarding-status.json")
        .map_err(|e| anyhow::anyhow!("Failed to access onboarding store: {}", e))?;

    // Clear the status key
    store.delete("status");

    // Persist deletion to disk
    store.save()
        .map_err(|e| anyhow::anyhow!("Failed to save onboarding store after reset: {}", e))?;

    info!("Successfully reset onboarding status");
    Ok(())
}

/// Tauri commands for onboarding status
#[tauri::command]
pub async fn get_onboarding_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<OnboardingStatus>, String> {
    let status = load_onboarding_status(&app)
        .await
        .map_err(|e| format!("Failed to load onboarding status: {}", e))?;

    // Return None if it's the default (never saved before)
    // Check if we have any saved data by seeing if the store has the key
    let store = app.store("onboarding-status.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    if store.get("status").is_none() {
        Ok(None)
    } else {
        Ok(Some(status))
    }
}

#[tauri::command]
pub async fn save_onboarding_status_cmd<R: Runtime>(
    app: AppHandle<R>,
    status: OnboardingStatus,
) -> Result<(), String> {
    save_onboarding_status(&app, &status)
        .await
        .map_err(|e| format!("Failed to save onboarding status: {}", e))
}

#[tauri::command]
pub async fn reset_onboarding_status_cmd<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), String> {
    reset_onboarding_status(&app)
        .await
        .map_err(|e| format!("Failed to reset onboarding status: {}", e))
}

#[tauri::command]
pub async fn complete_onboarding<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    api_url: String,
    api_key: Option<String>,
) -> Result<(), String> {
    info!("Completing onboarding with API URL: {}", api_url);

    // Step 1: Save API configuration to SQLite database
    let pool = state.db_manager.pool();

    if let Err(e) = SettingsRepository::save_api_config(
        pool,
        &api_url,
        api_key.as_deref(),
    ).await {
        error!("Failed to save API config: {}", e);
        return Err(format!("Failed to save API config: {}", e));
    }
    info!("Saved API configuration: url={}", api_url);

    // Keep the in-memory API client in sync so meeting commands use the saved server immediately.
    let mut client = state.api_client.write().await;
    client
        .update_config(crate::api_client::config::ApiConfig::new(
            api_url.clone(),
            api_key.clone(),
        ))
        .map_err(|e| format!("Failed to update API client: {}", e))?;
    drop(client);

    // Step 2: Mark onboarding as complete
    let mut status = load_onboarding_status(&app)
        .await
        .map_err(|e| format!("Failed to load onboarding status: {}", e))?;

    status.completed = true;
    status.current_step = 3; // Max step (3 for macOS, 2 for others)
    status.api_config = ApiConfig {
        configured: true,
        api_url: Some(api_url.clone()),
    };

    save_onboarding_status(&app, &status)
        .await
        .map_err(|e| format!("Failed to save completed onboarding status: {}", e))?;

    info!("Onboarding completed successfully with API: {}", api_url);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn onboarding_status_v2_deserializes_correctly() {
        let status: OnboardingStatus = serde_json::from_str(
            r#"{
                "version": "2.0",
                "completed": true,
                "current_step": 3,
                "api_config": {
                    "configured": true,
                    "api_url": "http://127.0.0.1:8080"
                },
                "last_updated": "2026-07-20T00:00:00Z"
            }"#,
        )
        .expect("v2 onboarding status should deserialize");

        assert_eq!(status.version, "2.0");
        assert!(status.api_config.configured);
        assert_eq!(status.api_config.api_url, Some("http://127.0.0.1:8080".to_string()));
    }

    #[test]
    fn onboarding_status_v2_without_api_url() {
        let status: OnboardingStatus = serde_json::from_str(
            r#"{
                "version": "2.0",
                "completed": false,
                "current_step": 1,
                "api_config": {
                    "configured": false
                },
                "last_updated": "2026-07-20T00:00:00Z"
            }"#,
        )
        .expect("v2 onboarding status without api_url should deserialize");

        assert!(!status.api_config.configured);
        assert_eq!(status.api_config.api_url, None);
    }
}
