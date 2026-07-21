use super::url_parse::ParsedGithubRepoUrl;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::json;

const GITHUB_API: &str = "https://api.github.com";
const USER_AGENT_VALUE: &str = "Meetily-GitHub-Export";

#[derive(Debug, Clone, Deserialize)]
pub struct GithubUser {
    pub login: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubRepo {
    pub full_name: String,
    pub permissions: Option<GithubRepoPermissions>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubRepoPermissions {
    pub admin: Option<bool>,
    pub push: Option<bool>,
    pub pull: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubBranch {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubContentItem {
    pub path: Option<String>,
    pub sha: Option<String>,
    #[serde(rename = "type")]
    pub content_type: Option<String>,
    pub html_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishResult {
    pub path: String,
    pub html_url: Option<String>,
    pub sha: Option<String>,
}

pub struct GithubClient {
    http: reqwest::Client,
    token: String,
}

impl GithubClient {
    pub fn new(token: &str) -> Result<Self, String> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
        Ok(Self {
            http,
            token: token.trim().to_string(),
        })
    }

    fn auth_headers(&self) -> Result<reqwest::header::HeaderMap, String> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            format!("Bearer {}", self.token)
                .parse()
                .map_err(|e| format!("Invalid auth header: {e}"))?,
        );
        headers.insert(
            ACCEPT,
            "application/vnd.github+json"
                .parse()
                .map_err(|e| format!("Invalid accept header: {e}"))?,
        );
        headers.insert(
            USER_AGENT,
            USER_AGENT_VALUE
                .parse()
                .map_err(|e| format!("Invalid user-agent: {e}"))?,
        );
        headers.insert(
            "X-GitHub-Api-Version",
            "2022-11-28"
                .parse()
                .map_err(|e| format!("Invalid api version header: {e}"))?,
        );
        Ok(headers)
    }

    pub async fn get_user(&self) -> Result<(u16, Option<GithubUser>, String), String> {
        let url = format!("{GITHUB_API}/user");
        self.get_json(&url).await
    }

    pub async fn get_repo(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<(u16, Option<GithubRepo>, String), String> {
        let url = format!("{GITHUB_API}/repos/{owner}/{repo}");
        self.get_json(&url).await
    }

    pub async fn get_branch(
        &self,
        owner: &str,
        repo: &str,
        branch: &str,
    ) -> Result<(u16, Option<GithubBranch>, String), String> {
        let encoded_branch = urlencoding::encode(branch);
        let url = format!("{GITHUB_API}/repos/{owner}/{repo}/branches/{encoded_branch}");
        self.get_json(&url).await
    }

    /// GET contents for a path. 404 is returned as status 404 with body message.
    pub async fn get_contents(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        branch: &str,
    ) -> Result<(u16, Option<serde_json::Value>, String), String> {
        let path = path.trim_start_matches('/');
        let url = if path.is_empty() {
            format!(
                "{GITHUB_API}/repos/{owner}/{repo}/contents?ref={}",
                urlencoding::encode(branch)
            )
        } else {
            format!(
                "{GITHUB_API}/repos/{owner}/{repo}/contents/{}?ref={}",
                path,
                urlencoding::encode(branch)
            )
        };
        self.get_json(&url).await
    }

    pub async fn get_file_sha(
        &self,
        parsed: &ParsedGithubRepoUrl,
        file_path: &str,
    ) -> Result<Option<String>, String> {
        let (status, value, body) = self
            .get_contents(&parsed.owner, &parsed.repo, file_path, &parsed.branch)
            .await?;
        if status == 404 {
            return Ok(None);
        }
        if status != 200 {
            return Err(format!("Failed to read file metadata ({status}): {body}"));
        }
        let value = value.ok_or_else(|| "Empty response for file metadata".to_string())?;
        if value.is_array() {
            return Err(format!(
                "Path '{file_path}' is a directory, expected a file"
            ));
        }
        let item: GithubContentItem = serde_json::from_value(value)
            .map_err(|e| format!("Failed to parse file metadata: {e}"))?;
        Ok(item.sha)
    }

    pub async fn put_file(
        &self,
        parsed: &ParsedGithubRepoUrl,
        file_path: &str,
        content: &str,
        message: &str,
        sha: Option<&str>,
    ) -> Result<PublishResult, String> {
        let path = file_path.trim_start_matches('/');
        let url = format!(
            "{GITHUB_API}/repos/{}/{}/contents/{}",
            parsed.owner, parsed.repo, path
        );

        let mut body = json!({
            "message": message,
            "content": BASE64.encode(content.as_bytes()),
            "branch": parsed.branch,
        });
        if let Some(sha) = sha {
            body["sha"] = json!(sha);
        }

        let headers = self.auth_headers()?;
        let response = self
            .http
            .put(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("GitHub PUT request failed: {e}"))?;

        let status = response.status().as_u16();
        let text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read GitHub response: {e}"))?;

        if status != 200 && status != 201 {
            return Err(format!("GitHub PUT failed ({status}): {text}"));
        }

        let value: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("Invalid GitHub JSON: {e}"))?;

        let content = value.get("content");
        let html_url = content
            .and_then(|c| c.get("html_url"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let sha = content
            .and_then(|c| c.get("sha"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let path = content
            .and_then(|c| c.get("path"))
            .and_then(|v| v.as_str())
            .unwrap_or(path)
            .to_string();

        Ok(PublishResult {
            path,
            html_url,
            sha,
        })
    }

    async fn get_json<T: for<'de> Deserialize<'de>>(
        &self,
        url: &str,
    ) -> Result<(u16, Option<T>, String), String> {
        let headers = self.auth_headers()?;
        let response = self
            .http
            .get(url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("GitHub request failed: {e}"))?;

        let status = response.status().as_u16();
        let text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read GitHub response: {e}"))?;

        if status == 200 {
            let parsed = serde_json::from_str::<T>(&text)
                .map_err(|e| format!("Failed to parse GitHub response: {e}"))?;
            Ok((status, Some(parsed), text))
        } else {
            Ok((status, None, text))
        }
    }
}
