-- Google OAuth client credentials for Calendar/Gmail integration
-- Refresh/access tokens live in the OS keychain, not here.
CREATE TABLE IF NOT EXISTS google_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    client_id TEXT,
    client_secret TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
