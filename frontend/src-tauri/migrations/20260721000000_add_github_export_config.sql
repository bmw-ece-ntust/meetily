-- GitHub export config for publishing meeting notes to a user-defined repo path
CREATE TABLE IF NOT EXISTS github_export_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    github_token TEXT,
    repo_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
