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
picker; the torrent list's right-click menu; automatic reconnect after the
daemon drops; filter groups by status, label, directory and tracker; remembered
download directories with a native directory picker; an application menu with a
Help menu and About panel; the original's keyboard shortcuts; 29 UI languages.

## Not a gap: IPv6

An earlier revision of this file listed an `ipv6-enabled` session toggle as
missing. It is not: the original has no such option (no `ipv6` string anywhere
in its source), and Transmission 4.1.3 has no such session field either - it
accepts unknown keys on `session-set` but never reports one back, and
`session-get` returns no `ipv6-enabled`. The row was removed rather than
implemented.

## Gaps

| Feature | Original | State here |
|---|---|---|
| Choose which files to download / per-file priority | `addtorrent`, `torrprops` file grid | **Done** — the files tab has a per-file picker (Don't download / Low / Normal / High) and Select all / Select none, driven by `files-wanted`, `files-unwanted` and `priority-*` |
| Pre-add file selection, "Save as" and a peer limit | `addtorrent.lfm` (`lvFiles`, `edSaveAs`, `edPeerLimit`) | **Done** — the Add dialog hands the torrent to the daemon first (paused), reads its name, file list and peer limit back, and only then asks: the contents grid with Select all / Select none, the chosen-over-total size and the free space where it was put; "Save as" renames the torrent (a rename of its root path, which is how the original does it); the peer limit goes over with the files. A magnet, whose metadata has not arrived, shows a note instead of an empty grid, and backing out drops the torrent again - both as the original behaves. Its Template/Extension box is not carried over: that is a per-directory name pattern used to guess a download folder, not a rename |
| Copy magnet link(s) | `Copy Magnet Link(s)` | **Done** — "More actions… → Copy Magnet Link(s)"; one magnet per selected torrent |
| Connect through a proxy | `connoptions` (proxy server/port/user/password) | **Done** — optional proxy in the connection bar; HTTP proxy for both schemes, credentials attached out-of-band |
| Alternative bandwidth on a schedule | `alt-speed-time-*` | **Done** — enabled / begin / end / day bits in the settings dialog, alongside the manual Alt speeds toggle |
| Sequential download | session `sequential-download` | **Done** — "Download pieces in order" |
| Incomplete-files directory and `.part` renaming | `incomplete-dir*`, `rename-partial-files` | **Done** |
| Disk cache, peer limits, queue sizes, blocklist, scripts, anti-brute-force | session settings | **Done** |
| Port test | `Test port` button | **Done** — Settings → "测试端口", which reaches `port-test` and shows open / not open |
| Reconnect automatically when the connection drops | `Always auto-reconnect` | **Done** — on by default, persisted, in the settings export; a failed poll starts a retry with a growing delay (1s doubling to 30s) |
| Right-click context menu on the list | yes | **Done** — start / stop / verify / reannounce, priority, queue moves, copy magnet, copy hash, labels, properties, remove, remove-with-data |
| The tray menu | `pmTray` | **Done** — show and hide the window, start and stop every torrent, one submenu per direction for the speed limits, the alternative-speed toggle, quit. The original's tray is not its application menu: `pmTray` is its own eleven-item list, and this mirrors it item for item. The two speed submenus are filled from the list the toolbar uses rather than from the original's per-connection `DownSpeeds`/`UpSpeeds` setting, so the tray cannot offer a speed the button beside it does not |
| About / help menu | `about.pas` | **Done** — a native Help menu with check for new version, home page, development site and About, plus an About panel in the app menu where macOS expects it |
| History of download/move directories | `folderhistory.pas` | **Done** — the Add dialog's directory field offers the last 10 (newest first, de-duplicated); kept beside the settings file, not in the exported settings |
| Keyboard shortcuts beyond select-all | the original's `ShortCut` codes | **Done** — the original's bindings key by key: F3/F4 start/stop, Shift+F3 force start, Ctrl+F3/F4 start/stop everything, F8 alternative speeds, Del remove, Alt/Cmd/Shift+Del remove with data, Ins add torrent, F7 labels, Alt+Enter properties, Ctrl+H/N/L priority, Ctrl+I don't download, Ctrl+R reannounce, Ctrl+PgUp/PgDn queue moves (Shift for the ends), Ctrl+Enter show the folder, F9 settings, Ctrl+F12 big toolbar, Ctrl+A select all (`src/shortcuts.ts`, 58 assertions). Two are left out because the UI they need does not exist yet: F2 rename (the original edits the name cell inline) and F6 (move data needs a location dialog) |
| Native folder picker when adding a torrent | `Select a folder for download` | **Done** — a Browse button opens the native directory picker; the path is sent as text (it is a path on this machine, not the daemon's) |
| Group the filter pane by tracker or folder | `Tracker grouping`, `Folder grouping` | **Done** — status, label, download directory and tracker |
| Columns: Seeds, Tracker, Tracker status, Completed on, Last active, Priority, Size to download, ID, Seeding time, Size left, Private, Uploaded | all in the column setup | **Done** — the picker offers 26 columns |
| Peer limit per torrent | `torrprops` "Peer limit" | **Done** — the properties dialog edits `peer-limit`; verified against the daemon (50 → 7 and restored). It is a literal count: 0 means none, not "use the session setting" |
| Stop seeding a torrent when it goes inactive | `torrprops` "Stop seeding when inactive for" | **Done** — the inactivity limit and its mode, with the minutes field enabled only in the custom mode; verified writing mode 1 / 45 minutes and restoring 0 / 30 |
| Copy a file's path to the clipboard | `acCopyPath` (copies the focused file's full path) | **Done** — a copy button on every file row. It copies the mapped local path when the mapping reaches one and the daemon's own path otherwise; the original copies the daemon's |
| Status bar, sizes mode | `acStatusBarSizes` (total size, size to download, downloaded, remaining for the selection) | **Done** — "Status bar fields → Status bar - Sizes": the four sizes, summed over the selection or over what is shown, from the size fields so the parts add up |
| Adding a torrent that is already there | `torrent-duplicate` → offer to merge the link's trackers into the existing torrent | **Done** — a repeat add says so in a dialog, selects the torrent that was already there, and, when the add named trackers that torrent does not have, asks before merging them. The trackers come from the magnet's `tr=` fields or from a local `.torrent` file's announce list, which is read on this side because the daemon never reports it back. Verified: a magnet carrying an extra tracker added exactly that tracker, and so did a `.torrent` file whose announce list had one more |
| Open a file with the OS | `acOpenFile` | **Done** — an open button beside copy-path, offered only when the file is reachable from this machine; verified launching the associated application with the file |

## Deliberate differences

- **A repeat add always opens a dialog, but only asks about trackers when there
  is something to merge.** The original always puts up the same confirmation,
  even when the add named no trackers, in which case answering yes does nothing.
  Telling the user it is already there - and asking only when answering can
  actually change something - keeps the information without the dead question.
- **Remove asks for confirmation only when the data goes with it.** The original
  confirms both; here only the irreversible action does.
- **Daemon and application options are one settings dialog** with sections,
  rather than the original's separate `daemonoptions` / `options` windows.
- **RTL layout is not implemented** — not a gap: the original ships no
  right-to-left locale.
- **Passwords are never written to an exported settings file.** The proxy
  password follows the same rule as the daemon password.
- **Old-server compatibility is not carried over.** The original writes
  `pex-allowed` for RPC versions that predate `pex-enabled` and stores the
  tracker list as `announce-list`; this rewrite targets a current Transmission,
  which wants `pex-enabled` and `trackerList` / `trackers`.
- **Hiding the menu bar** (`acMenuShow`) is not implemented. It is for
  platforms where the menu belongs to the window; on macOS the menu bar is the
  system's and the About/Help/Edit items have to stay reachable.
- **Country flags are emoji** computed from the GeoIP country code rather than a
  downloaded `flags.zip`, and country resolution happens whenever the GeoIP
  database is present instead of behind a toggle.

## Ahead of the original

The session surface is a superset: the rewrite also exposes the settings a
current Transmission has that the original predates — anti-brute-force limits,
default trackers, per-event scripts (added / done / done-seeding),
`start-added-torrents`, `trash-original-torrent-files` and sequential download.
