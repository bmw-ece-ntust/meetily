// Setup and initialization for API client components

use super::{ApiClient, MemoryCache};
use super::config::ApiConfig;
use super::queue::UploadQueue;
use super::worker::UploadWorker;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Initialize API client components from database
pub async fn initialize_api_client(
    pool: &sqlx::SqlitePool,
) -> Result<
    (
        Arc<RwLock<ApiClient>>,
        Arc<MemoryCache>,
        Arc<UploadQueue>,
        Arc<UploadWorker>,
    ),
    String,
> {
    // Load config from database
    let config = ApiConfig::load_from_db(pool)
        .await
        .map_err(|e| format!("Failed to load API config: {}", e))?;

    // Create API client
    let client = ApiClient::new(config)
        .map_err(|e| format!("Failed to create API client: {}", e))?;
    let client = Arc::new(RwLock::new(client));

    // Create memory cache
    let cache = Arc::new(MemoryCache::new());

    // Create upload queue
    let queue = Arc::new(UploadQueue::new(pool.clone()));

    // Create upload worker
    let worker = Arc::new(UploadWorker::new(client.clone(), queue.clone()));

    // Start worker automatically
    worker.start().await;
    log::info!("Upload worker started automatically");

    Ok((client, cache, queue, worker))
}
