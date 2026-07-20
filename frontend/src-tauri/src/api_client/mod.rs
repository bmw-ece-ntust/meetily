// API client module for ai-meeting-agent REST API
//
// Architecture:
// - client.rs: HTTP client with reqwest (auth headers, base_url config)
// - cache.rs: In-memory HashMap cache (meetings, transcripts, summaries)
// - config.rs: API configuration (base_url, api_key) stored in SQLite
// - types.rs: API request/response types matching API.md spec
// - jobs.rs: Job polling and SSE streaming helpers
// - queue.rs: Offline upload queue (SQLite-backed retry queue)
// - worker.rs: Background worker for processing upload queue
// - commands.rs: Tauri commands exposing API client to frontend
// - setup.rs: Initialization helper for API client components

pub mod cache;
pub mod client;
pub mod commands;
pub mod config;
pub mod jobs;
pub mod queue;
pub mod setup;
pub mod types;
pub mod worker;

pub use cache::MemoryCache;
pub use client::ApiClient;
pub use config::ApiConfig;
pub use types::*;
