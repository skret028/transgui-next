//! Optional country lookup for peer addresses.
//!
//! The database is not bundled — it is a few megabytes of CC BY 4.0 data
//! (DB-IP Lite, via the sapics/ip-location-db release files) and is fetched only
//! when the user explicitly asks for it. Lookups are local: peer addresses never
//! leave this machine.
//!
//! The file is one range per line: `first_ip,last_ip,CC`.

use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

/// Sources to try in order: the raw mirror answers faster than the release
/// asset on some networks (the release redirect is throttled to a crawl here),
/// so both are worth having.
pub const DB_URLS: [&str; 2] = [
    "https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country/dbip-country-ipv4.csv",
    "https://github.com/sapics/ip-location-db/releases/download/latest/dbip-country-ipv4.csv",
];

/// Refuse anything absurd before reading it into memory.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

/// Parsed ranges, sorted by first address. (first, last, country code)
type Table = Vec<(u32, u32, String)>;

#[derive(Default)]
pub struct GeoIp {
    /// None until parsed; cleared when the file changes.
    table: Mutex<Option<Table>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoIpStatus {
    installed: bool,
    entries: usize,
    bytes: u64,
    /// Seconds since the epoch; the frontend formats it.
    updated_at: Option<u64>,
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("geoip");
    Ok(dir.join("dbip-country-ipv4.csv"))
}

fn parse_csv(text: &str) -> Table {
    let mut table: Table = Vec::with_capacity(200_000);
    for line in text.lines() {
        let mut parts = line.trim().split(',');
        let (Some(first), Some(last), Some(cc)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        let (Ok(f), Ok(l)) = (first.parse::<Ipv4Addr>(), last.parse::<Ipv4Addr>()) else {
            continue;
        };
        let cc = cc.trim();
        if cc.len() != 2 {
            continue;
        }
        table.push((u32::from(f), u32::from(l), cc.to_string()));
    }
    table.sort_by_key(|(first, _, _)| *first);
    table
}

fn read_table(path: &PathBuf) -> Result<Table, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(parse_csv(&text))
}

/// Load the cached table, parsing the file the first time it is needed.
fn with_table<T>(
    path: &PathBuf,
    state: &GeoIp,
    f: impl FnOnce(&Table) -> T,
) -> Result<Option<T>, String> {
    let mut guard = state.table.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        if !path.exists() {
            return Ok(None);
        }
        *guard = Some(read_table(path)?);
    }
    Ok(guard.as_ref().map(f))
}

fn status_of(path: &PathBuf, entries: usize) -> GeoIpStatus {
    let meta = std::fs::metadata(path).ok();
    GeoIpStatus {
        installed: meta.is_some(),
        entries,
        bytes: meta.as_ref().map_or(0, |m| m.len()),
        updated_at: meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs()),
    }
}

#[tauri::command]
pub async fn geoip_status(app: AppHandle, state: State<'_, GeoIp>) -> Result<GeoIpStatus, String> {
    let path = db_path(&app)?;
    // The entry count is only known once parsed; do it on demand so the settings
    // screen can show what is installed.
    let entries = with_table(&path, &state, |t| t.len())?.unwrap_or(0);
    Ok(status_of(&path, entries))
}

#[tauri::command]
pub async fn geoip_download(app: AppHandle, state: State<'_, GeoIp>) -> Result<GeoIpStatus, String> {
    let client = reqwest::Client::builder()
        .user_agent("transgui-next/0.1")
        // Without this a throttled mirror hangs the button forever.
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let mut body: Option<String> = None;
    let mut errors: Vec<String> = Vec::new();
    for url in DB_URLS {
        match client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if resp.content_length().is_some_and(|n| n > MAX_BYTES) {
                    errors.push(format!("{url}: file is unexpectedly large"));
                    continue;
                }
                match resp.text().await {
                    Ok(text) => {
                        body = Some(text);
                        break;
                    }
                    Err(e) => errors.push(format!("{url}: {e}")),
                }
            }
            Ok(resp) => errors.push(format!("{url}: HTTP {}", resp.status())),
            Err(e) => errors.push(format!("{url}: {e}")),
        }
    }
    let text = body.ok_or_else(|| format!("download failed — {}", errors.join("; ")))?;
    let table = parse_csv(&text);
    if table.is_empty() {
        return Err("the downloaded file had no usable rows".into());
    }

    let path = db_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    // Write beside the target and rename, so a truncated download never becomes
    // the live database.
    let tmp = path.with_extension("csv.part");
    std::fs::write(&tmp, text.as_bytes()).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("{}: {e}", path.display()))?;

    let entries = table.len();
    *state.table.lock().map_err(|e| e.to_string())? = Some(table);
    Ok(status_of(&path, entries))
}

#[tauri::command]
pub async fn geoip_clear(app: AppHandle, state: State<'_, GeoIp>) -> Result<GeoIpStatus, String> {
    let path = db_path(&app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    }
    *state.table.lock().map_err(|e| e.to_string())? = None;
    Ok(status_of(&path, 0))
}

/// Country code per address, for the addresses we recognise. Unknown or
/// IPv6 addresses are simply absent from the result.
#[tauri::command]
pub async fn geoip_lookup(
    app: AppHandle,
    state: State<'_, GeoIp>,
    ips: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    let path = db_path(&app)?;
    let found = with_table(&path, &state, |table| {
        let mut out = HashMap::new();
        for ip in &ips {
            let Ok(v4) = ip.parse::<Ipv4Addr>() else { continue };
            let n = u32::from(v4);
            // Last entry whose first address is <= n; then check its range.
            let idx = table.partition_point(|(first, _, _)| *first <= n);
            if idx == 0 {
                continue;
            }
            let (_, last, cc) = &table[idx - 1];
            if n <= *last {
                out.insert(ip.clone(), cc.clone());
            }
        }
        out
    })?;
    Ok(found.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ranges_and_skips_junk() {
        let table = parse_csv(
            "1.0.0.0,1.0.0.255,AU\n1.0.1.0,1.0.3.255,CN\n\nnot-a-range\n1.0.4.0,1.0.7.255,XXL\n",
        );
        assert_eq!(table.len(), 2);
        assert_eq!(table[0], (0x01000000, 0x010000ff, "AU".to_string()));
        assert_eq!(table[1], (0x01000100, 0x010003ff, "CN".to_string()));
    }

    #[test]
    fn sorts_and_finds_the_covering_range() {
        let table = parse_csv("1.0.1.0,1.0.3.255,CN\n1.0.0.0,1.0.0.255,AU\n");
        let lookup = |ip: &str| {
            let n = u32::from(ip.parse::<Ipv4Addr>().unwrap());
            let idx = table.partition_point(|(first, _, _)| *first <= n);
            if idx == 0 {
                return None;
            }
            let (_, last, cc) = &table[idx - 1];
            if n <= *last { Some(cc.clone()) } else { None }
        };
        assert_eq!(lookup("1.0.0.7").as_deref(), Some("AU"));
        assert_eq!(lookup("1.0.0.200").as_deref(), Some("AU"));
        assert_eq!(lookup("1.0.1.255").as_deref(), Some("CN"));
        // Past the last range, and before the first range.
        assert_eq!(lookup("1.0.5.0"), None);
        assert_eq!(lookup("0.255.255.255"), None);
    }

    /// Sanity-check the lookup against the real downloaded database.
    ///
    /// Ignored by default (no 6 MB file in CI). Run locally with the path:
    ///   TRANSGUI_GEOIP_DB=~/Library/Application\ Support/com.tk1n.transguinext/geoip/dbip-country-ipv4.csv \
    ///     cargo test --lib -- --ignored geoip_live
    #[test]
    #[ignore = "requires a downloaded country database"]
    fn geoip_live_lookup_matches_known_addresses() {
        let path = PathBuf::from(std::env::var("TRANSGUI_GEOIP_DB").expect("set TRANSGUI_GEOIP_DB"));
        let table = read_table(&path).expect("read the database");
        assert!(
            table.len() > 100_000,
            "suspiciously small database: {} rows",
            table.len()
        );
        let lookup = |ip: &str| -> Option<String> {
            let n = u32::from(ip.parse::<Ipv4Addr>().unwrap());
            let idx = table.partition_point(|(first, _, _)| *first <= n);
            if idx == 0 {
                return None;
            }
            let (_, last, cc) = &table[idx - 1];
            if n <= *last { Some(cc.clone()) } else { None }
        };
        assert_eq!(lookup("223.5.5.5").as_deref(), Some("CN"));
        assert_eq!(lookup("114.114.114.114").as_deref(), Some("CN"));
        assert_eq!(lookup("1.1.1.1").as_deref(), Some("AU"));
        assert_eq!(lookup("8.8.8.8").as_deref(), Some("US"));
    }
}
