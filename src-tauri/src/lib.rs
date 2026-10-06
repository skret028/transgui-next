//! Application wiring: plugins, RPC state, system tray, and the global hotkey.

mod geoip;
mod rpc;

use rpc::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

/// Set to true when the user really wants to exit (tray menu), so the close
/// button can hide-to-tray instead of quitting.
pub struct QuitFlag(pub AtomicBool);

/// Whether closing the window hides it to the tray (the default) or quits.
///
/// Pushed from the UI so the Rust close handler can honour the setting without
/// needing the window-destroy capability, which this build does not grant.
pub struct CloseToTray(pub AtomicBool);

#[tauri::command]
fn set_close_to_tray(state: tauri::State<'_, CloseToTray>, hide: bool) {
    state.0.store(hide, Ordering::SeqCst);
}

/// Paths and magnet links the OS asked us to open.
///
/// A file-open request can arrive before the webview has registered its
/// listener (that is the normal case when the app is *launched* by opening a
/// .torrent). Those get parked here and the frontend drains them once it is
/// listening; after that, requests are pushed straight through as events.
#[derive(Default)]
pub struct PendingOpens {
    list: std::sync::Mutex<Vec<String>>,
    frontend_ready: AtomicBool,
}

/// A command-line argument we know how to open.
fn is_openable(arg: &str) -> bool {
    let lower = arg.to_ascii_lowercase();
    lower.ends_with(".torrent") || lower.starts_with("magnet:")
}

fn queue_open(app: &AppHandle, target: String) {
    use tauri::Emitter;
    let Some(state) = app.try_state::<PendingOpens>() else {
        return;
    };
    if state.frontend_ready.load(Ordering::SeqCst) {
        let _ = app.emit("open-torrent", target);
        return;
    }
    // Bind the guard rather than using `if let Ok(g) = ...`: the temporary
    // Result would outlive `state` and fail to borrow-check.
    let mut list = match state.list.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    if !list.contains(&target) {
        list.push(target);
    }
}

/// Run-loop events: macOS and iOS deliver file-open requests here rather than
/// through the command line.
fn handle_run_event(handle: &AppHandle, event: tauri::RunEvent) {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    if let tauri::RunEvent::Opened { urls } = event {
        for url in urls {
            if url.scheme() == "magnet" {
                queue_open(handle, url.to_string());
            } else if let Ok(path) = url.to_file_path() {
                queue_open(handle, path.to_string_lossy().into_owned());
            }
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    let _ = (handle, event);
}

/// Drain the parked open requests. Called once by the frontend on mount, which
/// also marks the frontend as listening for live events.
#[tauri::command]
fn take_pending_opens(state: tauri::State<'_, PendingOpens>) -> Vec<String> {
    state.frontend_ready.store(true, Ordering::SeqCst);
    match state.list.lock() {
        Ok(mut list) => std::mem::take(&mut *list),
        Err(_) => Vec::new(),
    }
}

/// Reveal a path in the OS file manager.
///
/// Done here rather than through the JS opener API on purpose: the JS side
/// would need a filesystem scope wide enough to cover any download directory,
/// while the Rust call has no such restriction and the UI already gates the
/// button on the daemon being local.
#[tauri::command]
fn rpc_reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| e.to_string())
}

/// Write text to a path the user picked (settings export).
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("{path}: {e}"))
}

/// Read a text file the user picked (settings import).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &sep, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("transgui-next")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "hide" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            "quit" => {
                if let Some(flag) = app.try_state::<QuitFlag>() {
                    flag.0.store(true, Ordering::SeqCst);
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

/// Cmd/Ctrl+Shift+T toggles the main window.
fn register_global_shortcut(app: &AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
    let toggle = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyT);
    app.global_shortcut()
        .register(toggle)
        .map_err(|e| e.to_string())?;
    eprintln!("[hotkey] registered Cmd+Shift+T");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install the rustls crypto provider before anything builds a TLS client;
    // mutual TLS needs it and fails otherwise.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state() == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .manage(AppState::new())
        .manage(QuitFlag(AtomicBool::new(false)))
        .manage(CloseToTray(AtomicBool::new(true)))
        .manage(PendingOpens::default())
        .invoke_handler(tauri::generate_handler![
            rpc::rpc_connect,
            rpc::rpc_disconnect,
            rpc::rpc_session,
            rpc::rpc_set_session,
            rpc::rpc_torrents,
            rpc::rpc_torrent_details,
            rpc::rpc_torrent_action,
            rpc::rpc_set_labels,
            rpc::rpc_torrent_set,
            rpc::rpc_add_torrent,
            rpc::rpc_session_stats,
            rpc::rpc_free_space,
            rpc::rpc_port_test,
            rpc::rpc_blocklist_update,
            rpc::rpc_rename_path,
            rpc::rpc_set_location,
            take_pending_opens,
            set_close_to_tray,
            rpc_reveal_path,
            write_text_file,
            read_text_file,
            geoip::geoip_status,
            geoip::geoip_download,
            geoip::geoip_clear,
            geoip::geoip_lookup,
        ])
        .setup(|app| {
            app.manage(geoip::GeoIp::default());
            let handle = app.handle().clone();
            build_tray(&handle)?;
            if let Err(e) = register_global_shortcut(&handle) {
                eprintln!("global shortcut registration failed: {e}");
            }
            // A .torrent path or magnet link on the command line: the Windows
            // and Linux route, and macOS when launched from a shell.
            for arg in std::env::args().skip(1).filter(|a| is_openable(a)) {
                queue_open(&handle, arg);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let handle = window.app_handle();
                let to_tray = handle
                    .try_state::<CloseToTray>()
                    .map(|f| f.0.load(Ordering::SeqCst))
                    .unwrap_or(true);
                if !to_tray {
                    // The user turned the tray behaviour off: close means quit.
                    if let Some(flag) = handle.try_state::<QuitFlag>() {
                        flag.0.store(true, Ordering::SeqCst);
                    }
                    handle.exit(0);
                    return;
                }
                let quitting = window
                    .app_handle()
                    .try_state::<QuitFlag>()
                    .map(|f| f.0.load(Ordering::SeqCst))
                    .unwrap_or(false);
                if !quitting {
                    // Hide to tray instead of quitting.
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(handle_run_event);
}
