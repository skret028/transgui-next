# transgui-next

A modern rewrite of [transgui](https://github.com/transmission-remote-gui/transgui) —
a remote GUI for the [Transmission](https://transmissionbt.com/) BitTorrent client.

The original is a 16-year-old Lazarus/Free Pascal application (`TMainForm` alone is
~8,900 lines, plus a vendored network stack and zero tests). This rewrite keeps the
part that matters — the Transmission RPC client — and rebuilds the UI on a stack
that is actually maintained.

**Status: work in progress.** Milestones P0–P5 are done; cross-platform packaging
is being wired up.

## Stack

| Layer | Choice |
|---|---|
| Shell | [Tauri v2](https://v2.tauri.app/) (Rust, native webview) |
| Backend | Rust — async `reqwest` RPC client, always off the UI thread |
| Frontend | React 19 + TypeScript + Vite |

The RPC client and the UI are fully decoupled: the Rust side owns the connection,
the session id and the credentials, and the frontend only ever sees torrent data.

## Features

- Torrent list with sort / filter / multi-select, live details panel
  (general, files, peers, trackers)
- Add torrents from a magnet link, a URL, a local `.torrent` file, or by
  drag-and-drop onto the window
- Per-torrent properties (speed limits, bandwidth priority, queue position,
  seed ratio) and label editing
- Server / transfer settings (dirs, speed limits, alternative speeds, network,
  encryption, DHT/PEX/LPD/µTP, ratio limit)
- Multiple saved servers, system tray, close-to-tray, global hotkey
  (`Cmd/Ctrl+Shift+T`)
- 29 UI languages, imported from the original project's translation files

## Requirements

- Rust (stable) and Node 22+ with pnpm
- Platform webview: WebKit (macOS), WebView2 (Windows), WebKitGTK 4.1 (Linux)

On Debian/Ubuntu:

```sh
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev libgtk-3-dev patchelf
```

## Development

```sh
pnpm install
pnpm tauri dev        # runs Vite + the Rust app with hot reload
```

Point it at a Transmission daemon (`localhost:9091` by default) and connect.

## Building

```sh
pnpm tauri build                                  # bundle for the current platform
pnpm tauri build --target aarch64-apple-darwin    # or a specific target
```

## Tests

```sh
cd src-tauri && cargo test --lib
```

There is one extra test that talks to a real daemon. It is `#[ignore]`d so CI stays
green, and can be run on purpose:

```sh
cd src-tauri && cargo test --lib -- --ignored live_rpc_roundtrip
# override the target with TRANSMISSION_TEST_URL / _USER / _PASS
```

## Translations

English source strings double as translation keys, which is what makes reusing the
original project's 29 locale files possible — their format is `English text=Translation`.

- `src/locales/<code>.json` — dictionaries (`key: translation`)
- `src/i18n.tsx` — `t()` with `{var}` interpolation; `zh-CN` is bundled, the rest
  load on demand

Re-import (or update) the locales from a transgui checkout:

```sh
pnpm i18n:import ../transgui
```

The importer merges over existing files, so local edits are never clobbered. Keys
missing from a dictionary fall back to the English source text, so a partial
translation degrades gracefully instead of blanking the UI.

## CI

- `.github/workflows/ci.yml` — type-check + build the frontend and run the Rust
  tests on Linux, macOS and Windows
- `.github/workflows/release.yml` — on a `v*` tag, builds installers for macOS
  (Apple Silicon + Intel), Linux and Windows and attaches them to a draft release

Builds are **unsigned**: macOS may need right-click → Open the first time, and
Windows may show a SmartScreen warning.

## License

GPL-2.0. This is a derived work of
[transgui](https://github.com/transmission-remote-gui/transgui), which is licensed
under the GPL-2.0 — see [LICENSE](LICENSE).
