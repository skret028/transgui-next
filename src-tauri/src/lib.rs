//! Application wiring: plugins, RPC state, system tray, and the global hotkey.

mod geoip;
mod default_handler;
mod resolve;
mod rpc;
mod update;

use rpc::AppState;
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{
    AboutMetadataBuilder, CheckMenuItem, Menu, MenuBuilder, MenuItem, MenuItemBuilder,
    PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

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

/// Whether the tray icon stays visible even while the main window is shown.
///
/// Defaults to on (the icon is always there, as before). Pushed from the UI so
/// the Rust side owns every show/hide transition of the window and can keep the
/// icon in sync without the JS tray capability.
pub struct TrayAlwaysVisible(pub AtomicBool);

impl Default for TrayAlwaysVisible {
    fn default() -> Self {
        Self(AtomicBool::new(true))
    }
}

/// Match the tray icon's visibility to the setting and the window's state.
///
/// With the setting on the icon is always shown. With it off the icon is hidden
/// while the window is visible and restored once the window is hidden, so the
/// user can always bring the window back from the tray.
fn apply_tray_visibility(app: &AppHandle) {
    let always = app
        .try_state::<TrayAlwaysVisible>()
        .map(|f| f.0.load(Ordering::SeqCst))
        .unwrap_or(true);
    let window_visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(true);
    if let Some(tray) = app.tray_by_id("main") {
        // A failure here is not fatal: the icon simply keeps its current state.
        let _ = tray.set_visible(always || !window_visible);
    }
}

#[tauri::command]
fn set_tray_always_visible(app: AppHandle, state: tauri::State<'_, TrayAlwaysVisible>, always: bool) {
    state.0.store(always, Ordering::SeqCst);
    apply_tray_visibility(&app);
}

/// What the tray's menu was last built from.
///
/// The speed limits and the alternative-speed flag belong to the daemon, not to
/// this process, so the window pushes them down whenever they change.
/// Remembering the last payload is what keeps a menu rebuild from happening on
/// every poll.
#[derive(Clone, Default, Deserialize, PartialEq)]
struct TraySync {
    connected: bool,
    alt_speed: bool,
    down_enabled: bool,
    down_kbps: u32,
    up_enabled: bool,
    up_kbps: u32,
    speeds: Vec<u32>,
}

pub struct TrayState(Mutex<TraySync>);

/// Level the tray menu with the daemon's session settings.
///
/// Rebuilt rather than poked item by item: there are a dozen entries, the values
/// change only when the user changes them, and a rebuild cannot leave a stale
/// checkmark behind. The original syncs its tray the same way, from the same
/// session fields, on every settings refresh.
#[tauri::command]
fn set_tray_state(
    app: AppHandle,
    state: tauri::State<'_, TrayState>,
    sync: TraySync,
) -> Result<(), String> {
    let mut next = sync;
    next.speeds.sort_unstable();
    next.speeds.dedup();
    {
        let current = state.0.lock().map_err(|e| e.to_string())?;
        if *current == next {
            return Ok(());
        }
    }
    let menu = build_tray_menu(&app, &next).map_err(|e| e.to_string())?;
    let tray = app.tray_by_id("main").ok_or("the tray icon is gone")?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = next;
    Ok(())
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

/// Delete a local file.
///
/// Only ever called with a path the file picker handed the app - the `.torrent`
/// the user just added, when they have asked for it to go. The webview is this
/// app's own UI, so this is no wider than the open/reveal commands beside it.
#[tauri::command]
fn rpc_remove_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("{path}: {e}"))
}

/// What a scan of the watched folder found.
#[derive(serde::Serialize)]
pub struct WatchScan {
    /// The folder is set, and it is there.
    exists: bool,
    /// It can be written to. The original insists on this, and for a reason:
    /// with "delete the .torrent after a successful addition" on, a file that
    /// cannot be removed would be offered again on every scan forever.
    writable: bool,
    /// The `.torrent` files directly in it, name-sorted so the order is the
    /// same on every scan rather than whatever the filesystem feels like.
    files: Vec<String>,
}

/// List the `.torrent` files in the watched folder.
///
/// Read-only, and only what is directly in the folder - the original scans the
/// one folder with a `*.torrent` pattern and nothing deeper. The files come back
/// as paths; what happens to them is the frontend's ordinary Add dialog, the
/// same as a file the user opened themselves.
#[tauri::command]
fn watch_scan(folder: String) -> WatchScan {
    let trimmed = folder.trim();
    let path = std::path::Path::new(trimmed);
    if trimmed.is_empty() || !path.is_dir() {
        return WatchScan { exists: false, writable: false, files: Vec::new() };
    }
    // `readonly` is the owner's write bit, which is the check that matters for a
    // folder this app is meant to be able to empty.
    let writable = std::fs::metadata(path).map(|m| !m.permissions().readonly()).unwrap_or(false);
    if !writable {
        return WatchScan { exists: true, writable: false, files: Vec::new() };
    }
    let mut files: Vec<String> = std::fs::read_dir(path)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.is_file()
                        && p.file_name()
                            .map(|n| n.to_string_lossy().to_lowercase().ends_with(".torrent"))
                            .unwrap_or(false)
                })
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    files.sort();
    WatchScan { exists: true, writable: true, files }
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

/// Open a file with whatever the system associates with it.
///
/// Same reasoning as reveal: the local path is computed on the JS side from the
/// path mapping, and the Rust call avoids needing a filesystem scope wide enough
/// to cover any download directory.
#[tauri::command]
fn rpc_open_path(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(&path, None::<&str>)
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
    apply_tray_visibility(app);
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
    apply_tray_visibility(app);
}

/// One speed submenu of the tray: unlimited, then every preset, with the speed
/// in force checked.
///
/// The original builds these the same way from the session's own limits and
/// tags unlimited as -1; the preset list here is the toolbar's, handed over by
/// the window, so the tray cannot offer a speed the button beside it does not.
fn tray_speed_submenu(
    app: &AppHandle,
    prefix: &str,
    title: &str,
    speeds: &[u32],
    enabled: bool,
    current: u32,
    connected: bool,
) -> tauri::Result<Submenu<tauri::Wry>> {
    let mut builder = SubmenuBuilder::new(app, title).enabled(connected);
    let unlimited = CheckMenuItem::with_id(
        app,
        format!("{prefix}:-1"),
        "无限",
        true,
        connected && !enabled,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    builder = builder.item(&unlimited).item(&separator);
    for kbps in speeds {
        let item = CheckMenuItem::with_id(
            app,
            format!("{prefix}:{kbps}"),
            format!("{kbps} KB/s"),
            true,
            connected && enabled && *kbps == current,
            None::<&str>,
        )?;
        builder = builder.item(&item);
    }
    builder.build()
}

/// The tray's menu, mirroring the original's `pmTray`: show and hide the window,
/// start and stop everything, one submenu per direction for the speed limits,
/// the alternative-speed toggle, and quit.
///
/// The original's tray is not the application menu - it is this shorter list,
/// wired to the same eighteen items by hand.
fn build_tray_menu(app: &AppHandle, sync: &TraySync) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let start_all = MenuItem::with_id(app, "start_all", "开始所有", sync.connected, None::<&str>)?;
    let stop_all = MenuItem::with_id(app, "stop_all", "停止所有", sync.connected, None::<&str>)?;
    let alt_speed = CheckMenuItem::with_id(
        app,
        "alt_speed",
        "替代速度",
        sync.connected,
        sync.alt_speed,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let down = tray_speed_submenu(
        app,
        "down_speed",
        "最大下载速度",
        &sync.speeds,
        sync.down_enabled,
        sync.down_kbps,
        sync.connected,
    )?;
    let up = tray_speed_submenu(
        app,
        "up_speed",
        "最大上传速度",
        &sync.speeds,
        sync.up_enabled,
        sync.up_kbps,
        sync.connected,
    )?;

    MenuBuilder::new(app)
        .item(&show)
        .item(&hide)
        .separator()
        .item(&start_all)
        .item(&stop_all)
        .separator()
        .item(&down)
        .item(&up)
        .item(&alt_speed)
        .separator()
        .item(&quit)
        .build()
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_tray_menu(app, &TraySync::default())?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("transgui-next")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "show" => show_main_window(app),
                "hide" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                    }
                    apply_tray_visibility(app);
                }
                "quit" => {
                    if let Some(flag) = app.try_state::<QuitFlag>() {
                        flag.0.store(true, Ordering::SeqCst);
                    }
                    app.exit(0);
                }
                // Everything below acts on the daemon, which the window owns:
                // the tray asks the window to run the very helper the toolbar
                // button runs, so the two cannot drift apart.
                "start_all" => {
                    let _ = app.emit("tray://start-all", ());
                }
                "stop_all" => {
                    let _ = app.emit("tray://stop-all", ());
                }
                "alt_speed" => {
                    // The check mark flips itself on macOS; the daemon remains
                    // the authority and the window pushes the truth back down.
                    let _ = app.emit("tray://alt-speed", ());
                }
                other => {
                    // `<direction>_speed:<kbps>`, with -1 for unlimited.
                    if let Some((which, kbps)) = other.split_once(':') {
                        let direction = match which {
                            "down_speed" => Some("down"),
                            "up_speed" => Some("up"),
                            _ => None,
                        };
                        if let (Some(direction), Ok(kbps)) = (direction, kbps.parse::<i64>()) {
                            let _ = app.emit("tray://set-speed", (direction, kbps));
                        }
                    }
                }
            }
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

/// The application menu.
///
/// Setting a custom menu replaces Tauri's default, so the standard Edit items
/// have to be built back in: without them a WKWebView loses cut/copy/paste in
/// every text field, which is a worse regression than a missing Help menu.
/// Help carries what the original's did - a link to the project's home page
/// and to the original it is a rewrite of - plus a native About panel.
fn build_app_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // Built twice on purpose: the app menu keeps About where macOS expects to
    // find it, and Help carries one too, which is where the original puts it.
    let about_meta = || {
        AboutMetadataBuilder::new()
            .name(Some("transgui-next"))
            .version(Some(env!("CARGO_PKG_VERSION")))
            .comments(Some("Remote control for the Transmission BitTorrent daemon"))
            .license(Some("GNU General Public License v2.0"))
            .website(Some("https://github.com/skret028/transgui-next"))
            .build()
    };

    let app_menu = SubmenuBuilder::new(app, "transgui-next")
        .item(&PredefinedMenuItem::about(
            app,
            Some("关于 transgui-next"),
            Some(about_meta()),
        )?)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("服务"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("隐藏 transgui-next"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("显示全部"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("退出 transgui-next"))?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .item(&PredefinedMenuItem::undo(app, Some("撤销"))?)
        .item(&PredefinedMenuItem::redo(app, Some("重做"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("剪切"))?)
        .item(&PredefinedMenuItem::copy(app, Some("复制"))?)
        .item(&PredefinedMenuItem::paste(app, Some("粘贴"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("全选"))?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "窗口")
        .item(&PredefinedMenuItem::minimize(app, Some("最小化"))?)
        .item(&PredefinedMenuItem::maximize(app, Some("缩放"))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("关闭窗口"))?)
        .build()?;

    // The original's Help menu: check for a new version, home page, the
    // development site, then About.
    let help_menu = SubmenuBuilder::new(app, "帮助")
        .item(&MenuItemBuilder::with_id("help_check_updates", "检查新版本").build(app)?)
        .item(&MenuItemBuilder::with_id("help_home", "访问主页").build(app)?)
        .item(&MenuItemBuilder::with_id("help_dev", "开发网站").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("help_license", "许可证").build(app)?)
        .item(&PredefinedMenuItem::about(
            app,
            Some("关于 transgui-next"),
            Some(about_meta()),
        )?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &edit_menu, &window_menu, &help_menu])
        .build()
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        // Where the window was and how big it was. The two pane sizes are the
        // app's own settings, not this plugin's business.
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
        .manage(TrayAlwaysVisible::default())
        .manage(TrayState(Mutex::new(TraySync::default())))
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
            rpc::rpc_torrent_file_trackers,
            rpc::rpc_session_stats,
            rpc::rpc_free_space,
            rpc::rpc_port_test,
            rpc::rpc_blocklist_update,
            rpc::rpc_rename_path,
            rpc::rpc_set_location,
            take_pending_opens,
            set_close_to_tray,
            set_tray_always_visible,
            set_tray_state,
            rpc_reveal_path,
            rpc_open_path,
            rpc_remove_file,
            watch_scan,
            write_text_file,
            read_text_file,
            geoip::geoip_status,
            geoip::geoip_download,
            geoip::geoip_clear,
            geoip::geoip_lookup,
            default_handler::rpc_handler_state,
            default_handler::rpc_set_handler,
            resolve::resolve_host_names,
            update::check_for_updates,
        ])
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            use tauri_plugin_opener::OpenerExt;
            match event.id().as_ref() {
                "help_check_updates" => {
                    // The window owns the update check (it needs the notice
                    // line to show the result), so the menu only asks for it.
                    let _ = app.emit("menu://check-updates", ());
                }
                "help_home" => {
                    let _ = app.opener().open_url(
                        "https://github.com/transmission-remote-gui/transgui",
                        None::<&str>,
                    );
                }
                "help_dev" => {
                    let _ = app
                        .opener()
                        .open_url("https://github.com/skret028/transgui-next", None::<&str>);
                }
                "help_license" => {
                    // The original has this as a tab of its About dialog; a
                    // window of its own is where the webview can show it.
                    let _ = app.emit("menu://license", ());
                }
                _ => {}
            }
        })
        .setup(|app| {
            app.manage(geoip::GeoIp::default());
            let handle = app.handle().clone();
            build_tray(&handle)?;
            apply_tray_visibility(&handle);
            if let Err(e) = register_global_shortcut(&handle) {
                eprintln!("global shortcut registration failed: {e}");
            }
            // A .torrent path or magnet link on the command line: the Windows
            // and Linux route, and macOS when launched from a shell.
            for arg in std::env::args().skip(1).filter(|a| is_openable(a)) {
                queue_open(&handle, arg);
            }
            // Magnet links are URLs, and macOS delivers those as an Apple Event
            // rather than a file-open, so they never reach RunEvent::Opened -
            // which is why a .torrent arrived while a magnet quietly did
            // nothing. The deep-link plugin owns that event; this is where it
            // hands what it caught over to the same queue, so a magnet goes to
            // the Add dialog whether the app was running or is being woken by
            // the link.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    queue_open(&handle, url.to_string());
                }
            });
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
                    apply_tray_visibility(handle);
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(handle_run_event);
}
