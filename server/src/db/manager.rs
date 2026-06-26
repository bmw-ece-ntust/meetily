use sqlx::{migrate::MigrateDatabase, sqlite::SqlitePoolOptions, Result, Sqlite, SqlitePool};
use std::fs;
use std::path::Path;

#[derive(Clone)]
pub struct DatabaseManager {
    pool: SqlitePool,
}

impl DatabaseManager {
    pub async fn new(db_path: &str) -> Result<Self> {
        if let Some(parent_dir) = Path::new(db_path).parent() {
            if !parent_dir.exists() {
                fs::create_dir_all(parent_dir).map_err(sqlx::Error::Io)?;
            }
        }

        if !Path::new(db_path).exists() {
            log::info!("Creating database at {}", db_path);
            Sqlite::create_database(db_path).await?;
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(db_path)
            .await?;

        sqlx::migrate!("./migrations").run(&pool).await?;

        Ok(DatabaseManager { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn cleanup(&self) -> Result<()> {
        log::info!("Starting database cleanup...");
        let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&self.pool)
            .await;
        self.pool.close().await;
        log::info!("Database connection pool closed");
        Ok(())
    }
}
