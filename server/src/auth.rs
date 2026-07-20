use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use std::env;

pub fn api_key() -> String {
    env::var("MEETILY_API_KEY").unwrap_or_default()
}

pub async fn require_auth(req: Request, next: Next) -> Result<Response, StatusCode> {
    let expected = api_key();
    if expected.is_empty() {
        log::warn!("MEETILY_API_KEY not set — auth disabled");
        return Ok(next.run(req).await);
    }

    let auth_header = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(h) if h.starts_with("Bearer ") => {
            let token = &h[7..];
            if token == expected {
                Ok(next.run(req).await)
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
