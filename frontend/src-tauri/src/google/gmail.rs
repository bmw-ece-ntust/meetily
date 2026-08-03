//! Gmail send: builds an RFC 2822 MIME message with the minutes as a
//! Markdown attachment and sends it via the Gmail API.

use base64::Engine;

const SEND_URL: &str = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/// Sends `markdown` as a `.md` attachment to `recipients`.
/// Returns the Gmail message id on success.
pub async fn send_minutes(
    access_token: &str,
    recipients: &[String],
    subject: &str,
    body_text: &str,
    attachment_filename: &str,
    markdown: &str,
) -> Result<String, String> {
    if recipients.is_empty() {
        return Err("No recipients selected".to_string());
    }

    let raw = build_mime(recipients, subject, body_text, attachment_filename, markdown);
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw.as_bytes());

    let http = reqwest::Client::new();
    let resp = http
        .post(SEND_URL)
        .bearer_auth(access_token)
        .json(&serde_json::json!({ "raw": encoded }))
        .send()
        .await
        .map_err(|e| format!("Gmail send request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gmail API error: {body}"));
    }

    let sent: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Gmail response: {e}"))?;
    Ok(sent
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string())
}

fn build_mime(
    recipients: &[String],
    subject: &str,
    body_text: &str,
    attachment_filename: &str,
    markdown: &str,
) -> String {
    let boundary = format!("meetily-{}", uuid::Uuid::new_v4().simple());
    let to = recipients.join(", ");
    let encoded_subject = encode_header_utf8(subject);
    let attachment_b64 = base64::engine::general_purpose::STANDARD.encode(markdown.as_bytes());

    let mut msg = String::new();
    msg.push_str(&format!("To: {to}\r\n"));
    msg.push_str(&format!("Subject: {encoded_subject}\r\n"));
    msg.push_str("MIME-Version: 1.0\r\n");
    msg.push_str(&format!(
        "Content-Type: multipart/mixed; boundary=\"{boundary}\"\r\n\r\n"
    ));

    // Body part
    msg.push_str(&format!("--{boundary}\r\n"));
    msg.push_str("Content-Type: text/plain; charset=\"UTF-8\"\r\n");
    msg.push_str("Content-Transfer-Encoding: 8bit\r\n\r\n");
    msg.push_str(body_text);
    msg.push_str("\r\n\r\n");

    // Attachment part
    msg.push_str(&format!("--{boundary}\r\n"));
    msg.push_str("Content-Type: text/markdown; charset=\"UTF-8\"; name=\"");
    msg.push_str(attachment_filename);
    msg.push_str("\"\r\n");
    msg.push_str("Content-Transfer-Encoding: base64\r\n");
    msg.push_str(&format!(
        "Content-Disposition: attachment; filename=\"{attachment_filename}\"\r\n\r\n"
    ));
    // RFC 2045: base64 lines wrapped at 76 chars
    for chunk in attachment_b64.as_bytes().chunks(76) {
        msg.push_str(std::str::from_utf8(chunk).unwrap_or_default());
        msg.push_str("\r\n");
    }
    msg.push_str(&format!("\r\n--{boundary}--\r\n"));

    msg
}

/// RFC 2047 encoded-word for non-ASCII subjects.
fn encode_header_utf8(value: &str) -> String {
    if value.is_ascii() {
        return value.replace(['\r', '\n'], " ");
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(value.as_bytes());
    format!("=?UTF-8?B?{encoded}?=")
}
