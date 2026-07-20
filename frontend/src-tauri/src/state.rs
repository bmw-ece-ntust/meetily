use crate::api_client::{ApiClient, MemoryCache};
use crate::api_client::queue::UploadQueue;
use crate::api_client::worker::UploadWorker;
use crate::database::manager::DatabaseManager;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AppState {
    pub db_manager: DatabaseManager,
    pub api_client: Arc<RwLock<ApiClient>>,
    pub memory_cache: Arc<MemoryCache>,
    pub upload_queue: Arc<UploadQueue>,
    pub upload_worker: Arc<UploadWorker>,
}
