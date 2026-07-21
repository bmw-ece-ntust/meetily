use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedGithubRepoUrl {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub dir_path: String,
}

/// Parse a GitHub tree URL:
/// `https://github.com/{owner}/{repo}/tree/{branch}/{dir...}`
///
/// Also accepts `https://github.com/{owner}/{repo}` (branch defaults to `main`, dir empty)
/// and `https://github.com/{owner}/{repo}/tree/{branch}`.
pub fn parse_github_tree_url(raw: &str) -> Result<ParsedGithubRepoUrl, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Repository URL cannot be empty".to_string());
    }

    let url = Url::parse(trimmed).map_err(|e| format!("Invalid repository URL: {e}"))?;

    let host = url.host_str().unwrap_or("");
    if host != "github.com" && host != "www.github.com" {
        return Err(format!(
            "URL must be a github.com link (got host '{host}')"
        ));
    }

    let segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|p| !p.is_empty()).collect())
        .unwrap_or_default();

    if segments.len() < 2 {
        return Err(
            "URL must include owner and repo, e.g. https://github.com/owner/repo/tree/branch/docs/meetings"
                .to_string(),
        );
    }

    let owner = segments[0].to_string();
    let repo = segments[1].trim_end_matches(".git").to_string();

    if owner.is_empty() || repo.is_empty() {
        return Err("Owner and repo cannot be empty".to_string());
    }

    // https://github.com/owner/repo
    if segments.len() == 2 {
        return Ok(ParsedGithubRepoUrl {
            owner,
            repo,
            branch: "main".to_string(),
            dir_path: String::new(),
        });
    }

    // https://github.com/owner/repo/tree/branch[/path...]
    if segments[2] != "tree" {
        return Err(
            "URL must use /tree/{branch}/... form, e.g. https://github.com/owner/repo/tree/main/docs/meetings"
                .to_string(),
        );
    }

    if segments.len() < 4 {
        return Err("URL is missing branch after /tree/".to_string());
    }

    let branch = segments[3].to_string();
    let dir_path = if segments.len() > 4 {
        segments[4..].join("/")
    } else {
        String::new()
    };

    Ok(ParsedGithubRepoUrl {
        owner,
        repo,
        branch,
        dir_path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_full_tree_url() {
        let p = parse_github_tree_url(
            "https://github.com/bmw-ntust-internship/internship/tree/2026-TEEP-5-Samuel/docs/meetings",
        )
        .unwrap();
        assert_eq!(p.owner, "bmw-ntust-internship");
        assert_eq!(p.repo, "internship");
        assert_eq!(p.branch, "2026-TEEP-5-Samuel");
        assert_eq!(p.dir_path, "docs/meetings");
    }

    #[test]
    fn parse_repo_only() {
        let p = parse_github_tree_url("https://github.com/owner/repo").unwrap();
        assert_eq!(p.branch, "main");
        assert_eq!(p.dir_path, "");
    }

    #[test]
    fn parse_tree_branch_only() {
        let p = parse_github_tree_url("https://github.com/owner/repo/tree/dev").unwrap();
        assert_eq!(p.branch, "dev");
        assert_eq!(p.dir_path, "");
    }
}
