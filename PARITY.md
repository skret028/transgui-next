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
download directories with a native directory picker; the original's menu bar - File, View, Tools and Help, with its items and
accelerators; 29 UI languages.

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
| The connection settings | `connoptions.lfm` (`TConnOptionsForm`): saved connections on top, then the Connection, Proxy, Paths and Misc pages | **Done** for the two pages that hold the connection itself - File → Manage connections… opens a dialog with the saved connections across the top (Bookmark / Rename / Delete) and the Connection page (host, port, user, password, HTTPS, client certificate, private key) and Proxy page (server, port, user, password, SOCKS 5). The main window carries no connection row at all, which is how the original is built: `main.lfm` has no host or port control, only the toolbar's connect button and the status bar, and the connection editor has always been this dialog. The original's `tbConnect` is on the toolbar: connected it shows the connection it is on and pressing it opens the saved ones, disconnected it reads Connect to \"%s\" and connects - the same caption swap and the same `CheckMenuDropdown` branch `acConnectExecute` has - with its own arrow for the list and Manage connections… at the bottom; disconnecting is the File menu's, as it is in the original. The original's Paths page (remote to local path mappings) and Misc page (the two translation switches) are not carried over; the directory-history limit and the auto-reconnect switch live in the settings dialog instead, and the RPC path, the invalid-certificate opt-in and the ask-for-password box are back-end settings here without a field of their own. |
| Connect through a proxy | `connoptions` (proxy server/port/user/password) | **Done** — optional proxy on the Proxy page of the connections dialog; HTTP proxy for both schemes, credentials attached out-of-band |
| Alternative bandwidth on a schedule | `alt-speed-time-*` | **Done** — enabled / begin / end / day bits in the settings dialog, alongside the manual Alt speeds toggle |
| Sequential download | session `sequential-download` | **Done** — "Download pieces in order" |
| Incomplete-files directory and `.part` renaming | `incomplete-dir*`, `rename-partial-files` | **Done** |
| Disk cache, peer limits, queue sizes, blocklist, scripts, anti-brute-force | session settings | **Done** |
| Port test | `Test port` button | **Done** — Settings → "测试端口", which reaches `port-test` and shows open / not open |
| Reconnect automatically when the connection drops | `Always auto-reconnect` | **Done** — on by default, persisted, in the settings export; a failed poll starts a retry with a growing delay (1s doubling to 30s) |
| Right-click context menu on the list | yes | **Done** — in the original's own order: open, open containing folder, start, force start, stop, remove, remove-and-delete, priority, queue moves, reannounce, verify, copy magnet, copy hash, set data location, labels, rename, properties, modify trackers, columns. "Open" opens the torrent's own path (the file itself for a single-file torrent, its folder otherwise, which is what the original resolves after looking the file list up) and "Open containing folder" shows the download directory. Both use the path mapping and say so when there is none |

| Trackers as an editable list | `torrprops.lfm` `edTrackers`, "Modify trackers…" | **Done** — the properties dialog carries the trackers as one announce URL per line; Apply diffs that against what the torrent has and sends `trackerAdd`, `trackerReplace` and `trackerRemove` together, using the original's pairing rules: a line matching a tracker already there is dropped from both sides, so an untouched tracker keeps its id (and its scrape history), then the leftovers are paired up in order and the remainder added or removed. Untestable trackers - ones the daemon gave no id for - are matched but never replaced or removed. The list's "Modify trackers…" opens the same dialog, as the original's menu item does |
| Asking for a password the daemon refuses | `passwcon` | **Done** — a 401 raises a prompt naming the host, with a masked field and a retry; it stays up with the refusal shown inline until the password works or it is dismissed, and the auto-reconnect stands aside while it is open. The original only asks when the saved password is literally `-` (ask-every-time); this asks whenever the daemon refuses the one it has, which is the case someone actually hits |
| The tray menu | `pmTray` | **Done** — show and hide the window, start and stop every torrent, one submenu per direction for the speed limits, the alternative-speed toggle, quit. The original's tray is not its application menu: `pmTray` is its own eleven-item list, and this mirrors it item for item. The two speed submenus are filled from the list the toolbar uses rather than from the original's per-connection `DownSpeeds`/`UpSpeeds` setting, so the tray cannot offer a speed the button beside it does not |
| About / help menu | `about.pas` | **Done** — a native Help menu with check for new version, home page, development site and About, plus an About panel in the app menu where macOS expects it |
| The menu bar itself | `MainMenu` in `main.lfm`: File (`&Torrent`), View (`&View`), Tools (`T&ools`), Help (`&Help`) - 65 items over 60 actions | **Done** - the same four menus in the same order, with the original's items, submenus (Priority, Queue) and accelerators, in the system menu bar where a Mac app keeps them. Every item sends a command to the window, which runs the very helper the toolbar button and the keyboard shortcut run, so the three cannot drift apart. Accelerators are the original's, with Ctrl read as Cmd (Cmd+F3 start all, Cmd+1/2 queue, Cmd+R reannounce, F2/F6/F7/F8/F9 and their Cmd forms where the original has them). Three items are decided by the platform: the application menu comes first (About, Services, Hide, Quit - the original's Exit), Edit stays for cut/copy/paste in text fields, and Window stays for Minimize/Zoom/Close. Select all carries no menu accelerator because Cmd+A has to belong to whatever has the focus - the window handles it for rows and text alike. Connections open the connections dialog (the original's `connoptions`); Transmission options, blocklist and GeoIP open the settings dialog, which is where this rewrite keeps them. The window's own View drop-down, which carried the pane and grouping toggles before the menu bar existed, has been removed rather than left beside the menu |
| History of download/move directories | `folderhistory.pas` | **Done** — the Add dialog's directory field offers the last 10 (newest first, de-duplicated); kept beside the settings file, not in the exported settings |
| Keyboard shortcuts beyond select-all | the original's `ShortCut` codes | **Done** — the original's bindings key by key: F2 rename, F3/F4 start/stop, Shift+F3 force start, Ctrl+F3/F4 start/stop everything, F6 move data, F8 alternative speeds, Del remove, Alt/Cmd/Shift+Del remove with data, Ins add torrent, F7 labels, Ctrl+Enter show the folder, Ctrl+H/N/L priority, Ctrl+I don't download, Ctrl+R reannounce, Ctrl+1/Ctrl+2 queue moves (with Ctrl+Shift+1/Ctrl+Shift+2 for the ends), Cmd+Enter properties, F9 settings, Ctrl+F12 big toolbar, Ctrl+A select all (`src/shortcuts.ts`, 87 assertions). Two of these were misread from the original on the first pass and are corrected here: Properties is Cmd+Enter (that action carries `scMeta`, not Alt) and the queue moves are the Ctrl+1/Ctrl+2 pair, not PgUp/PgDn. PgUp/PgDn are kept as an extra, since they take nothing away. The **Alt namespace** is there too, which the original hangs off the main form rather than off the actions: Alt+S to the filter box, Alt+G/K/P/F to the details pages (General, tracKers, Peers, Files - its own letters, not the page order), Alt+1..Alt+8 to the filter rows in order. It is matched on the physical key, so a layout that has moved the letter still works, and it is left alone while a text field has focus - on macOS Alt+letter is how an accent or a symbol is typed, and claiming those keys would make every dialog unusable in a non-English layout. That last part is a deliberate difference |
| Rename, and "Set data location…" | `acRename`, `acMoveTorrent`, `movetorrent.lfm` | **Done** — F2 renames the selected torrent and F6 opens the original's data-location dialog: the destination starts at where the data is now, with the recent-directory history and a Browse button beside it, and "move the torrent data from the current location to the new location" starts checked, so the files are moved. Unchecked, only the recorded location changes. The rename goes over as `torrent-rename-path` for the torrent's root, so the folder on disk is renamed with it. Both are in the row menu as well, where the original keeps its "Rename" and "Set data location…" items |
| Native folder picker when adding a torrent | `Select a folder for download` | **Done** — a Browse button opens the native directory picker; the path is sent as text (it is a path on this machine, not the daemon's) |
| Group the **torrent list** by folder, label or tracker | `acFolderGrouping`, `acLabelGrouping`, `acTrackerGrouping` (three View-menu switches, all defaulting to on) | **Done** — the list gains a heading row per value (the download directory, the Labels column's text, or the first tracker's host) with the number of torrents under it; headings are not selectable, carry no menu, and a heading's torrents keep the column sort they already had. Grouping is one dimension at a time, in the switches' own menu order — folder, then label, then tracker — so with all three on, which is how the original starts (`Ini.ReadBool(…, True)`), the list groups by folder. Whether the three nested could not be read: the original's grid is a `TVarGrid` from a package that is not in its repository, so this is a reading of it rather than a copy, and it is the only place in this list where that is true. The switches live in the View menu beside the pane toggles and travel with the exported settings. The window used to carry a drop-down of its own with the pane toggles; now that the menu bar has the original's View menu, that drop-down is gone, so there is one place to turn these on and off rather than two. (An earlier entry here described these three as grouping the *filter* pane, which was a misreading — the filter pane's own groups are a different thing and were already there.) |
| Columns: Seeds, Tracker, Tracker status, Completed on, Last active, Priority, Size to download, ID, Seeding time, Size left, Private, Uploaded | all in the column setup | **Done** — the picker offers 26 columns |
| Peer limit per torrent | `torrprops` "Peer limit" | **Done** — the properties dialog edits `peer-limit`; verified against the daemon (50 → 7 and restored). It is a literal count: 0 means none, not "use the session setting" |
| Stop seeding a torrent when it goes inactive | `torrprops` "Stop seeding when inactive for" | **Done** — the inactivity limit and its mode, with the minutes field enabled only in the custom mode; verified writing mode 1 / 45 minutes and restoring 0 / 30 |
| Copy a file's path to the clipboard | `acCopyPath` (copies the focused file's full path) | **Done** — a copy button on every file row. It copies the mapped local path when the mapping reaches one and the daemon's own path otherwise; the original copies the daemon's |
| Status bar, sizes mode | `acStatusBarSizes` (total size, size to download, downloaded, remaining for the selection) | **Done** — "Status bar fields → Status bar - Sizes": the four sizes, summed over the selection or over what is shown, from the size fields so the parts add up |
| Adding a torrent that is already there | `torrent-duplicate` → offer to merge the link's trackers into the existing torrent | **Done** — a repeat add says so in a dialog, selects the torrent that was already there, and, when the add named trackers that torrent does not have, asks before merging them. The trackers come from the magnet's `tr=` fields or from a local `.torrent` file's announce list, which is read on this side because the daemon never reports it back. Verified: a magnet carrying an extra tracker added exactly that tracker, and so did a `.torrent` file whose announce list had one more |
| Open a file with the OS | `acOpenFile` | **Done** — an open button beside copy-path, offered only when the file is reachable from this machine; verified launching the associated application with the file |

Closed at the second audit, against the same sources:

| Feature | Original | State here |
|---|---|---|
| Ask about download options when adding | `Interface/ShowAddTorrentWindow` (default on, `main.pas:3038`) | **Done** — a settings row; off, a torrent goes in the moment it arrives with every file wanted and the second stage never appears. The first stage - choosing a file or typing a link - is untouched, as in the original |
| A watched folder | `main.pas:3039/3139/3147`, `IsWatchTorrent` | **Done** — a scan interval, a watched folder and a destination, with the files taken in one pass. What the original does and this now does too: no Add dialog, the watched `.torrent` always deleted once it is in (whatever the delete-after-add setting says - that is what settles the folder), and the destination is not added to the recent-download-directory history, because nobody chose it |
| Confirm before verifying | `main.pas:4582-4587` | **Done** — a native confirmation naming the torrent (or counting them), answering no by default, so backing out sends nothing |
| "Created on" and "Wasted" in the info pane | `txCreated` (`dateCreated`, and `by <creator>`), `txWasted` (`%s (%d hashfails)`) | **Done** — the creation date, following the from-now setting like the other dates, and the wasted bytes with the failed-piece count the original derives by dividing them by the piece size. The wasted row is only there when there is something to report; the creator is the row it already had |
| The filter rows' vocabulary | `fltActive`..`fltWaiting`: all, downloading, finished, active, inactive, stopped, error, waiting | **Done** — the original's eight, with its tests: finished is a completed *or* seeding torrent, and waiting covers the three queued-to-start states, so checking is no longer a row of its own (it is waiting) and neither is seeding (it is finished). This is what makes Alt+1..Alt+8 mean the same rows |
| Editable speed-limit menu items | `connoptions`: `DownSpeeds`/`UpSpeeds`, one comma-separated list per connection, default `0,10,25,50,100,250,500,750,1000,2500,5000,7000` | **Done** — two settings rows holding the same comma-separated lists, with the same rebuilding rules: entries that are not whole numbers dropped, sorted, de-duplicated, the limit in force folded in so it can always be picked back, and "Unlimited" always first. They drive the toolbar's drop-downs and the tray's two speed submenus. One list for the client rather than one per connection, because this rewrite has no connection profiles - a deliberate difference |
| One instance at a time | `main.pas:1360-1394` (`run` + `ipc.txt`) | **Done** — `tauri-plugin-single-instance`, registered ahead of every other plugin: a second launch hands its command line (a `.torrent` or a magnet) to the running instance, raises its window and exits. Verified at process level: with nothing running the binary stays up; with the app running, launching it again exits 0 on its own and the same instance survives. Note while developing: the lock is keyed to the bundle identifier, so a `pnpm tauri dev` session and the installed app turn each other away - quit one before starting the other |
| Deleting a tracker from the list | `lvTrackersKeyDown`: Del removes the focused tracker, after confirming | **Done** — the tracker rows take focus, Del (or Backspace) asks the original's question with no as the default, and the row's own Remove button now goes through the same confirmation rather than deleting straight away |
| Clearing the filter box | Escape | **Done** |

Two things this round taught, both about the message files:

- transgui writes a **line break inside a message as `~`**, in its English source and in every translation, and its placeholders are **printf's `%s`/`%d`**, not named ones. Since the locale files here are its own translations carried over as they stand, the lookup has to honour both — that is what lets a two-line question and a message with two arguments be taken from the original instead of being reworded here and losing all 28 translations. `src/msgFormat.ts` does that, on its own so it can be tested without a browser.
- A `useCallback` **lists its dependencies when the component body runs**, so naming a function defined further down the file throws then and there ("used before declaration"), even though the callback body would never have run yet. The two filesystem actions the row menu needed had to be moved above it.

Two the click-level checks turned up, both of which had been invisible from the
code alone:

- **A timer whose dependencies change on every poll never fires.** The watch
  interval depended on the tick, which depended on `addNextWatch`, which depended
  on `prepareAdd`, which depends on `announceDuplicate` - which reads the torrent
  list, so it is a new function on every two-second poll. The effect was therefore
  torn down and set up again every two seconds, and a one-minute `setInterval`
  never came round: the watched folder sat there and did nothing, with no error
  anywhere, because nothing had failed. The tick is now held in a ref and the
  timer depends only on the folder and the interval. Any timer keyed to a
  callback that reads polled state has this shape - check the whole chain, not
  just the first hop.
- **Alt+S typed ß into the box it had just focused.** Alt+letter is how macOS
  types accents and symbols, and moving focus inside the `keydown` handler hands
  the keystroke to the newly focused field - cancelling the event is not enough,
  because the character is inserted by the text system once it has somewhere to
  put it. Focusing on the next turn leaves it nowhere to go. The other Alt
  bindings move no focus, so they were never affected.

One stale description went with them: the watched-folder note in the settings
dialog still said what it finds opens the Add dialog, which stopped being true
when the folder stopped doing that.

## Deliberate differences

- **A repeat add always opens a dialog, but only asks about trackers when there
  is something to merge.** The original always puts up the same confirmation,
  even when the add named no trackers, in which case answering yes does nothing.
  Telling the user it is already there - and asking only when answering can
  actually change something - keeps the information without the dead question.
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
- **Hiding the menu bar** (`acMenuShow`) is not implemented. It exists for
  platforms where the menu belongs to the window; on macOS the menu bar is the
  system's, and hiding it would take About, Quit and the Edit items with it. The
  rest of that menu - the four menus themselves - is there, item for item.
- **Country flags are emoji** computed from the GeoIP country code rather than a
  downloaded `flags.zip`, and country resolution happens whenever the GeoIP
  database is present instead of behind a toggle.
- **Renaming asks in a dialog rather than turning the cell into an edit box.**
  The original's F2 edits the name in place, in the torrent list and in the
  files list. Here it opens the same small rename dialog the rewrite uses for
  names everywhere - the files list, the Add dialog's "Save as" - so there is
  one way to rename something rather than two. What the key does is unchanged:
  renames whatever is selected.
- **Confirmations are asked in the app's own dialog, not a system alert.** The
  wording, the Yes/No pair and the "no" default are all the original's; only the
  box it is asked in differs. The system alert had two problems. Its default
  button was Yes, so unlike the original's `mbNo` a stray Return would have
  started a verification that reads every piece back off the disk. And it could
  not be reached by the accessibility tools this app is checked with: the check
  that a confirmation is asked before verifying could not tell an unanswerable
  question from no question at all. The informational pop-up when a repeat add
  has no trackers to merge is still the system's, as it is in the original, since
  nothing is being decided there.

## Not implemented

Found by a second, mechanical pass over the original: every action, every dialog
control and every RPC call on one side, and the equivalent on the other. The list
above survived that pass with two corrections (the Properties and queue-move
keys, both noted in the shortcut row). Every gap it turned up is now closed:

- **Being the system's magnet / `.torrent` handler.** The bundle declares both -
  `CFBundleURLTypes` for `magnet` and a `CFBundleDocumentTypes` entry for
  `.torrent` at handler rank Default, which is what the original's
  `setup/macosx/Info.plist` declares - and the app receives them through the
  run loop the same way `urllistenerosx.pas` does. What arrives is parked until
  the window is listening, so a cold launch by opening a `.torrent` is not lost,
  and it opens the Add dialog filled in rather than adding it unseen: the
  original builds a `TAddTorrentForm` around it (`DoAddTorrent`), and until now
  this rewrite added it straight away, which was a difference rather than a
  shortcut.
- Being the *default* handler is a system setting rather than the app's, but
  the app can ask for it: the settings gain the original's two checkboxes for
  the platforms where asking is possible. The original's pair write the Windows
  registry under `{$ifdef mswindows}`; on macOS the same intent is a
  LaunchServices call. Nothing about it is stored by this app - the settings
  file has no entry for it, and the checkboxes are filled from the system's own
  answer, read when the settings are opened (and re-read each time they are
  opened, so a change made elsewhere shows up without restarting). Once a type
  is this app's, the box is shown ticked and stops being clickable, where the
  original's can be unticked: macOS offers no way to hand a type back to nobody,
  only to pass it to another app, and a control that accepts a click only to
  refuse it reads as broken.

Two differences worth naming. The URL type comes out as `CFBundleTypeRole
Editor` because that is the deep-link plugin's default, where the original
declares `Viewer`; nothing reads the role, and it is not worth patching the
built plist for. And the original's Windows checkboxes register the app by
writing registry keys itself, whereas here the association comes from the bundle
declaration and the checkbox only claims the default.

## Closed since the audit

Each of these is now in the rewrite, with the same two-halves shape the original
uses:

- **Deleting the local `.torrent` after a successful add** - the original's
  `Interface/DeleteTorrentFile`, kept client-side for the reason above: the
  daemon never sees the file. Off by default; a file that cannot be removed says
  so in the notice line rather than failing the add.
- **The data refresh interval** - the normal one is now settable (seconds), and
  the toolbar's "Auto Ns" label follows it instead of a fixed 2 s. The minimized
  interval was already there.
- **The update-check interval** ("Check for new version every N days") - a pure
  `updateCheckDue` decides whether a check is owed, so a machine that was asleep
  for a week checks once on waking rather than skipping it. 0 leaves it to the
  button.
- **SOCKS 5** - the same host, port and credentials as the HTTP proxy, with the
  scheme selected by the checkbox. This needed `reqwest`'s `socks` feature, which
  the crate was not built with: without it the option was accepted and silently
  unusable.
- **Reordering the columns** - the picker gained the original's Up/Down half,
  and `normalizeColumns` no longer re-sorts a saved order back into registry
  order (which had made the buttons a no-op).
- **Renaming a saved connection** - beside Save and Delete, with a name another
  entry holds refused rather than silently swallowed.
- **The licence notice** - as a Help-menu item next to About rather than a tab of
  it, because the About panel is the platform's own. The text is not translated.
- **The watched folder** - the original's `Interface/WatchLocalFolder`, its
  interval and its destination folder: every N minutes the folder is looked in
  for `.torrent` files, and what is there opens the ordinary Add dialog, one at
  a time, with the watch destination pre-filled as the download directory - which
  is exactly what the original's `IsWatchTorrent` does and the only thing it
  does. The original has no way in but its INI, since the setting never reached
  a form; here it is three fields in the settings. Held to the same rules: the
  folder has to exist and be writable, and a file that is still in it is offered
  again on the next look, which is what "delete the .torrent after a successful
  addition" settles. Files are listed name-sorted, so the order does not depend
  on the filesystem.
- **The window and the two pane dividers** - where the window was and how big it
  was, and where the filter and details dividers were left. The dividers are new
  rather than restored: the original has a `TSplitter` for each, the rewrite had
  fixed sizes. The window frame is `tauri-plugin-window-state`'s; the pane sizes
  are the app's own settings, clamped on both load and save so a size saved on a
  larger screen cannot come back as a pane that has swallowed the window. Two
  notes: the plugin writes the frame on a clean exit, so a crash or a SIGKILL
  loses it (the pane sizes, saved as they are dragged, survive), and the pane
  sizes go in the settings export where the frame does not.

- **Dates as how long ago they were** (`MainForm/FromNow`) - the original
  switches every date it prints on this one setting and shows the other form in
  the hint; it has no way in but its INI either. Both halves are here: the
  table's date columns and the details pane's Added, Completed and Last
  activity, with the other form in the tooltip. The shape is the original's -
  the two most significant units, abbreviated and never translated ("2d 3h",
  "3mo 4d") - and years and months are counted on the calendar, so 31 January
  to 1 March is "1mo 1d" rather than "0mo 29d".
- **How many recent download directories to keep** (`Interface/MaxFoldersHistory`)
  - 50 by default and settable from 10 to 99, the bounds its own FolderHistory
    unit enforces. The number is a settings field here; the original puts it in
    its connection dialog.
- **The daemon timeouts** (`NetWork/HttpTimeout`, `NetWork/ConnectTimeout`) -
  how long the daemon may take to answer (30 seconds by default, 2..999) and how
  long the connection may take to come up (0 by default, which means the HTTP
  timeout rather than no limit). They are applied to the HTTP client, and two
  tests prove it by making an unreachable address give up inside the limit
  rather than waiting on the operating system.
- **The Add dialog's size** (`AddTorrent/Width`, `AddTorrent/Height`) - the
  dialog can be dragged to a size and comes back that size. The original writes
  them when the dialog closes after a successful add; this writes them whenever
  it closes, which is the same thing with one fewer way to lose a resize.

Two of the audit's small items turned out not to be gaps at all:

- **The big toolbar**, which is already a View-menu item with the wider toolbar
  and larger buttons behind it, and its own setting.
- **`FileManagerDefault` / `FileManagerDefaultParam`** - the original compiles
  the whole custom-file-manager path out on anything but Windows (`{$ifdef
  mswindows}`) and opens the containing folder with the system's own tool
  instead, which is what this does. Not a difference to close, the same as its
  Windows-only handler registry and global hotkeys.

Two bugs the closed-loop checks turned up on the way, both fixed:

- Pressing **Disconnect** was undone within a second by the auto-reconnect loop.
  The original stops its refresh timers on an explicit disconnect, so it stays
  disconnected; the loop here now knows the difference between a connection that
  dropped and one the user ended.
- The **column order** bug above, found because the settings file did not change
  after Apply.
- The Add dialog's size was **never actually written**. The size was read off the
  dialog's box when the dialog went away, but React detaches a ref before it
  runs the effect cleanup, so the box was already null and the write silently
  did nothing. The size is now followed with a `ResizeObserver` while the dialog
  is still up, and only reported at the end. The field only appeared to work
  because a drag that misses the resize grip is released outside the dialog and
  closes it, which reads as "it resized" if you are only watching the dialog
  disappear.
- Clamping a **number field on every keystroke** makes parts of its own range
  unreachable: the directory history bottoms out at 10, so typing 12 turns the
  lone "1" into "10", the "2" then lands on the end of it, and the field settles
  on 99. The three number fields now hold what is being typed and check the
  range when the field is left, which is what the original's spin edits do.
- The main window's **shortcuts stayed live behind an open dialog**. Escape and
  the focused button did what they should, but Delete at a confirmation would
  have removed a torrent from under the question, and Alt+X would have taken the
  selection out of the list being asked about. The original's dialogs are modal
  in that sense; now so is this - while a dialog is up the list's shortcuts are
  not in play.
- **Delete fired twice over.** The window's own Delete removes the selected
  torrent, and the tracker table's Delete removes the tracker. The table's
  handler runs first and stops the event, but the window's listener is separate
  and did not look at that, so Delete aimed at a tracker would also have removed
  the selected torrent. The window handler now ignores a key something inside
  the window has already taken.
- **Delete on a tracker row.** The row is focusable, handles Delete and
  Backspace, and takes the focus when it is clicked (a click on a cell leaves
  the keyboard on the document). Confirmed by hand: click a tracker row, press
  Delete, and the original's question is asked before the tracker goes. Only the
  code path could be checked from this side for a long time, because the window
  had been left wider than this machine's screen - the details panel's rows sat
  partly past the edge, so the clicks aimed at them were landing on another
  application's window.
  The forward-Delete key is what triggers the *window's* Delete, matching the
  original: on macOS the key next to the arrows reports itself as Backspace, and
  only forward-Delete is `Delete` in both programs.

## Ahead of the original

The session surface is a superset: the rewrite also exposes the settings a
current Transmission has that the original predates — anti-brute-force limits,
default trackers, per-event scripts (added / done / done-seeding),
`start-added-torrents`, `trash-original-torrent-files` and sequential download.
