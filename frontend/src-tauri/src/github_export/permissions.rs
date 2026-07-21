use super::client::GithubClient;
use super::url_parse::{parse_github_tree_url, ParsedGithubRepoUrl};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PermissionChecks {
    pub token_valid: bool,
    pub repo_accessible: bool,
    pub can_push: bool,
    pub branch_exists: bool,
    pub path_ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionCheckResult {
    pub ok: bool,
    pub checks: PermissionChecks,
    pub user: Option<String>,
    pub error: Option<String>,
    pub details: Vec<String>,
}

impl PermissionCheckResult {
    fn fail(checks: PermissionChecks, error: String, details: Vec<String>, user: Option<String>) -> Self {
        Self {
            ok: false,
            checks,
            user,
            error: Some(error),
            details,
        }
    }
}

/// Full write-readiness check against GitHub API.
pub async fn check_write_readiness(
    token: &str,
    repo_url: &str,
) -> Result<PermissionCheckResult, String> {
    let token = token.trim();
    if token.is_empty() {
        return Ok(PermissionCheckResult::fail(
            PermissionChecks::default(),
            "GitHub token is required".to_string(),
            vec!["Provide a personal access token with Contents write access.".to_string()],
            None,
        ));
    }

    let parsed = match parse_github_tree_url(repo_url) {
        Ok(p) => p,
        Err(e) => {
            return Ok(PermissionCheckResult::fail(
                PermissionChecks::default(),
                e.clone(),
                vec![e],
                None,
            ));
        }
    };

    let client = GithubClient::new(token)?;
    let mut checks = PermissionChecks::default();
    let mut details = Vec::new();

    // 1. Token valid
    let (status, user, body) = client.get_user().await?;
    let user_login = if status == 200 {
        checks.token_valid = true;
        let login = user.map(|u| u.login);
        details.push(format!(
            "Token valid{}",
            login
                .as_ref()
                .map(|u| format!(" (user: {u})"))
                .unwrap_or_default()
        ));
        login
    } else {
        details.push(format!("Token invalid or expired (HTTP {status})"));
        return Ok(PermissionCheckResult::fail(
            checks,
            format_github_error("Token check failed", status, &body),
            details,
            None,
        ));
    };

    // 2. Repo accessible
    let (status, repo, body) = client.get_repo(&parsed.owner, &parsed.repo).await?;
    if status == 200 {
        checks.repo_accessible = true;
        details.push(format!(
            "Repository accessible: {}",
            repo.as_ref()
                .map(|r| r.full_name.clone())
                .unwrap_or_else(|| format!("{}/{}", parsed.owner, parsed.repo))
        ));
    } else {
        details.push(format!(
            "Cannot access repository {}/{} (HTTP {status})",
            parsed.owner, parsed.repo
        ));
        return Ok(PermissionCheckResult::fail(
            checks,
            format_github_error("Repository not accessible", status, &body),
            details,
            user_login,
        ));
    }

    // 3. Can push
    let can_push = repo
        .as_ref()
        .and_then(|r| r.permissions.as_ref())
        .map(|p| p.push.unwrap_or(false) || p.admin.unwrap_or(false))
        .unwrap_or(false);
    if can_push {
        checks.can_push = true;
        details.push("Push permission granted".to_string());
    } else {
        details.push(
            "No push permission on this repository. Need write access (classic: repo scope; fine-grained: Contents Read and write)."
                .to_string(),
        );
        return Ok(PermissionCheckResult::fail(
            checks,
            "Token cannot push to this repository".to_string(),
            details,
            user_login,
        ));
    }

    // 4. Branch exists
    let (status, _branch, body) = client
        .get_branch(&parsed.owner, &parsed.repo, &parsed.branch)
        .await?;
    if status == 200 {
        checks.branch_exists = true;
        details.push(format!("Branch exists: {}", parsed.branch));
    } else {
        details.push(format!(
            "Branch '{}' not found (HTTP {status})",
            parsed.branch
        ));
        return Ok(PermissionCheckResult::fail(
            checks,
            format_github_error(
                &format!("Branch '{}' not found", parsed.branch),
                status,
                &body,
            ),
            details,
            user_login,
        ));
    }

    // 5. Path ok (200 or 404 both fine)
    let path_label = if parsed.dir_path.is_empty() {
        "/ (repo root)".to_string()
    } else {
        parsed.dir_path.clone()
    };
    let (status, _value, body) = client
        .get_contents(
            &parsed.owner,
            &parsed.repo,
            &parsed.dir_path,
            &parsed.branch,
        )
        .await?;
    if status == 200 || status == 404 {
        checks.path_ok = true;
        if status == 200 {
            details.push(format!("Target path readable: {path_label}"));
        } else {
            details.push(format!(
                "Target path not present yet (will be created on first publish): {path_label}"
            ));
        }
    } else {
        details.push(format!(
            "Cannot access target path '{path_label}' (HTTP {status})"
        ));
        return Ok(PermissionCheckResult::fail(
            checks,
            format_github_error("Target path not accessible", status, &body),
            details,
            user_login,
        ));
    }

    Ok(PermissionCheckResult {
        ok: true,
        checks,
        user: user_login,
        error: None,
        details,
    })
}

pub fn parse_or_err(repo_url: &str) -> Result<ParsedGithubRepoUrl, String> {
    parse_github_tree_url(repo_url)
}

fn format_github_error(prefix: &str, status: u16, body: &str) -> String {
    let message = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("message")
                .and_then(|m| m.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| {
            let short = body.chars().take(200).collect::<String>();
            if short.is_empty() {
                format!("HTTP {status}")
            } else {
                short
            }
        });
    format!("{prefix}: {message}")
}
