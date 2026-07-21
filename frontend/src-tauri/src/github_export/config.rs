use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GithubExportConfig {
    pub github_token: Option<String>,
    pub repo_url: Option<String>,
}

impl GithubExportConfig {
    pub fn new(github_token: Option<String>, repo_url: Option<String>) -> Self {
        Self {
            github_token: normalize_opt(github_token),
            repo_url: normalize_opt(repo_url),
        }
    }

    pub fn is_complete(&self) -> bool {
        self.github_token
            .as_ref()
            .map(|t| !t.is_empty())
            .unwrap_or(false)
            && self
                .repo_url
                .as_ref()
                .map(|u| !u.is_empty())
                .unwrap_or(false)
    }

    pub fn validate_for_publish(&self) -> Result<(), String> {
        if self
            .github_token
            .as_ref()
            .map(|t| t.is_empty())
            .unwrap_or(true)
        {
            return Err("GitHub token is required".to_string());
        }
        if self.repo_url.as_ref().map(|u| u.is_empty()).unwrap_or(true) {
            return Err("Repository URL is required".to_string());
        }
        crate::github_export::url_parse::parse_github_tree_url(
            self.repo_url.as_deref().unwrap_or(""),
        )?;
        Ok(())
    }

    pub async fn load_from_db(pool: &sqlx::SqlitePool) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as::<_, (Option<String>, Option<String>)>(
            "SELECT github_token, repo_url FROM github_export_config WHERE id = 1",
        )
        .fetch_optional(pool)
        .await?;

        match row {
            Some((github_token, repo_url)) => Ok(Self {
                github_token,
                repo_url,
            }),
            None => Ok(Self::default()),
        }
    }

    pub async fn save_to_db(&self, pool: &sqlx::SqlitePool) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO github_export_config (id, github_token, repo_url, updated_at)
            VALUES (1, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                github_token = excluded.github_token,
                repo_url = excluded.repo_url,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(&self.github_token)
        .bind(&self.repo_url)
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
