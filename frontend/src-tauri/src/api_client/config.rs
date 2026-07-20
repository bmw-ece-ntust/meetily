// API configuration stored in SQLite

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    pub base_url: String,
    pub api_key: Option<String>,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            base_url: "http://127.0.0.1:8080".to_string(),
            api_key: None,
        }
    }
}

impl ApiConfig {
    pub fn new(base_url: String, api_key: Option<String>) -> Self {
        Self { base_url, api_key }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.base_url.is_empty() {
            return Err("Base URL cannot be empty".to_string());
        }

        // Validate URL format
        if let Err(e) = url::Url::parse(&self.base_url) {
            return Err(format!("Invalid base URL: {}", e));
        }

        Ok(())
    }

    /// Load config from SQLite database
    pub async fn load_from_db(pool: &sqlx::SqlitePool) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT base_url, api_key FROM api_config WHERE id = 1"
        )
        .fetch_optional(pool)
        .await?;

        match row {
            Some((base_url, api_key)) => Ok(Self {
                base_url,
                api_key,
            }),
            None => Ok(Self::default()),
        }
    }

    /// Save config to SQLite database
    pub async fn save_to_db(&self, pool: &sqlx::SqlitePool) -> Result<(), sqlx::Error> {
        self.validate()
            .map_err(|e| sqlx::Error::Protocol(e.into()))?;

        sqlx::query(
            r#"
            INSERT INTO api_config (id, base_url, api_key)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                base_url = excluded.base_url,
                api_key = excluded.api_key
            "#
        )
        .bind(&self.base_url)
        .bind(&self.api_key)
        .execute(pool)
        .await?;

        Ok(())
    }
}
