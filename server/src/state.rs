use crate::db::manager::DatabaseManager;

#[derive(Clone)]
pub struct AppState {
    pub db_manager: DatabaseManager,
}
