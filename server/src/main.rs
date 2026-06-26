mod auth;
mod db;
mod error;
mod routes;
mod state;

use axum::middleware::from_fn_with_state;
use axum::routing::get;
use axum::Router;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::db::manager::DatabaseManager;
use crate::state::AppState;

fn resolve_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MEETILY_DATA_DIR") {
        return PathBuf::from(dir);
    }
    let home = dirs::home_dir().expect("cannot resolve home dir");
    home.join(".meetily")
}

#[derive(OpenApi)]
#[openapi(
    paths(routes::health::health, routes::health::version),
    info(title = "Meetily API", version = "0.1.0", description = "Headless meeting transcription + summary server")
)]
struct ApiDoc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();

    let data_dir = resolve_data_dir();
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("meeting_minutes.sqlite");
    let db_path_str = db_path.to_string_lossy().to_string();
    log::info!("Data dir: {}", data_dir.display());
    log::info!("DB path: {}", db_path_str);

    let db_manager = DatabaseManager::new(&db_path_str).await?;
    let state = AppState { db_manager };

    let port: u16 = std::env::var("MEETILY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let app = build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    log::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn build_router(state: AppState) -> Router {
    let public_routes = Router::new()
        .route("/health", get(routes::health::health))
        .route("/version", get(routes::health::version));

    let protected_routes = Router::new()
        .layer(from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn auth_middleware(
    state: axum::extract::State<AppState>,
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, axum::http::StatusCode> {
    let _ = state;
    auth::require_auth(req, next).await
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    log::info!("Shutdown signal received");
}
