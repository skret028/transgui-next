//! Transmission JSON-RPC client + Tauri commands.
//!
//! Design notes
//! - One dedicated `reqwest::Client` per connection (pooling + TLS settings).
//! - The daemon enforces a CSRF handshake: the first request returns HTTP 409
//!   with an `X-Transmission-Session-Id` header. We cache it and retry once.
//! - Credentials and the live session id stay in the backend (`ConnState`);
//!   the UI never receives them back.

use base64::Engine as _;
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
///
/// `start_all` / `stop_all` act on every torrent (no `ids` argument).
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
        "remove" | "remove_with_data" => "torrent-remove",
        // The queue moves are ordinary torrent actions in the RPC spec.
        "queue_up" => "queue-move-up",
        "queue_down" => "queue-move-down",
        "queue_top" => "queue-move-top",
        "queue_bottom" => "queue-move-bottom",
        "start_all" => "torrent-start",
        "stop_all" => "torrent-stop",
        _ => return Err(format!("未知操作：{action}")),
    };

    let mut args = json!({});
    let global = matches!(action.as_str(), "start_all" | "stop_all");
    if !global {
        if ids.is_empty() {
            return Err("未选择种子".into());
        }
        args["ids"] = json!(ids);
    }
    // Deleting the payload is never implicit: it needs its own action name, and
    // the UI confirms before sending it.
    match action.as_str() {
        "remove" => args["delete-local-data"] = json!(false),
        "remove_with_data" => args["delete-local-data"] = json!(true),
        _ => {}
    }
    rpc_call(state.inner(), method, args).await
}

/// Session statistics: torrent counts, live speeds and cumulative totals.
#[tauri::command]
pub async fn rpc_session_stats(state: State<'_, AppState>) -> Result<Value, String> {
    rpc_call(state.inner(), "session-stats", json!({})).await
}

/// Free space on the daemon host at `path`.
#[tauri::command]
pub async fn rpc_free_space(state: State<'_, AppState>, path: String) -> Result<Value, String> {
    rpc_call(state.inner(), "free-space", json!({ "path": path })).await
}

/// Ask the daemon to test whether its incoming peer port is reachable.
#[tauri::command]
pub async fn rpc_port_test(state: State<'_, AppState>) -> Result<Value, String> {
    rpc_call(state.inner(), "port-test", json!({})).await
}

/// Rename a file or folder inside a torrent (torrent-rename-path).
#[tauri::command]
pub async fn rpc_rename_path(
    state: State<'_, AppState>,
    id: i64,
    path: String,
    name: String,
) -> Result<Value, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("新名称不能为空".into());
    }
    rpc_call(
        state.inner(),
        "torrent-rename-path",
        json!({ "ids": [id], "path": path, "name": name }),
    )
    .await
}

/// Move a torrent's data to another folder on the daemon host.
#[tauri::command]
pub async fn rpc_set_location(
    state: State<'_, AppState>,
    ids: Vec<i64>,
    location: String,
    // `move` is a Rust keyword, so the argument is named `move_data`; the RPC
    // field still has to be called `move`.
    move_data: bool,
) -> Result<Value, String> {
    let location = location.trim();
    if ids.is_empty() {
        return Err("未选择种子".into());
    }
    if location.is_empty() {
        return Err("目标目录不能为空".into());
    }
    rpc_call(
        state.inner(),
        "torrent-set-location",
        json!({ "ids": ids, "location": location, "move": move_data }),
    )
    .await
}

/// Apply a `session-set` patch (server/transfer settings).
#[tauri::command]
pub async fn rpc_set_session(state: State<'_, AppState>, patch: Value) -> Result<Value, String> {
    if !patch.is_object() {
        return Err("session-set 参数必须是对象".into());
    }
    rpc_call(state.inner(), "session-set", patch).await
}

/// Set the label list on the given torrents (torrent-set labels).
#[tauri::command]
pub async fn rpc_set_labels(
    state: State<'_, AppState>,
    ids: Vec<i64>,
    labels: Vec<String>,
) -> Result<Value, String> {
    let cleaned: Vec<String> = labels
        .into_iter()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    rpc_call(
        state.inner(),
        "torrent-set",
        json!({ "ids": ids, "labels": cleaned }),
    )
    .await
}

/// Apply an arbitrary `torrent-set` patch to the given torrents (per-torrent
/// speed limits, bandwidth priority, seed ratio, queue position, …).
#[tauri::command]
pub async fn rpc_torrent_set(
    state: State<'_, AppState>,
    ids: Vec<i64>,
    patch: Value,
) -> Result<Value, String> {
    if !patch.is_object() {
        return Err("torrent-set 参数必须是对象".into());
    }
    if ids.is_empty() {
        return Err("未选择种子".into());
    }
    let mut args = patch;
    args["ids"] = json!(ids);
    rpc_call(state.inner(), "torrent-set", args).await
}

/// Options for adding a torrent. Either `filename` (magnet / URL / a path on
/// the daemon host) or `local_torrent_path` (a .torrent on THIS machine, sent
/// as base64 metainfo) must be provided.
#[derive(Debug, Deserialize)]
pub struct AddTorrentOptions {
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub local_torrent_path: Option<String>,
    #[serde(default)]
    pub download_dir: Option<String>,
    #[serde(default)]
    pub labels: Option<Vec<String>>,
    #[serde(default)]
    pub paused: Option<bool>,
}

/// Add a torrent from a magnet/URL/daemon path or a local .torrent file.
#[tauri::command]
pub async fn rpc_add_torrent(
    state: State<'_, AppState>,
    options: AddTorrentOptions,
) -> Result<Value, String> {
    let mut args = json!({});

    if let Some(path) = options
        .local_torrent_path
        .as_ref()
        .filter(|p| !p.trim().is_empty())
    {
        let bytes = std::fs::read(path).map_err(|e| format!("读取本地种子失败：{e}"))?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        args["metainfo"] = json!(encoded);
    } else if let Some(f) = options.filename.as_ref().filter(|f| !f.trim().is_empty()) {
        args["filename"] = json!(f.trim());
    } else {
        return Err("需要磁力链接/URL/daemon 路径，或选择本地 .torrent 文件".into());
    }

    if let Some(d) = options.download_dir.as_ref().filter(|d| !d.trim().is_empty()) {
        args["download-dir"] = json!(d.trim());
    }
    if let Some(labels) = options.labels {
        let cleaned: Vec<String> = labels
            .into_iter()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        if !cleaned.is_empty() {
            args["labels"] = json!(cleaned);
        }
    }
    if let Some(paused) = options.paused {
        args["paused"] = json!(paused);
    }

    rpc_call(state.inner(), "torrent-add", args).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Live round-trip against a real transmission daemon.
    ///
    /// TRANSMISSION_TEST_USER / _PASS are required — no credentials are baked
    /// into this repository. TRANSMISSION_TEST_URL defaults to a local test
    /// daemon. Ignored by default, because CI runners have no daemon: run it
    /// locally with `cargo test --lib -- --ignored live_rpc_roundtrip`.
    #[ignore = "requires a live transmission daemon"]
    #[tokio::test]
    async fn live_rpc_roundtrip() {
        let base = std::env::var("TRANSMISSION_TEST_URL")
            .unwrap_or_else(|_| "http://localhost:19091/transmission/rpc".to_string());
        let user = std::env::var("TRANSMISSION_TEST_USER").expect("TRANSMISSION_TEST_USER");
        let pass = std::env::var("TRANSMISSION_TEST_PASS").expect("TRANSMISSION_TEST_PASS");

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

            // session-set round trip (idempotent: re-apply the current flag).
            let alt = session
                .get("alt-speed-enabled")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            rpc_call(&state, "session-set", json!({ "alt-speed-enabled": alt }))
                .await
                .expect("session-set");
            println!("session-set ok (alt-speed-enabled={alt})");

            // labels round trip
            rpc_call(
                &state,
                "torrent-set",
                json!({ "ids": [id], "labels": ["p2-verify"] }),
            )
            .await
            .expect("torrent-set labels");
            let lres = rpc_call(
                &state,
                "torrent-get",
                json!({ "ids": [id], "fields": ["labels"] }),
            )
            .await
            .expect("torrent-get labels");
            let labels = &lres["torrents"][0]["labels"];
            println!("labels after set = {labels}");
            assert_eq!(
                labels[0].as_str().unwrap_or(""),
                "p2-verify",
                "labels round trip failed"
            );

            // per-torrent speed limit + priority round trip
            rpc_call(
                &state,
                "torrent-set",
                json!({
                    "ids": [id],
                    "uploadLimited": true,
                    "uploadLimit": 42,
                    "bandwidthPriority": 1
                }),
            )
            .await
            .expect("torrent-set limits");
            let tres = rpc_call(
                &state,
                "torrent-get",
                json!({
                    "ids": [id],
                    "fields": ["uploadLimited", "uploadLimit", "bandwidthPriority"]
                }),
            )
            .await
            .expect("torrent-get limits");
            let t0 = &tres["torrents"][0];
            println!(
                "limits after set = uploadLimited:{} uploadLimit:{} priority:{}",
                t0["uploadLimited"], t0["uploadLimit"], t0["bandwidthPriority"]
            );
            assert_eq!(t0["uploadLimit"].as_i64().unwrap_or(0), 42, "uploadLimit");
            assert_eq!(
                t0["bandwidthPriority"].as_i64().unwrap_or(0),
                1,
                "bandwidthPriority"
            );
        }
    }
}
