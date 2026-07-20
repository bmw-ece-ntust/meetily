-- Add api_config table for ai-meeting-agent REST API configuration
CREATE TABLE IF NOT EXISTS api_config (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton table (only one row)
    base_url TEXT NOT NULL,
    api_key TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add upload_queue table for offline upload retry queue
CREATE TABLE IF NOT EXISTS upload_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMP NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

-- Create index on upload_queue for faster lookups
CREATE INDEX IF NOT EXISTS idx_upload_queue_created_at ON upload_queue(created_at);
