use log::{error, info};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

use super::manager::DatabaseManager;
use crate::database::repositories::setting::SettingsRepository;
use crate::summary::CustomOpenAIConfig;

#[derive(Serialize)]
pub struct DatabaseCheckResult {
    pub exists: bool,
    pub size: u64,
}

/// Check if this is the first launch (no database exists yet)
#[tauri::command]
pub async fn check_first_launch(app: AppHandle) -> Result<bool, String> {
    DatabaseManager::is_first_launch(&app)
        .await
        .map_err(|e| format!("Failed to check first launch: {}", e))
}

/// Open a dialog to select a folder or file for legacy database import
#[tauri::command]
pub async fn select_legacy_database_path(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    info!("Opening dialog to select legacy database location");

    let file_path = app
        .dialog()
        .file()
        .add_filter("Database Files", &["db"])
        .blocking_pick_file();

    if let Some(path) = file_path {
        let path_str = path.to_string();
        info!("User selected path: {}", path_str);
        Ok(Some(path_str))
    } else {
        info!("User cancelled file selection");
        Ok(None)
    }
}

/// Detect legacy database from a selected path (root repo, backend folder, or db file)
#[tauri::command]
pub async fn detect_legacy_database(selected_path: String) -> Result<Option<String>, String> {
    let path = PathBuf::from(&selected_path);

    info!("Detecting legacy database from path: {}", selected_path);

    // Case 1: User selected the .db file directly
    if path.is_file() {
        if let Some(extension) = path.extension() {
            if extension == "db" {
                info!("Direct .db file selected: {}", selected_path);
                return Ok(Some(selected_path));
            }
        }
    }

    // Case 2: User selected directory containing meeting_minutes.db
    if path.is_dir() {
        let direct_db = path.join("meeting_minutes.db");
        if direct_db.exists() && direct_db.is_file() {
            let db_path = direct_db.to_string_lossy().to_string();
            info!("Found database in selected directory: {}", db_path);
            return Ok(Some(db_path));
        }

        // Case 3: User selected root repo (check backend subdirectory)
        let backend_db = path.join("backend").join("meeting_minutes.db");
        if backend_db.exists() && backend_db.is_file() {
            let db_path = backend_db.to_string_lossy().to_string();
            info!("Found database in backend subdirectory: {}", db_path);
            return Ok(Some(db_path));
        }
    }

    info!("No legacy database found at path: {}", selected_path);
    Ok(None)
}

/// Check for legacy database in the default app data directory
#[tauri::command]
pub async fn check_default_legacy_database(app: AppHandle) -> Result<Option<String>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let legacy_db = app_data_dir.join("meeting_minutes.db");
    info!("Checking for default legacy database at: {:?}", legacy_db);

    if legacy_db.exists() && legacy_db.is_file() {
        let path_str = legacy_db.to_string_lossy().to_string();
        info!("Found default legacy database: {}", path_str);
        Ok(Some(path_str))
    } else {
        info!("No default legacy database found");
        Ok(None)
    }
}

/// Check if the Homebrew database exists and return its size
/// This is specifically for detecting old Python backend installations
#[tauri::command]
pub async fn check_homebrew_database(path: String) -> Result<Option<DatabaseCheckResult>, String> {
    let db_path = PathBuf::from(&path);
    
    info!("Checking for Homebrew database at: {}", path);
    
    // Check if file exists and is a regular file
    if db_path.exists() && db_path.is_file() {
        // Get file metadata to check size
        match std::fs::metadata(&db_path) {
            Ok(metadata) => {
                let size = metadata.len();
                info!("Found Homebrew database: {} ({} bytes)", path, size);
                
                // Only consider it valid if it has content (not empty)
                if size > 0 {
                    Ok(Some(DatabaseCheckResult {
                        exists: true,
                        size,
                    }))
                } else {
                    info!("Database file exists but is empty");
                    Ok(None)
                }
            }
            Err(e) => {
                error!("Failed to read database metadata: {}", e);
                Ok(None)
            }
        }
    } else {
        info!("No database found at Homebrew location");
        Ok(None)
    }
}

/// Import legacy database and initialize the database manager
#[tauri::command]
pub async fn import_and_initialize_database(
    app: AppHandle,
    legacy_db_path: String,
) -> Result<(), String> {
    info!(
        "Starting import of legacy database from: {}",
        legacy_db_path
    );

    // Import and get initialized manager
    let db_manager = DatabaseManager::import_legacy_database(&app, &legacy_db_path)
        .await
        .map_err(|e| {
            error!("Failed to import legacy database: {}", e);
            format!("Failed to import database: {}", e)
        })?;

    // Initialize API client components
    let (api_client, memory_cache, upload_queue, upload_worker) =
        crate::api_client::setup::initialize_api_client(db_manager.pool())
            .await
            .map_err(|e| format!("Failed to initialize API client: {}", e))?;

    // Update app state with the new manager and API client
    let app_state = crate::state::AppState {
        db_manager,
        api_client,
        memory_cache,
        upload_queue,
        upload_worker,
    };
    app.manage(app_state.clone());
    app.manage(app_state.api_client.clone());
    app.manage(app_state.db_manager.pool().clone());
    app.manage(app_state.memory_cache.clone());
    app.manage(app_state.upload_queue.clone());
    app.manage(app_state.upload_worker.clone());

    info!("Legacy database imported and initialized successfully");

    // Emit event to notify frontend that database is ready
    app.emit("database-initialized", ())
        .map_err(|e| format!("Failed to emit database-initialized event: {}", e))?;

    Ok(())
}

/// Initialize a fresh database (for users who don't want to import)
#[tauri::command]
pub async fn initialize_fresh_database(app: AppHandle) -> Result<(), String> {
    info!("Initializing fresh database");

    let db_manager = DatabaseManager::new_from_app_handle(&app)
        .await
        .map_err(|e| {
            error!("Failed to initialize fresh database: {}", e);
            format!("Failed to initialize database: {}", e)
        })?;

    // Initialize API client components
    let (api_client, memory_cache, upload_queue, upload_worker) =
        crate::api_client::setup::initialize_api_client(db_manager.pool())
            .await
            .map_err(|e| format!("Failed to initialize API client: {}", e))?;

    // Update app state with the new manager and API client
    let app_state = crate::state::AppState {
        db_manager: db_manager.clone(),
        api_client,
        memory_cache,
        upload_queue,
        upload_worker,
    };
    app.manage(app_state.clone());
    app.manage(app_state.api_client.clone());
    app.manage(app_state.db_manager.pool().clone());
    app.manage(app_state.memory_cache.clone());
    app.manage(app_state.upload_queue.clone());
    app.manage(app_state.upload_worker.clone());

    // Set default model configuration for fresh installs
    let pool = db_manager.pool();
    
    // Default transcription model mirrors ai-meeting-agent defaults.
    if let Err(e) = crate::database::repositories::setting::SettingsRepository::save_transcript_config(
        pool,
        crate::config::DEFAULT_TRANSCRIPTION_PROVIDER,
        crate::config::DEFAULT_TRANSCRIPTION_MODEL,
    ).await {
        error!("Failed to set default transcription model config: {}", e);
    }

    info!("Fresh database initialized successfully with default models");

    // Emit event to notify frontend that database is ready
    app.emit("database-initialized", ())
        .map_err(|e| format!("Failed to emit database-initialized event: {}", e))?;

    Ok(())
}

/// Get the database directory path
#[tauri::command]
pub async fn get_database_directory(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    Ok(app_data_dir.to_string_lossy().to_string())
}

/// Open the database folder in the system file explorer
#[tauri::command]
pub async fn open_database_folder(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Ensure directory exists before trying to open it
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let folder_path = app_data_dir.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    info!("Opened database folder: {}", folder_path);
    Ok(())
}

#[tauri::command]
pub async fn api_get_model_config(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<serde_json::Value, String> {
    let setting = SettingsRepository::get_model_config(&pool)
        .await
        .map_err(|e| format!("Failed to load model config: {}", e))?;

    Ok(match setting {
        Some(setting) => serde_json::to_value(setting).map_err(|e| e.to_string())?,
        None => serde_json::json!({
            "provider": "openai",
            "model": "gpt-4o-2024-11-20",
            "whisperModel": crate::config::DEFAULT_TRANSCRIPTION_MODEL,
            "apiKey": null,
            "ollamaEndpoint": null
        }),
    })
}

#[tauri::command]
pub async fn api_save_model_config(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    provider: String,
    model: String,
    whisper_model: String,
    api_key: Option<String>,
    ollama_endpoint: Option<String>,
) -> Result<(), String> {
    SettingsRepository::save_model_config(
        &pool,
        &provider,
        &model,
        &whisper_model,
        ollama_endpoint.as_deref(),
    )
    .await
    .map_err(|e| format!("Failed to save model config: {}", e))?;

    if let Some(api_key) = api_key.filter(|key| !key.is_empty()) {
        SettingsRepository::save_api_key(&pool, &provider, &api_key)
            .await
            .map_err(|e| format!("Failed to save API key: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn api_get_api_key(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    provider: String,
) -> Result<Option<String>, String> {
    SettingsRepository::get_api_key(&pool, &provider)
        .await
        .map_err(|e| format!("Failed to load API key: {}", e))
}

#[tauri::command]
pub async fn api_get_transcript_config(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<serde_json::Value, String> {
    let setting = SettingsRepository::get_transcript_config(&pool)
        .await
        .map_err(|e| format!("Failed to load transcript config: {}", e))?;

    Ok(match setting {
        Some(setting) => serde_json::to_value(setting).map_err(|e| e.to_string())?,
        None => serde_json::json!({
            "provider": crate::config::DEFAULT_TRANSCRIPTION_PROVIDER,
            "model": crate::config::DEFAULT_TRANSCRIPTION_MODEL,
            "apiKey": null
        }),
    })
}

#[tauri::command]
pub async fn api_save_transcript_config(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    provider: String,
    model: String,
    api_key: Option<String>,
) -> Result<(), String> {
    SettingsRepository::save_transcript_config(&pool, &provider, &model)
        .await
        .map_err(|e| format!("Failed to save transcript config: {}", e))?;

    if let Some(api_key) = api_key.filter(|key| !key.is_empty()) {
        SettingsRepository::save_transcript_api_key(&pool, &provider, &api_key)
            .await
            .map_err(|e| format!("Failed to save transcript API key: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn api_get_custom_openai_config(
    pool: tauri::State<'_, sqlx::SqlitePool>,
) -> Result<Option<CustomOpenAIConfig>, String> {
    SettingsRepository::get_custom_openai_config(&pool)
        .await
        .map_err(|e| format!("Failed to load custom OpenAI config: {}", e))
}

#[tauri::command]
pub async fn api_save_custom_openai_config(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    endpoint: String,
    api_key: Option<String>,
    model: String,
    max_tokens: Option<i32>,
    temperature: Option<f32>,
    top_p: Option<f32>,
) -> Result<serde_json::Value, String> {
    let config = CustomOpenAIConfig { endpoint, api_key, model, max_tokens, temperature, top_p };
    SettingsRepository::save_custom_openai_config(&pool, &config)
        .await
        .map_err(|e| format!("Failed to save custom OpenAI config: {}", e))?;

    Ok(serde_json::json!({ "status": "success", "message": "Custom OpenAI config saved" }))
}

#[tauri::command]
pub async fn api_get_auto_generate_setting() -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
pub async fn api_test_custom_openai_connection() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "status": "success", "message": "Connection test delegated to API server" }))
}
