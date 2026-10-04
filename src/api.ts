// Thin typed wrappers over the Tauri commands. One place that knows the
// backend command names and argument shapes.
import { invoke } from "@tauri-apps/api/core";
import type { ConnectResult, ConnForm, Torrent, TorrentDetail } from "./types";

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

  torrents: () => invoke<Torrent[]>("rpc_torrents"),

  details: (ids: number[]) => invoke<TorrentDetail[]>("rpc_torrent_details", { ids }),

  action: (action: string, ids: number[]) =>
    invoke<unknown>("rpc_torrent_action", { action, ids }),

  add: (filename: string, downloadDir?: string | null) =>
    invoke<unknown>("rpc_add_torrent", { filename, downloadDir: downloadDir ?? null }),
};
