Download the installer for your platform from the assets below.

| Platform | Asset |
|---|---|
| macOS (Apple Silicon) | `.dmg` / `.app.tar.gz` (aarch64) |
| macOS (Intel) | `.dmg` / `.app.tar.gz` (x64) |
| Linux | `.AppImage` / `.deb` / `.rpm` |
| Windows | `.msi` / `-setup.exe` |

### Notes

Builds are **unsigned**:

- **macOS** — the first launch may be blocked by Gatekeeper. Right-click the app
  and choose **Open**, or clear the quarantine flag:
  `xattr -dr com.apple.quarantine /Applications/transgui-next.app`
- **Windows** — SmartScreen may warn; choose *More info* → *Run anyway*.
- **Linux** — make the AppImage executable (`chmod +x`) before running.

Requires a reachable Transmission daemon (RPC enabled). Connect to
`localhost:9091` by default.
