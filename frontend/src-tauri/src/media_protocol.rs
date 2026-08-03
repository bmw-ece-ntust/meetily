//! `media://` custom protocol proxy for audio streaming.
//!
//! In production the webview origin is `tauri://localhost` (secure scheme),
//! so plain `http://` media URLs are blocked as mixed content. This protocol
//! proxies media requests through Rust: `media://localhost/<api-path>` ->
//! `{base_url}<api-path>`, forwarding Range headers so browser media elements
//! can stream large recordings (206 Partial Content).

use std::borrow::Cow;
use std::sync::{Arc, OnceLock};

use tauri::http::{Request, Response};
use tauri::{Manager, UriSchemeContext};
use tokio::sync::RwLock;

use crate::api_client::ApiClient;

/// Headers forwarded from the upstream response to the webview.
const PASSTHROUGH_HEADERS: [&str; 4] = [
    "content-type",
    "content-range",
    "accept-ranges",
    "etag",
];

fn blocking_client() -> &'static reqwest::blocking::Client {
    static CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .expect("failed to build media proxy client")
    })
}

fn error_response(status: u16, message: &str) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(Cow::Owned(message.as_bytes().to_vec()))
        .expect("failed to build media proxy error response")
}

pub fn handle(
    ctx: UriSchemeContext<'_, tauri::Wry>,
    request: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let path = request.uri().path().to_string();

    // ApiClient state is managed after database initialization.
    let Some(client_state) = ctx.app_handle().try_state::<Arc<RwLock<ApiClient>>>() else {
        return error_response(503, "media proxy: API client not initialized");
    };

    let (base_url, api_key) = {
        let client = client_state.inner().blocking_read();
        let config = client.config();
        (config.base_url.clone(), config.api_key.clone())
    };

    let url = format!("{}{}", base_url.trim_end_matches('/'), path);
    let mut upstream = blocking_client().get(&url);
    if let Some(key) = api_key {
        upstream = upstream.header("X-API-Key", key);
    }
    if let Some(range) = request.headers().get("range").and_then(|v| v.to_str().ok()) {
        upstream = upstream.header("Range", range);
    }

    let response = match upstream.send() {
        Ok(r) => r,
        Err(e) => {
            log::error!("media proxy upstream error for {}: {}", url, e);
            return error_response(502, "media proxy: upstream request failed");
        }
    };

    let status = response.status().as_u16();
    let headers: Vec<(String, String)> = PASSTHROUGH_HEADERS
        .iter()
        .filter_map(|name| {
            response
                .headers()
                .get(*name)
                .and_then(|v| v.to_str().ok())
                .map(|v| (name.to_string(), v.to_string()))
        })
        .collect();

    match response.bytes() {
        Ok(bytes) => {
            let mut builder = Response::builder().status(status);
            for (name, value) in headers {
                builder = builder.header(name, value);
            }
            builder = builder.header("content-length", bytes.len().to_string());
            builder
                .body(Cow::Owned(bytes.to_vec()))
                .unwrap_or_else(|_| error_response(500, "media proxy: response build failed"))
        }
        Err(e) => {
            log::error!("media proxy read error for {}: {}", url, e);
            error_response(502, "media proxy: failed to read upstream body")
        }
    }
}
