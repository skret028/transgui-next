//! Transmission JSON-RPC client + Tauri commands.
//!
//! Design notes
//! - One dedicated `reqwest::Client` per connection (pooling + TLS settings).
//! - The daemon enforces a CSRF handshake: the first request returns HTTP 409
//!   with an `X-Transmission-Session-Id` header. We cache it and retry once.
//! - Credentials and the live session id stay in the backend (`ConnState`);
//!   the UI never receives them back.

use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::State;

/// Connection settings coming from the UI.
#[derive(Debug, Deserialize, Clone)]
pub struct ConnConfig {
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub https: Option<bool>,
    #[serde(default)]
    pub accept_invalid_certs: Option<bool>,
}

struct ConnState {
    client: reqwest::Client,
    base: String,
    username: Option<String>,
    password: Option<String>,
    session_id: String,
}

pub struct AppState {
    conn: Mutex<Option<ConnState>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
        }
    }
}

/// Fields requested for the main torrent list. Kept in one place so the UI
/// contract is explicit and easy to extend.
const TORRENT_FIELDS: &[&str] = &[
    "id",
    "name",
    "hashString",
    "status",
    "totalSize",
    "sizeWhenDone",
    "leftUntilDone",
    "percentDone",
    "metadataPercentComplete",
    "rateDownload",
    "rateUpload",
    "uploadRatio",
    "eta",
    "downloadedEver",
    "uploadedEver",
    "downloadDir",
    "addedDate",
    "doneDate",
    "activityDate",
    "isPrivate",
    "isFinished",
    "isStalled",
    "labels",
    "peersConnected",
    "peersGettingFromUs",
    "peersSendingToUs",
    "queuePosition",
    "recheckProgress",
    "error",
    "errorString",
    "comment",
    "creator",
    "magnetLink",
    "pieceCount",
    "pieceSize",
    "secondsDownloading",
    "secondsSeeding",
    "trackers",
    "webseeds",
];

/// One RPC round trip, transparently handling the 409 session-id handshake.
async fn rpc_call(state: &AppState, method: &str, arguments: Value) -> Result<Value, String> {
    // Snapshot the connection so we never hold the lock across `.await`.
    let (client, base, username, password, mut sid) = {
        let guard = state.conn.lock().unwrap();
        let c = guard.as_ref().ok_or_else(|| "尚未连接".to_string())?;
        (
            c.client.clone(),
            c.base.clone(),
            c.username.clone(),
            c.password.clone(),
            c.session_id.clone(),
        )
    };

    // At most two attempts: the first may 409 to hand us the session id.
    for _attempt in 0..2 {
        let mut req = client
            .post(&base)
            .header("X-Transmission-Session-Id", sid.as_str())
            .json(&json!({ "method": method, "arguments": arguments }));
        if let Some(u) = &username {
            req = req.basic_auth(u, password.as_ref());
        }

        let resp = req.send().await.map_err(|e| format!("请求失败：{e}"))?;
        let status = resp.status().as_u16();

        if status == 409 {
            let new_sid = resp
                .headers()
                .get("X-Transmission-Session-Id")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| "409 但缺少 session id 头".to_string())?
                .to_string();
            if let Some(c) = state.conn.lock().unwrap().as_mut() {
                c.session_id = new_sid.clone();
            }
            sid = new_sid;
            continue;
        }

        match status {
            401 => return Err("401 未授权：用户名或密码错误".into()),
            403 => return Err("403 被拒：检查 daemon 的 rpc-whitelist / 反代配置".into()),
            404 => return Err("404：RPC 路径不对（默认 /transmission/rpc）".into()),
            s if !(200..300).contains(&s) => return Err(format!("HTTP {s}")),
            _ => {}
        }

        let body: Value = resp
            .json()
            .await
            .map_err(|e| format!("响应不是合法 JSON：{e}"))?;
        let result = body
            .get("result")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        if result != "success" {
            return Err(format!("daemon 返回错误：{result}"));
        }
        return Ok(body.get("arguments").cloned().unwrap_or(Value::Null));
    }

    Err("session-id 握手失败（连续两次 409）".into())
}

/// Establish a connection and verify it with `session-get`.
#[tauri::command]
pub async fn rpc_connect(state: State<'_, AppState>, config: ConnConfig) -> Result<Value, String> {
    let scheme = if config.https.unwrap_or(false) {
        "https"
    } else {
        "http"
    };
    let raw_path = config
        .path
        .clone()
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| "/transmission/rpc".to_string());
    let path = if raw_path.starts_with('/') {
        raw_path
    } else {
        format!("/{raw_path}")
    };
    let base = format!("{scheme}://{}:{}{}", config.host.trim(), config.port, path);

    let mut builder = reqwest::Client::builder().user_agent("transgui-next/0.1");
    if config.accept_invalid_certs.unwrap_or(false) {
        builder = builder.danger_accept_invalid_certs(true);
    }
    let client = builder
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败：{e}"))?;

    let username = config.username.clone().filter(|s| !s.is_empty());
    let password = config.password.clone();

    {
        let mut guard = state.conn.lock().unwrap();
        *guard = Some(ConnState {
            client,
            base,
            username,
            password,
            session_id: String::new(),
        });
    }

    match rpc_call(state.inner(), "session-get", json!({})).await {
        Ok(session) => {
            let version = session.get("version").cloned().unwrap_or(Value::Null);
            let rpc_version = session.get("rpc-version").cloned().unwrap_or(Value::Null);
            Ok(json!({
                "version": version,
                "rpcVersion": rpc_version,
                "session": session,
            }))
        }
        Err(e) => {
            *state.conn.lock().unwrap() = None;
            Err(e)
        }
    }
}

#[tauri::command]
pub fn rpc_disconnect(state: State<'_, AppState>) {
    *state.conn.lock().unwrap() = None;
}

#[tauri::command]
pub async fn rpc_session(state: State<'_, AppState>) -> Result<Value, String> {
    rpc_call(state.inner(), "session-get", json!({})).await
}

/// Fetch the torrent list with the shared field set.
#[tauri::command]
pub async fn rpc_torrents(state: State<'_, AppState>) -> Result<Value, String> {
    let args = json!({ "fields": TORRENT_FIELDS });
    let res = rpc_call(state.inner(), "torrent-get", args).await?;
    Ok(res.get("torrents").cloned().unwrap_or_else(|| json!([])))
}

/// Fields needed for the details panel (files / peers / trackers / metadata).
/// Superset of TORRENT_FIELDS so a detail record also satisfies `Torrent`.
const DETAIL_FIELDS: &[&str] = &[
    "id",
    "name",
    "hashString",
    "status",
    "totalSize",
    "sizeWhenDone",
    "leftUntilDone",
    "percentDone",
    "rateDownload",
    "rateUpload",
    "peersConnected",
    "peersSendingToUs",
    "peersGettingFromUs",
    "queuePosition",
    "recheckProgress",
    "isFinished",
    "isStalled",
    "error",
    "errorString",
    "comment",
    "creator",
    "dateCreated",
    "downloadDir",
    "isPrivate",
    "magnetLink",
    "pieceCount",
    "pieceSize",
    "addedDate",
    "doneDate",
    "activityDate",
    "startDate",
    "secondsDownloading",
    "secondsSeeding",
    "uploadedEver",
    "downloadedEver",
    "corruptEver",
    "haveValid",
    "haveUnchecked",
    "eta",
    "uploadRatio",
    "seedRatioLimit",
    "seedRatioMode",
    "downloadLimit",
    "uploadLimit",
    "downloadLimited",
    "uploadLimited",
    "bandwidthPriority",
    "honorsSessionLimits",
    "labels",
    "files",
    "fileStats",
    "peers",
    "peersFrom",
    "trackers",
    "trackerStats",
];

/// Fetch detailed records for the given torrent ids.
#[tauri::command]
pub async fn rpc_torrent_details(
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> Result<Value, String> {
    let args = json!({ "ids": ids, "fields": DETAIL_FIELDS });
    let res = rpc_call(state.inner(), "torrent-get", args).await?;
    Ok(res.get("torrents").cloned().unwrap_or_else(|| json!([])))
}

/// Map a UI action to a Transmission method and call it.
#[tauri::command]
pub async fn rpc_torrent_action(
    state: State<'_, AppState>,
    action: String,
    ids: Vec<i64>,
) -> Result<Value, String> {
    let method = match action.as_str() {
        "start" => "torrent-start",
        "start_now" => "torrent-start-now",
        "stop" => "torrent-stop",
        "verify" => "torrent-verify",
        "reannounce" => "torrent-reannounce",
        "remove" => "torrent-remove",
        _ => return Err(format!("未知操作：{action}")),
    };
    let mut args = json!({ "ids": ids });
    if action == "remove" {
        // P0: never delete data implicitly.
        args["delete-local-data"] = json!(false);
    }
    rpc_call(state.inner(), method, args).await
}

/// Add a torrent by magnet / URL / local .torrent path.
#[tauri::command]
pub async fn rpc_add_torrent(
    state: State<'_, AppState>,
    filename: String,
    download_dir: Option<String>,
) -> Result<Value, String> {
    if filename.trim().is_empty() {
        return Err("filename 为空".into());
    }
    let mut args = json!({ "filename": filename.trim() });
    if let Some(d) = download_dir.filter(|d| !d.trim().is_empty()) {
        args["download-dir"] = json!(d);
    }
    rpc_call(state.inner(), "torrent-add", args).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Live round-trip against a real transmission daemon.
    /// Override with TRANSMISSION_TEST_URL / _USER / _PASS.
    #[tokio::test]
    async fn live_rpc_roundtrip() {
        let base = std::env::var("TRANSMISSION_TEST_URL")
            .unwrap_or_else(|_| "http://localhost:19091/transmission/rpc".to_string());
        let user =
            std::env::var("TRANSMISSION_TEST_USER").unwrap_or_else(|_| "admin".to_string());
        let pass =
            std::env::var("TRANSMISSION_TEST_PASS").unwrap_or_else(|_| "admin".to_string());

        let state = AppState::new();
        {
            let mut g = state.conn.lock().unwrap();
            *g = Some(ConnState {
                client: reqwest::Client::new(),
                base,
                username: Some(user),
                password: Some(pass),
                session_id: String::new(),
            });
        }

        // Must transparently complete the 409 session-id handshake.
        let session = rpc_call(&state, "session-get", json!({}))
            .await
            .expect("session-get");
        let version = session
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or("?");
        assert!(!version.is_empty(), "daemon version missing");
        println!("daemon version = {version}");

        let res = rpc_call(&state, "torrent-get", json!({ "fields": TORRENT_FIELDS }))
            .await
            .expect("torrent-get");
        let torrents = res
            .get("torrents")
            .and_then(Value::as_array)
            .expect("torrents must be an array");
        println!("torrent count = {}", torrents.len());
        for t in torrents {
            println!(
                "  #{} {:?} status={} pct={}",
                t["id"],
                t["name"],
                t["status"],
                t["percentDone"].as_f64().unwrap_or(0.0),
            );
        }

        // Details path (files / peers / trackers) must return the nested arrays.
        if let Some(first) = torrents.first() {
            let id = first["id"].as_i64().expect("torrent id");
            let dres = rpc_call(
                &state,
                "torrent-get",
                json!({ "ids": [id], "fields": DETAIL_FIELDS }),
            )
            .await
            .expect("torrent-get details");
            let d = &dres["torrents"][0];
            println!(
                "detail #{id}: files={} peers={} trackers={} dir={:?}",
                d["files"].as_array().map(|a| a.len()).unwrap_or(0),
                d["peers"].as_array().map(|a| a.len()).unwrap_or(0),
                d["trackerStats"].as_array().map(|a| a.len()).unwrap_or(0),
                d["downloadDir"],
            );
            assert!(d["files"].is_array(), "files array missing in details");
            assert!(
                d["trackerStats"].is_array(),
                "trackerStats array missing in details"
            );
        }
    }
}
