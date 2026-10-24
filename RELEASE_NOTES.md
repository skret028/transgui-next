Download the installer for your platform from the assets below.

| Platform | Asset |
|---|---|
| macOS (Apple Silicon) | `.dmg` / `.app.tar.gz` (aarch64) |
| macOS (Intel) | `.dmg` / `.app.tar.gz` (x64) |
| Linux | `.AppImage` / `.deb` / `.rpm` |
| Windows | `.msi` / `-setup.exe` |

## What's new in 0.2.0

- **The original's menu bar**: File, View, Tools and Help with its items,
  submenus (Priority, Queue) and accelerators, in the system menu bar. Every
  item runs the same helper the toolbar button and the keyboard shortcut run.
- **Group the torrent list** by folder, label or tracker, from the View menu.
- **The connection settings have their own dialog**, as in the original: File →
  New connection… / Manage connections…, with the saved connections across the
  top and the Connection and Proxy pages. The main window no longer carries a
  connection row; its toolbar has the original's connect button, whose caption is
  where it is connected.
- **The window fits the screen it opens on** and comes back where it was left;
  pane widths are remembered too.
- **Confirmations in the app's own dialog**, with the original's wording for both
  Remove and Remove with data.
- The Add dialog remembers its size, numbers can be typed rather than truncated,
  and the daemon timeouts (HTTP and connect) are honoured.
- Dates in the list read from now ("2d 3h", "3mo 4d"), years and months counted on
  the calendar.

### Notes

Builds are **unsigned**:

- **macOS** — the first launch may be blocked by Gatekeeper. Right-click the app
  and choose **Open**, or clear the quarantine flag:
  `xattr -dr com.apple.quarantine /Applications/transgui-next.app`
- **Windows** — SmartScreen may warn; choose *More info* → *Run anyway*.
- **Linux** — make the AppImage executable (`chmod +x`) before running.

Requires a reachable Transmission daemon (RPC enabled). Connect to
`localhost:9091` by default.
