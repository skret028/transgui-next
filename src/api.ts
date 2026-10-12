// Thin typed wrappers over the Tauri commands. One place that knows the
// backend command names and argument shapes.
import { invoke } from "@tauri-apps/api/core";
import type {
  AddTorrentOptions,
  ConnectResult,
  ConnForm,
  FreeSpace,
  HandlerState,
  PortTest,
  SessionInfo,
  SessionStats,
  Torrent,
  TorrentDetail,
  WatchScan,
} from "./types";

/** What the tray's menu is built from; the field names match the Rust struct. */
export interface TraySync {
  connected: boolean;
  alt_speed: boolean;
  down_enabled: boolean;
  down_kbps: number;
  up_enabled: boolean;
  up_kbps: number;
  speeds: number[];
}

export const rpc = {
  connect: (form: ConnForm) =>
    invoke<ConnectResult>("rpc_connect", {
      config: {
        host: form.host,
        port: Number(form.port),
        path: form.path,
        username: form.username,
        password: form.password,
        https: form.https,
        accept_invalid_certs: form.acceptInvalid,
        client_cert: form.clientCert,
        client_key: form.clientKey,
        proxy_enabled: form.proxyEnabled,
        proxy_host: form.proxyHost,
        proxy_port: form.proxyPort ? Number(form.proxyPort) : null,
        proxy_username: form.proxyUsername,
        proxy_password: form.proxyPassword,
        socks5: form.socks5,
      },
    }),

  disconnect: () => invoke<void>("rpc_disconnect"),

  /** Tells the backend whether closing the window should hide it to the tray. */
  setCloseToTray: (hide: boolean) => invoke<void>("set_close_to_tray", { hide }),

  /**
   * Level the tray menu with the daemon's session. The speed limits and the
   * alternative-speed flag live in the daemon, so the window owns them and
   * pushes them down; the backend rebuilds the menu only when something
   * actually changed.
   */
  setTrayState: (sync: TraySync) => invoke<void>("set_tray_state", { sync }),

  /** Tells the backend whether the tray icon stays visible while the window is shown. */
  setTrayAlwaysVisible: (always: boolean) =>
    invoke<void>("set_tray_always_visible", { always }),

  session: () => invoke<SessionInfo>("rpc_session"),

  setSession: (patch: Record<string, unknown>) =>
    invoke<unknown>("rpc_set_session", { patch }),

  torrents: () => invoke<Torrent[]>("rpc_torrents"),

  details: (ids: number[]) => invoke<TorrentDetail[]>("rpc_torrent_details", { ids }),

  action: (action: string, ids: number[]) =>
    invoke<unknown>("rpc_torrent_action", { action, ids }),

  setLabels: (ids: number[], labels: string[]) =>
    invoke<unknown>("rpc_set_labels", { ids, labels }),

  setTorrent: (ids: number[], patch: Record<string, unknown>) =>
    invoke<unknown>("rpc_torrent_set", { ids, patch }),

  add: (options: AddTorrentOptions) => invoke<unknown>("rpc_add_torrent", { options }),
  /** The trackers named inside a local .torrent file (empty if unreadable). */
  torrentFileTrackers: (path: string) => invoke<string[]>("rpc_torrent_file_trackers", { path }),

  sessionStats: () => invoke<SessionStats>("rpc_session_stats"),

  freeSpace: (path: string) => invoke<FreeSpace>("rpc_free_space", { path }),

  portTest: () => invoke<PortTest>("rpc_port_test"),

  /** Re-download the daemon's blocklist; returns { "blocklist-size": n }. */
  blocklistUpdate: () => invoke<{ "blocklist-size"?: number }>("rpc_blocklist_update"),

  renamePath: (id: number, path: string, name: string) =>
    invoke<unknown>("rpc_rename_path", { id, path, name }),

  setLocation: (ids: number[], location: string, moveData: boolean) =>
    invoke<unknown>("rpc_set_location", { ids, location, moveData }),

  /** Reveal a path in the OS file manager (only meaningful for a local daemon). */
  revealPath: (path: string) => invoke<unknown>("rpc_reveal_path", { path }),
  openPath: (path: string) => invoke<unknown>("rpc_open_path", { path }),
  removeFile: (path: string) => invoke<unknown>("rpc_remove_file", { path }),
  /** What the watched folder holds right now; see the command for the rules. */
  watchScan: (folder: string) => invoke<WatchScan>("watch_scan", { folder }),

  /** Who the system opens magnet links and .torrent files with. */
  handlerState: () => invoke<HandlerState>("rpc_handler_state"),
  setHandler: (kind: "magnet" | "torrent", on: boolean) =>
    invoke<HandlerState>("rpc_set_handler", { kind, on }),

  /** Settings export/import: plain text files at paths the user picked. */
  writeTextFile: (path: string, contents: string) =>
    invoke<unknown>("write_text_file", { path, contents }),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),

  /** Optional country database: downloaded on demand, looked up locally. */
  geoipStatus: () => invoke<GeoIpStatus>("geoip_status"),
  geoipDownload: () => invoke<GeoIpStatus>("geoip_download"),
  geoipClear: () => invoke<GeoIpStatus>("geoip_clear"),
  geoipLookup: (ips: string[]) => invoke<Record<string, string>>("geoip_lookup", { ips }),

  /** Reverse DNS (PTR) for peer addresses. Explicit trigger; blocking on the
   * Rust side, so the call can take a moment. */
  resolveHostNames: (ips: string[]) =>
    invoke<Record<string, string>>("resolve_host_names", { ips }),

  /** Compare this build against the latest public GitHub release. */
  checkForUpdates: () => invoke<UpdateInfo>("check_for_updates"),
};

export interface GeoIpStatus {
  installed: boolean;
  entries: number;
  bytes: number;
  /** Seconds since the epoch, or null when not installed. */
  updatedAt: number | null;
}

export interface UpdateInfo {
  /** This build's version. */
  current: string;
  /** The latest release's tag. */
  latest: string;
  /** Whether a newer version is available. */
  newer: boolean;
  /** Release page to open for details. */
  url: string;
}
