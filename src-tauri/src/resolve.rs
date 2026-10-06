//! Reverse DNS (PTR) for peer addresses.
//!
//! Deliberately *not* automatic: the frontend calls this only when the user
//! presses "Resolve host names" on the peers tab. A reverse lookup sends the
//! peer's address to the local resolver, which is new network activity, so it
//! must stay an explicit, visible action.

use std::collections::HashMap;
use std::net::IpAddr;

/// Resolve each address to a host name with a best-effort PTR lookup.
///
/// `getnameinfo` is blocking, so this runs inside `spawn_blocking`; it must not
/// be awaited directly on the async runtime. Addresses with no PTR (or that do
/// not parse) are simply absent from the result, and the UI keeps showing the
/// raw IP for those.
fn resolve_blocking(ips: &[String]) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for ip in ips {
        let Ok(addr) = ip.parse::<IpAddr>() else { continue };
        match dns_lookup::lookup_addr(&addr) {
            Ok(name) => {
                let name = name.trim();
                // `getnameinfo` may echo the numeric address when there is no
                // PTR record; that is "no name", not a result worth showing.
                if !name.is_empty() && name.parse::<IpAddr>().is_err() {
                    out.insert(ip.clone(), name.to_string());
                }
            }
            Err(_) => continue,
        }
    }
    out
}

/// Host name per address, for the addresses that have a PTR record.
#[tauri::command]
pub async fn resolve_host_names(ips: Vec<String>) -> Result<HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || resolve_blocking(&ips))
        .await
        .map_err(|_| "Reverse lookup failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Really performs PTR lookups for a couple of well-known public addresses
    /// and prints what actually came back. The network decides the result, so
    /// the only assertion is that each address either yields a non-empty host
    /// name or is cleanly absent — never a panic or a numeric echo.
    ///
    /// Ignored by default (needs outbound DNS). Run:
    ///   cargo test --lib -- --ignored resolve
    #[test]
    #[ignore = "requires outbound DNS; the answer depends on the local resolver"]
    fn resolve_known_addresses() {
        let ips = vec!["8.8.8.8".to_string(), "1.1.1.1".to_string()];
        let result = resolve_blocking(&ips);
        for ip in &ips {
            match result.get(ip) {
                Some(name) => {
                    println!("{ip} -> {name}");
                    assert!(!name.is_empty(), "{ip} resolved to an empty name");
                    assert!(
                        name.parse::<IpAddr>().is_err(),
                        "{ip} 'resolved' to the numeric address itself"
                    );
                }
                None => println!("{ip} -> (no PTR record; the UI keeps the IP)"),
            }
        }
    }
}
