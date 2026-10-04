// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod rpc;

use rpc::AppState;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            rpc::rpc_connect,
            rpc::rpc_disconnect,
            rpc::rpc_session,
            rpc::rpc_torrents,
            rpc::rpc_torrent_details,
            rpc::rpc_torrent_action,
            rpc::rpc_add_torrent,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
