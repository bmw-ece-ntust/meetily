use log::info;
use tauri::{AppHandle, Emitter, Manager};

use super::manager::DatabaseManager;
use crate::api_client::setup::initialize_api_client;
use crate::state::AppState;

/// Initialize database on app startup
/// Handles first launch detection and conditional initialization
pub async fn initialize_database_on_startup(app: &AppHandle) -> Result<(), String> {
    // Check if this is the first launch (no database exists yet)
    let is_first_launch = DatabaseManager::is_first_launch(app)
        .await
        .map_err(|e| format!("Failed to check first launch status: {}", e))?;

    // Always initialize database and API client, even on first launch
    // This ensures all Tauri commands work during onboarding (e.g., test_api_connection)
    let db_manager = DatabaseManager::new_from_app_handle(app)
        .await
        .map_err(|e| format!("Failed to initialize database manager: {}", e))?;

    // Initialize API client components with default config from database
    let (api_client, memory_cache, upload_queue, upload_worker) =
        initialize_api_client(db_manager.pool())
            .await
            .map_err(|e| format!("Failed to initialize API client: {}", e))?;

    let app_state = AppState {
        db_manager,
        api_client,
        memory_cache,
        upload_queue,
        upload_worker,
    };

    // Manage AppState
    app.manage(app_state.clone());

    // Also manage individual components for commands that expect them directly
    app.manage(app_state.api_client.clone());
    app.manage(app_state.db_manager.pool().clone());
    app.manage(app_state.memory_cache.clone());
    app.manage(app_state.upload_queue.clone());
    app.manage(app_state.upload_worker.clone());

    if is_first_launch {
        info!("First launch detected - database initialized with defaults, emitting event");

        // Delay event emission to ensure window is ready and React listeners are registered
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            app_handle
                .emit("first-launch-detected", ())
                .expect("Failed to emit first-launch-detected event");
            info!("Emitted first-launch-detected after delay");
        });
    } else {
        info!("Database and API client initialized successfully");
    }

    Ok(())
}
