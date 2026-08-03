//! Google OAuth2 (Desktop app, loopback redirect + PKCE).
//!
//! Flow: bind a temporary HTTP listener on 127.0.0.1, open the system
//! browser to Google's consent URL, catch the redirect, exchange the code
//! for tokens. The refresh token is stored in the OS keychain; the access
//! token is cached in memory and refreshed on demand.

use base64::Engine;
use log::{debug as log_debug, error as log_error, info as log_info};
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::RwLock;
use std::time::{Duration, Instant};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const KEYCHAIN_SERVICE: &str = "meetily";
const KEYCHAIN_REFRESH_TOKEN: &str = "google_refresh_token";
const KEYCHAIN_EMAIL: &str = "google_account_email";
const GMAIL_PROFILE_URL: &str = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

pub const SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.send",
];

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: Option<i64>,
    refresh_token: Option<String>,
}

struct CachedAccessToken {
    token: String,
    expires_at: Instant,
}

static ACCESS_TOKEN_CACHE: RwLock<Option<CachedAccessToken>> = RwLock::new(None);

/// Runs the interactive OAuth flow: opens the browser, waits for the
/// loopback redirect, exchanges the code, stores the refresh token in the
/// keychain. Returns the signed-in account email (best effort).
pub async fn connect(client_id: &str, client_secret: &str) -> Result<String, String> {
    let (code, redirect_uri, verifier) = wait_for_auth_code(client_id).await?;
    log_info!("google oauth: received auth code, exchanging for tokens");

    let http = reqwest::Client::new();
    let resp = http
        .post(TOKEN_URL)
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange rejected by Google: {body}"));
    }

    let tokens: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {e}"))?;

    let refresh_token = tokens
        .refresh_token
        .ok_or_else(|| {
            "Google did not return a refresh token. Disconnect and reconnect, \
             and make sure to grant both permissions."
                .to_string()
        })?;

    store_refresh_token(&refresh_token)?;
    cache_access_token(&tokens.access_token, tokens.expires_in);

    let email = fetch_account_email(&tokens.access_token)
        .await
        .unwrap_or_default();
    if !email.is_empty() {
        store_account_email(&email);
    }
    Ok(email)
}

/// Returns a valid access token, refreshing it if expired. Clears the
/// in-memory cache; the refresh token stays in the keychain.
pub async fn get_access_token(client_id: &str, client_secret: &str) -> Result<String, String> {
    {
        let cache = ACCESS_TOKEN_CACHE.read().map_err(|e| e.to_string())?;
        if let Some(cached) = cache.as_ref() {
            if cached.expires_at > Instant::now() + Duration::from_secs(60) {
                return Ok(cached.token.clone());
            }
        }
    }

    let refresh_token = load_refresh_token()?
        .ok_or_else(|| "Not connected to Google. Connect in Settings first.".to_string())?;

    log_debug!("google oauth: refreshing access token");
    let http = reqwest::Client::new();
    let resp = http
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        if body.contains("invalid_grant") {
            let _ = clear_stored();
        }
        return Err(format!("Token refresh rejected by Google: {body}"));
    }

    let tokens: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {e}"))?;
    cache_access_token(&tokens.access_token, tokens.expires_in);
    Ok(tokens.access_token)
}

pub fn is_connected() -> bool {
    load_refresh_token().ok().flatten().is_some()
}

pub fn stored_account_email() -> Option<String> {
    keychain_entry(KEYCHAIN_EMAIL).get_password().ok()
}

pub fn disconnect() -> Result<(), String> {
    clear_stored()
}

fn clear_stored() -> Result<(), String> {
    if let Ok(mut cache) = ACCESS_TOKEN_CACHE.write() {
        *cache = None;
    }
    let _ = keychain_entry(KEYCHAIN_REFRESH_TOKEN).delete_credential();
    let _ = keychain_entry(KEYCHAIN_EMAIL).delete_credential();
    Ok(())
}

fn keychain_entry(key: &str) -> keyring::Entry {
    keyring::Entry::new(KEYCHAIN_SERVICE, key)
        .unwrap_or_else(|_| panic!("invalid keychain key {key}"))
}

fn store_refresh_token(token: &str) -> Result<(), String> {
    keychain_entry(KEYCHAIN_REFRESH_TOKEN)
        .set_password(token)
        .map_err(|e| format!("Failed to store token in keychain: {e}"))
}

fn load_refresh_token() -> Result<Option<String>, String> {
    match keychain_entry(KEYCHAIN_REFRESH_TOKEN).get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read token from keychain: {e}")),
    }
}

fn store_account_email(email: &str) {
    let _ = keychain_entry(KEYCHAIN_EMAIL).set_password(email);
}

fn cache_access_token(token: &str, expires_in: Option<i64>) {
    let ttl = Duration::from_secs(expires_in.unwrap_or(3600).max(0) as u64);
    if let Ok(mut cache) = ACCESS_TOKEN_CACHE.write() {
        *cache = Some(CachedAccessToken {
            token: token.to_string(),
            expires_at: Instant::now() + ttl,
        });
    }
}

async fn fetch_account_email(access_token: &str) -> Result<String, String> {
    let http = reqwest::Client::new();
    let resp = http
        .get(GMAIL_PROFILE_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Gmail profile: {e}"))?;
    if !resp.status().is_success() {
        return Err("Gmail profile request failed".to_string());
    }
    let profile: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Gmail profile: {e}"))?;
    Ok(profile
        .get("emailAddress")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string())
}

fn generate_pkce() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// Binds the loopback listener, opens the browser, blocks until Google
/// redirects back (or a 10-minute timeout). Returns (auth_code, redirect_uri, pkce_verifier).
async fn wait_for_auth_code(client_id: &str) -> Result<(String, String, String), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind loopback listener: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to configure listener: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read listener address: {e}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let (verifier, challenge) = generate_pkce();

    let state = {
        let mut bytes = [0u8; 16];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    };

    let auth_url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}&code_challenge={}&code_challenge_method=S256",
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&SCOPES.join(" ")),
        urlencoding::encode(&state),
        urlencoding::encode(&challenge),
    );

    open_browser(&auth_url)?;
    log_info!("google oauth: waiting for redirect on {redirect_uri}");

    let deadline = Instant::now() + Duration::from_secs(600);
    loop {
        if Instant::now() > deadline {
            return Err("Timed out waiting for Google sign-in (10 minutes)".to_string());
        }
        match listener.accept() {
            Ok((stream, _)) => {
                return handle_redirect(stream, &state, redirect_uri)
                    .map(|(code, uri)| (code, uri, verifier));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(e) => return Err(format!("Loopback listener failed: {e}")),
        }
    }
}

fn handle_redirect(
    mut stream: std::net::TcpStream,
    expected_state: &str,
    redirect_uri: String,
) -> Result<(String, String), String> {
    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|e| format!("Failed to read redirect request: {e}"))?;
    // Drain remaining headers so the browser gets a clean response.
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {
                if line.trim().is_empty() {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or_default()
        .to_string();

    let parsed = url::Url::parse(&format!("http://localhost{path}"))
        .map_err(|e| format!("Failed to parse redirect URL: {e}"))?;
    let params: std::collections::HashMap<String, String> =
        parsed.query_pairs().into_owned().collect();

    let (html, result) = match (params.get("code"), params.get("error")) {
        (Some(code), _) => {
            if params.get("state").map(|s| s.as_str()) != Some(expected_state) {
                (
                    "Authorization failed: state mismatch. You can close this tab.",
                    Err("OAuth state mismatch".to_string()),
                )
            } else {
                (
                    "Authorization received. You can close this tab and return to Meetily.",
                    Ok(code.clone()),
                )
            }
        }
        (None, Some(err)) => (
            "Authorization was denied or failed. You can close this tab.",
            Err(format!("Google authorization failed: {err}")),
        ),
        (None, None) => (
            "Malformed authorization redirect. You can close this tab.",
            Err("Malformed OAuth redirect".to_string()),
        ),
    };

    let body = format!(
        "<!doctype html><html><body style=\"font-family:sans-serif;text-align:center;padding:3em\"><p>{html}</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    if let Err(e) = stream.write_all(response.as_bytes()) {
        log_error!("google oauth: failed to write browser response: {e}");
    }
    let _ = stream.flush();

    result.map(|code| (code, redirect_uri))
}

fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", url]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(url);
        c
    };

    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open browser for Google sign-in: {e}"))
}
