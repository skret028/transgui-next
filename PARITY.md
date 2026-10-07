# Feature parity with transgui

transgui-next is a rewrite of [transgui](https://github.com/transmission-remote-gui/transgui)
(Lazarus/Free Pascal). This file tracks what has been carried over and what has
not, so "is it done yet?" has an answer that is not a guess.

## How this list was produced

The original's full UI vocabulary is its translation template
(`lang/transgui.template`, 393 entries) plus the forms under `*.pas` /
`*.lfm`; that is the feature surface. Each item was then checked against this
repository's source — the rewrite's own locale files (`src/locales/`) are
excluded on purpose, because they were imported wholesale from the original and
so say nothing about what is actually implemented.

Regenerate the raw diff with:

```sh
cd /Volumes/970/dev_files/other/transgui-next
python3 - <<'PY'
import os
def parse(p):
    out=[]
    for ln in open(p, encoding="utf-8", errors="replace"):
        ln=ln.rstrip("\n")
        if not ln or ln.startswith("TranslationLanguage"): continue
        if ln.startswith('"'):
            i=1
            while i < len(ln) and ln[i] != '"':
                if ln[i]=="\\": i+=1
                i+=1
            key=ln[1:i]
        else:
            if "=" not in ln: continue
            key=ln.split("=",1)[0]
        if key.strip(): out.append(key)
    return list(dict.fromkeys(out))
files=[]
for root,dirs,fs in os.walk("src"):
    dirs[:] = [d for d in dirs if d != "locales"]
    for f in fs:
        if f.endswith((".ts",".tsx",".js",".jsx")): files.append(os.path.join(root,f))
src="\n".join(open(f,encoding="utf-8",errors="replace").read() for f in files)
orig=parse("../transgui/lang/transgui.template")
print("\n".join(s for s in orig if s not in src))
PY
```

Accelerator-only strings (`&About`, `E&xit`) and printf formats (`%ds`) are
noise in that output — this rewrite drops `&` accelerators and uses `{var}`
interpolation.

## Carried over

RPC client and connection handling (multiple saved servers, HTTPS, client
certificates, mutual TLS, invalid-cert opt-in); session settings (directories,
speed limits, alternative speeds, encryption, DHT/PEX/LPD/µTP, queues, ratio
limits, blocklist, scripts, port); torrent list with sort / filter / multi-select
/ column picker; details panel (general, files, peers, trackers) with tracker
add / edit / remove, file rename, and move-data; add torrents from a magnet, a
URL, a local `.torrent`, drag-and-drop, or a link handed over by the OS;
per-torrent properties (bandwidth priority, speed limits, honour-global, seed
ratio, queue position, labels, peer limit); label editing; global statistics;
GeoIP country flags; reverse DNS for peers; port self-test; update check;
settings export/import; clipboard watcher; tray icon, close-to-tray, global
hotkey; smoothed transfer speeds; reduced polling while hidden; status-bar field
picker; 29 UI languages.

## Gaps

| Feature | Original | State here |
|---|---|---|
| Choose which files to download / per-file priority | `addtorrent`, `torrprops` file grid | **Done** — the files tab has a per-file picker (Don't download / Low / Normal / High) and Select all / Select none, driven by `files-wanted`, `files-unwanted` and `priority-*` |
| Copy magnet link(s) | `Copy Magnet Link(s)` | **Done** — "More actions… → Copy Magnet Link(s)"; one magnet per selected torrent |
| Connect through a proxy | `connoptions` (proxy server/port/user/password) | **Done** — optional proxy in the connection bar; HTTP proxy for both schemes, credentials attached out-of-band |
| Alternative bandwidth on a schedule | `alt-speed-time-*` | **Done** — enabled / begin / end / day bits in the settings dialog, alongside the manual Alt speeds toggle |
| Sequential download | session `sequential-download` | **Done** — "Download pieces in order" |
| Incomplete-files directory and `.part` renaming | `incomplete-dir*`, `rename-partial-files` | **Done** |
| Disk cache, peer limits, queue sizes, blocklist, scripts, anti-brute-force | session settings | **Done** |
| Port test | `Test port` button | **Backend only** — the `port-test` RPC command exists and works, but no UI reaches it |
| Reconnect automatically when the connection drops | `Always auto-reconnect` | **Open** — a dropped connection stays dropped until the user reconnects |
| Right-click context menu on the list | yes | **Open** — no `onContextMenu` anywhere |
| About / help menu (about, home page, development site, license, donate) | `about.pas` | **Open** — the only menu is the tray's show/hide/quit |
| History of download/move directories | `folderhistory.pas` | **Open** |
| Keyboard shortcuts beyond select-all | Ctrl+F9 options, Del to remove, … | **Partial** — `Cmd/Ctrl+A` and the global `Cmd/Ctrl+Shift+T` only |
| Native folder picker when adding a torrent | `Select a folder for download` | **Open** — the Add dialog's picker selects a `.torrent` file; the download directory is typed |
| Group the filter pane by tracker or folder | `Tracker grouping`, `Folder grouping` | **Open** — grouped by status, label and directory only |
| Columns: Seeds, Tracker, Tracker status, Completed on, Last active, Priority, Size to download, ID, Seeding time, Size left, Private, Uploaded | all in the column setup | **Open** — the picker offers 14 columns (name, status, size, progress, download, upload, ratio, remaining, labels, peer, added, downloaded, queue position, directory); these are absent |
| IPv6 session toggle | `ipv6-enabled` | **Open** |

## Deliberate differences

- **Remove asks for confirmation only when the data goes with it.** The original
  confirms both; here only the irreversible action does.
- **Daemon and application options are one settings dialog** with sections,
  rather than the original's separate `daemonoptions` / `options` windows.
- **RTL layout is not implemented** — not a gap: the original ships no
  right-to-left locale.
- **Passwords are never written to an exported settings file.** The proxy
  password follows the same rule as the daemon password.
