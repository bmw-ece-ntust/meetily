// audio/transcription/engine.rs
//
// TranscriptionEngine enum and model initialization/validation logic.
// Cloud-first: local providers (Whisper, Parakeet) removed.

use super::provider::{TranscriptionError, TranscriptionProvider, TranscriptResult};
use log::{info, warn};
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};

// ============================================================================
// TRANSCRIPTION ENGINE ENUM
// ============================================================================

// Transcription engine abstraction for cloud providers
pub enum TranscriptionEngine {
    Provider(Arc<dyn TranscriptionProvider>),  // Trait-based cloud providers
}

impl TranscriptionEngine {
    /// Check if the engine has a model loaded
    pub async fn is_model_loaded(&self) -> bool {
        match self {
            Self::Provider(provider) => provider.is_model_loaded().await,
        }
    }

    /// Get the current model name
    pub async fn get_current_model(&self) -> Option<String> {
        match self {
            Self::Provider(provider) => provider.get_current_model().await,
        }
    }

    /// Get the provider name for logging
    pub fn provider_name(&self) -> &str {
        match self {
            Self::Provider(provider) => provider.provider_name(),
        }
    }

    /// Transcribe audio samples using the configured provider
    pub async fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
    ) -> Result<TranscriptResult, TranscriptionError> {
        match self {
            Self::Provider(provider) => provider.transcribe(audio, language).await,
        }
    }
}

// ============================================================================
// MODEL VALIDATION AND INITIALIZATION
// ============================================================================

/// Validate that transcription models are ready before starting recording
pub async fn validate_transcription_model_ready<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    // Check transcript configuration to determine which provider to validate
    let config = match crate::api::api::api_get_transcript_config(
        app.clone(),
        app.clone().state(),
        None,
    )
    .await
    {
        Ok(Some(config)) => {
            info!(
                "📝 Found transcript config - provider: {}, model: {}",
                config.provider, config.model
            );
            config
        }
        Ok(None) => {
            warn!("📝 No transcript config found");
            return Err("No transcript provider configured. Please configure a cloud provider (Deepgram, OpenAI, Groq, or ElevenLabs).".to_string());
        }
        Err(e) => {
            warn!("⚠️ Failed to get transcript config: {}", e);
            return Err(format!("Failed to get transcript configuration: {}", e));
        }
    };

    // Validate cloud provider configuration
    match config.provider.as_str() {
        "deepgram" | "elevenLabs" | "groq" | "openai" => {
            info!("🔍 Validating {} provider configuration...", config.provider);
            
            // Check if API key is present
            if config.api_key.is_none() || config.api_key.as_ref().unwrap().is_empty() {
                return Err(format!(
                    "Provider '{}' requires an API key. Please configure it in settings.",
                    config.provider
                ));
            }

            // Validate model is specified
            if config.model.is_empty() {
                return Err(format!(
                    "Provider '{}' requires a model to be selected.",
                    config.provider
                ));
            }

            info!("✅ Provider '{}' configuration validated", config.provider);
            Ok(())
        }
        other => {
            warn!("❌ Unsupported transcription provider: {}", other);
            Err(format!(
                "Provider '{}' is not supported. Please select a cloud provider: Deepgram, OpenAI, Groq, or ElevenLabs.",
                other
            ))
        }
    }
}

/// Get or initialize the appropriate transcription engine based on provider configuration
pub async fn get_or_init_transcription_engine<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<TranscriptionEngine, String> {
    // Get provider configuration from API
    let config = match crate::api::api::api_get_transcript_config(
        app.clone(),
        app.clone().state(),
        None,
    )
    .await
    {
        Ok(Some(config)) => {
            info!(
                "📝 Transcript config - provider: {}, model: {}",
                config.provider, config.model
            );
            config
        }
        Ok(None) => {
            warn!("📝 No transcript config found");
            return Err("No transcript provider configured. Please configure a cloud provider.".to_string());
        }
        Err(e) => {
            warn!("⚠️ Failed to get transcript config: {}", e);
            return Err(format!("Failed to get transcript configuration: {}", e));
        }
    };

    // Initialize the appropriate cloud provider
    match config.provider.as_str() {
        "deepgram" => {
            info!("☁️ Initializing Deepgram transcription provider");
            // TODO: Implement Deepgram provider initialization
            Err("Deepgram provider not yet implemented".to_string())
        }
        "elevenLabs" => {
            info!("☁️ Initializing ElevenLabs transcription provider");
            // TODO: Implement ElevenLabs provider initialization
            Err("ElevenLabs provider not yet implemented".to_string())
        }
        "groq" => {
            info!("☁️ Initializing Groq transcription provider");
            // TODO: Implement Groq provider initialization
            Err("Groq provider not yet implemented".to_string())
        }
        "openai" => {
            info!("☁️ Initializing OpenAI transcription provider");
            // TODO: Implement OpenAI provider initialization
            Err("OpenAI provider not yet implemented".to_string())
        }
        other => {
            Err(format!(
                "Provider '{}' is not supported. Please select a cloud provider: Deepgram, OpenAI, Groq, or ElevenLabs.",
                other
            ))
        }
    }
}
