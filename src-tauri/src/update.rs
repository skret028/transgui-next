//! "Check for updates" against the project's public GitHub releases.
//!
//! Only the latest release tag is read; nothing about this machine is sent.
//! Failures are reported as clean, translatable error strings rather than
//! panics, so a machine that is offline just sees a message.

use serde::Serialize;
use std::time::Duration;

const RELEASES_URL: &str =
    "https://api.github.com/repos/skret028/transgui-next/releases/latest";

#[derive(Serialize)]
pub struct UpdateInfo {
    /// This build's version, e.g. "0.1.0".
    current: String,
    /// The latest release's tag, e.g. "v0.1.1".
    latest: String,
    /// Whether `latest` is a higher version than `current`.
    newer: bool,
    /// The release page to open for details.
    url: String,
}

/// Split a version/tag into numeric components ("v1.2.3" -> [1, 2, 3]).
/// Anything non-numeric stops that component; missing ones count as 0.
fn version_parts(v: &str) -> Vec<u64> {
    v.trim()
        .trim_start_matches(['v', 'V'])
        .split('.')
        .map(|p| {
            p.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        })
        .collect()
}

/// True when `latest` is a strictly higher version than `current`.
/// Lexicographic comparison of the numeric vectors handles both "1.0" < "1.0.1"
/// and "1.2" < "1.10" correctly.
fn is_newer(current: &str, latest: &str) -> bool {
    version_parts(latest) > version_parts(current)
}

#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();

    let client = reqwest::Client::builder()
        .user_agent("transgui-next/0.1")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| {
            eprintln!("[update] client build failed: {e}");
            "Could not reach GitHub to check for updates".to_string()
        })?;

    let resp = client.get(RELEASES_URL).send().await.map_err(|e| {
        eprintln!("[update] request failed: {e}");
        "Could not reach GitHub to check for updates".to_string()
    })?;

    let status = resp.status();
    if !status.is_success() {
        eprintln!("[update] GitHub responded {}", status.as_u16());
        return Err("GitHub returned an unexpected status".to_string());
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| {
        eprintln!("[update] bad JSON: {e}");
        "GitHub returned an unexpected status".to_string()
    })?;

    let latest = body
        .get("tag_name")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "That release has no version tag".to_string())?;

    let url = body
        .get("html_url")
        .and_then(serde_json::Value::as_str)
        .unwrap_or(RELEASES_URL)
        .to_string();

    Ok(UpdateInfo {
        newer: is_newer(&current, latest),
        current,
        latest: latest.to_string(),
        url,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_parts_strip_prefix_and_junk() {
        assert_eq!(version_parts("v1.2.3"), vec![1, 2, 3]);
        assert_eq!(version_parts("0.1.0"), vec![0, 1, 0]);
        assert_eq!(version_parts("1.2.3-beta.1"), vec![1, 2, 3, 1]);
    }

    #[test]
    fn newer_compares_numerically() {
        assert!(is_newer("0.1.0", "v0.1.1"));
        assert!(is_newer("0.1.0", "v0.2.0"));
        assert!(is_newer("0.9", "0.10"));
        assert!(!is_newer("0.1.0", "v0.1.0"));
        assert!(!is_newer("1.0.0", "v0.9.9"));
    }
}
