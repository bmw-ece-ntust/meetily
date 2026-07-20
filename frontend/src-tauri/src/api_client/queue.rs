// Offline upload queue (SQLite-backed retry queue)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Queue entry for offline upload retry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadQueueEntry {
    pub id: i64,
    pub file_path: PathBuf,
    pub title: Option<String>,
    pub created_at: DateTime<Utc>,
    pub retry_count: i32,
    pub last_error: Option<String>,
}

/// Upload queue manager
/// 
/// Stores failed uploads in SQLite and retries when network is available
pub struct UploadQueue {
    pool: sqlx::SqlitePool,
}

impl UploadQueue {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    /// Add a new upload to the queue
    pub async fn enqueue(
        &self,
        file_path: PathBuf,
        title: Option<String>,
    ) -> Result<i64, sqlx::Error> {
        let file_path_str = file_path.to_string_lossy().to_string();
        let now = Utc::now();

        let result = sqlx::query!(
            r#"
            INSERT INTO upload_queue (file_path, title, created_at, retry_count, last_error)
            VALUES (?, ?, ?, 0, NULL)
            "#,
            file_path_str,
            title,
            now
        )
        .execute(&self.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    /// Get all pending uploads
    pub async fn list_pending(&self) -> Result<Vec<UploadQueueEntry>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"
            SELECT id, file_path, title, created_at, retry_count, last_error
            FROM upload_queue
            ORDER BY created_at ASC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| UploadQueueEntry {
                id: row.id,
                file_path: PathBuf::from(row.file_path),
                title: row.title,
                created_at: row.created_at,
                retry_count: row.retry_count as i32,
                last_error: row.last_error,
            })
            .collect())
    }

    /// Get count of pending uploads
    pub async fn count_pending(&self) -> Result<i64, sqlx::Error> {
        let row = sqlx::query!(
            r#"
            SELECT COUNT(*) as count
            FROM upload_queue
            "#
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(row.count as i64)
    }

    /// Mark upload as succeeded and remove from queue
    pub async fn mark_success(&self, id: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            DELETE FROM upload_queue
            WHERE id = ?
            "#,
            id
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Mark upload as failed and increment retry count
    pub async fn mark_failure(&self, id: i64, error: &str) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE upload_queue
            SET retry_count = retry_count + 1,
                last_error = ?
            WHERE id = ?
            "#,
            error,
            id
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Remove entry from queue (used when file no longer exists)
    pub async fn remove(&self, id: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            DELETE FROM upload_queue
            WHERE id = ?
            "#,
            id
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Clear all entries (used for testing or manual cleanup)
    pub async fn clear_all(&self) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM upload_queue")
            .execute(&self.pool)
            .await?;

        Ok(())
    }
}
