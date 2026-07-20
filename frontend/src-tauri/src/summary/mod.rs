/// Summary module - simplified for backend API integration
///
/// This module now primarily handles:
/// - Tauri commands for frontend integration with backend API
/// - Language detection utilities
/// - Local metadata management for summary preferences
///
/// All summary generation is now handled by ai-meeting-agent REST API

use serde::{Deserialize, Serialize};

/// Custom OpenAI-compatible endpoint configuration
/// Stored as JSON in the database for potential future client-side usage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomOpenAIConfig {
    /// Base URL of the OpenAI-compatible API endpoint (e.g., "http://localhost:8000/v1")
    pub endpoint: String,
    /// API key for authentication (optional if server doesn't require it)
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    /// Model identifier to use (e.g., "gpt-4", "llama-3-70b", "mistral-7b")
    pub model: String,
    /// Maximum tokens for completion (optional)
    #[serde(rename = "maxTokens")]
    pub max_tokens: Option<i32>,
    /// Temperature parameter (0.0-2.0, optional)
    pub temperature: Option<f32>,
    /// Top-P sampling parameter (0.0-1.0, optional)
    #[serde(rename = "topP")]
    pub top_p: Option<f32>,
}

pub mod commands;
pub(crate) mod language_detection;
pub(crate) mod metadata;
pub mod processor;
pub mod service;

// Re-export Tauri commands (with their generated __cmd__ variants)
pub use commands::{
    __cmd__api_cancel_summary, __cmd__api_detect_transcript_summary_language,
    __cmd__api_get_summary, __cmd__api_process_transcript,
    __cmd__api_save_meeting_summary,
    __tauri_command_name_api_cancel_summary,
    __tauri_command_name_api_detect_transcript_summary_language,
    __tauri_command_name_api_get_summary, __tauri_command_name_api_process_transcript,
    __tauri_command_name_api_save_meeting_summary,
    api_cancel_summary,
    api_detect_transcript_summary_language,
    api_get_summary, api_process_transcript,
    api_save_meeting_summary,
};

// Re-export commonly used items
pub use processor::{
    extract_meeting_name_from_markdown, language_name_from_code, strip_thinking_tags,
};
pub use service::SummaryService;
