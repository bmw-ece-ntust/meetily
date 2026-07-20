-- Cleanup migration: Remove local storage tables (now stored in ai-meeting-agent API)
-- These tables are no longer used as the API is now the single source of truth

-- Drop tables that are now handled by the API
DROP TABLE IF EXISTS transcript_chunks;
DROP TABLE IF EXISTS summary_processes;
DROP TABLE IF EXISTS transcripts;
DROP TABLE IF EXISTS meetings;

-- Drop unused transcript_settings (transcription now via API)
DROP TABLE IF EXISTS transcript_settings;

-- Keep settings table for local preferences
-- Keep api_config table for API configuration
-- Keep upload_queue table for offline upload retry
