use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GoogleConfig {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
}

impl GoogleConfig {
    pub fn new(client_id: Option<String>, client_secret: Option<String>) -> Self {
        Self {
            client_id: normalize_opt(client_id),
            client_secret: normalize_opt(client_secret),
        }
    }

    pub fn is_complete(&self) -> bool {
        self.client_id
            .as_ref()
            .map(|v| !v.is_empty())
            .unwrap_or(false)
            && self
                .client_secret
                .as_ref()
                .map(|v| !v.is_empty())
                .unwrap_or(false)
    }

    pub async fn load_from_db(pool: &sqlx::SqlitePool) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as::<_, (Option<String>, Option<String>)>(
            "SELECT client_id, client_secret FROM google_config WHERE id = 1",
        )
        .fetch_optional(pool)
        .await?;

        match row {
            Some((client_id, client_secret)) => Ok(Self {
                client_id,
                client_secret,
            }),
            None => Ok(Self::default()),
        }
    }

    pub async fn save_to_db(&self, pool: &sqlx::SqlitePool) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO google_config (id, client_id, client_secret, updated_at)
            VALUES (1, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                client_id = excluded.client_id,
                client_secret = excluded.client_secret,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(&self.client_id)
        .bind(&self.client_secret)
        .execute(pool)
        .await?;

        Ok(())
    }
}

fn normalize_opt(value: Option<String>) -> Option<String> {
    value.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    })
}
