// Background worker for processing upload queue

use crate::api_client::client::ApiClient;
use crate::api_client::queue::UploadQueue;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::sleep;

/// Background worker that processes the upload queue
/// 
/// Features:
/// - Polls queue every 10 seconds
/// - Retries failed uploads (max 3 attempts)
/// - Skips missing files
/// - Logs errors for monitoring
pub struct UploadWorker {
    client: Arc<RwLock<ApiClient>>,
    queue: Arc<UploadQueue>,
    running: Arc<RwLock<bool>>,
    max_retries: i32,
}

impl UploadWorker {
    pub fn new(client: Arc<RwLock<ApiClient>>, queue: Arc<UploadQueue>) -> Self {
        Self {
            client,
            queue,
            running: Arc::new(RwLock::new(false)),
            max_retries: 3,
        }
    }

    /// Start the background worker
    pub async fn start(&self) {
        let mut running = self.running.write().await;
        if *running {
            log::warn!("Upload worker already running");
            return;
        }
        *running = true;
        drop(running);

        log::info!("Upload worker started");

        let client = self.client.clone();
        let queue = self.queue.clone();
        let running = self.running.clone();
        let max_retries = self.max_retries;

        tokio::spawn(async move {
            loop {
                // Check if worker should stop
                if !*running.read().await {
                    log::info!("Upload worker stopped");
                    break;
                }

                // Process queue
                if let Err(e) = Self::process_queue(&client, &queue, max_retries).await {
                    log::error!("Error processing upload queue: {}", e);
                }

                // Wait before next iteration
                sleep(Duration::from_secs(10)).await;
            }
        });
    }

    /// Stop the background worker
    pub async fn stop(&self) {
        let mut running = self.running.write().await;
        *running = false;
        log::info!("Upload worker stop requested");
    }

    /// Check if worker is running
    pub async fn is_running(&self) -> bool {
        *self.running.read().await
    }

    /// Process all pending uploads in the queue
    async fn process_queue(
        client: &Arc<RwLock<ApiClient>>,
        queue: &Arc<UploadQueue>,
        max_retries: i32,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let entries = queue.list_pending().await?;

        if entries.is_empty() {
            return Ok(());
        }

        log::info!("Processing {} pending uploads", entries.len());

        for entry in entries {
            // Skip if exceeded max retries
            if entry.retry_count >= max_retries {
                log::warn!(
                    "Upload {} exceeded max retries ({}), removing from queue",
                    entry.id,
                    max_retries
                );
                queue.remove(entry.id).await?;
                continue;
            }

            // Skip if file no longer exists
            if !entry.file_path.exists() {
                log::warn!(
                    "Upload {} file no longer exists: {:?}, removing from queue",
                    entry.id,
                    entry.file_path
                );
                queue.remove(entry.id).await?;
                continue;
            }

            // Attempt upload
            log::info!(
                "Attempting upload {} (retry {}): {:?}",
                entry.id,
                entry.retry_count,
                entry.file_path
            );

            let client = client.read().await;
            match client
                .import_audio(&entry.file_path, entry.title.clone())
                .await
            {
                Ok(response) => {
                    log::info!(
                        "Upload {} succeeded, job_id: {}",
                        entry.id,
                        response.job_id
                    );
                    queue.mark_success(entry.id).await?;
                }
                Err(e) => {
                    log::error!("Upload {} failed: {}", entry.id, e);
                    queue.mark_failure(entry.id, &e.to_string()).await?;
                }
            }
        }

        Ok(())
    }
}
