// Thin typed wrappers over the Tauri commands. One place that knows the
// backend command names and argument shapes.
import { invoke } from "@tauri-apps/api/core";
import type {
  AddTorrentOptions,
  ConnectResult,
  ConnForm,
  FreeSpace,
  PortTest,
  SessionInfo,
  SessionStats,
  Torrent,
  TorrentDetail,
} from "./types";

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
      },
    }),

  disconnect: () => invoke<void>("rpc_disconnect"),

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
};
