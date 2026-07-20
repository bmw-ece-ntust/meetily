use axum::Json;
use serde_json::{json, Value};
use std::env;
/// Health check — no auth required
#[utoipa::path(
    get,
    path = "/health",
    responses((status = 200, description = "Server healthy", body = Value))
)]
pub async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

/// Version info — no auth required
#[utoipa::path(
    get,
    path = "/version",
    responses((status = 200, description = "Version info", body = Value))
)]
pub async fn version() -> Json<Value> {
    let pkg_version = env!("CARGO_PKG_VERSION");
    Json(json!({ "version": pkg_version, "name": "meetily-server" }))
}
