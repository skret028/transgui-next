import { useEffect, useState } from "react";
import { useT } from "../i18n";

interface Props {
  connected: boolean;
  selectedCount: number;
  autoRefresh: boolean;
  refreshMs: number;
  big: boolean;
  /** Daemon session values for the quick speed controls. */
  altSpeedEnabled: boolean;
  speedDown: number;
  speedDownEnabled: boolean;
  speedUp: number;
  speedUpEnabled: boolean;
  onAction: (action: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  /** Copy a magnet URI for every selected torrent. */
  onCopyMagnet: () => void;
  onGlobalAction: (action: string) => void;
  onOpenAdd: () => void;
  onOpenSettings: () => void;
  onOpenLabels: () => void;
  onOpenProps: () => void;
  onOpenStats: () => void;
  onRefresh: () => void;
  onAutoRefreshChange: (value: boolean) => void;
  onToggleAltSpeed: () => void;
  onSetSpeed: (which: "down" | "up", kbps: number | null) => void;
  /** Refresh the cached session so the menus show the daemon's current values. */
  onLoadSession: () => void;
  /** The connection's speed-limit menu items, already parsed and ordered. */
  speedDownItems: number[];
  speedUpItems: number[];
  connecting: boolean;
  /** What the connected button shows: the connection it is on. */
  connectionName: string;
  /** The saved connections, for the button's drop-down. */
  servers: { id: string; name: string }[];
  selectedServerId: string;
  onConnect: () => void;
  onSwitchServer: (id: string) => void;
  onManageConnections: () => void;
}

/**
 * The speed drop-downs: the connection's menu items, plus the limit in force so
 * a custom one can always be picked back. An empty value is "Unlimited", which
 * is how a disabled limit is shown - the daemon's own convention.
 */
function SpeedSelect({
  label,
  kbps,
  enabled,
  presets,
  onChange,
}: {
  label: string;
  kbps: number;
  enabled: boolean;
  presets: number[];
  onChange: (kbps: number | null) => void;
}) {
  const t = useT();
  const value = enabled ? String(kbps) : "";
  const custom = enabled && !presets.includes(kbps);
  return (
    <label className="kv-inline">
      <span className="muted">{label}</span>
      <select
        className="speed-select"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">{t("Unlimited")}</option>
        {custom && <option value={String(kbps)}>{kbps} KB/s</option>}
        {presets.map((p) => (
          <option key={p} value={p}>
            {p} KB/s
          </option>
        ))}
      </select>
    </label>
  );
}

export function Toolbar({
  connected,
  selectedCount,
  autoRefresh,
  refreshMs,
  big,
  altSpeedEnabled,
  speedDown,
  speedDownEnabled,
  speedUp,
  speedUpEnabled,
  onAction,
  onSelectAll,
  onSelectNone,
  onCopyMagnet,
  onGlobalAction,
  onOpenAdd,
  onOpenSettings,
  onOpenLabels,
  onOpenProps,
  onOpenStats,
  onRefresh,
  onAutoRefreshChange,
  onToggleAltSpeed,
  onSetSpeed,
  onLoadSession,
  speedDownItems,
  speedUpItems,
  connecting,
  connectionName,
  servers,
  selectedServerId,
  onConnect,
  onSwitchServer,
  onManageConnections,
}: Props) {
  const t = useT();
  const needSel = selectedCount === 0;
  const busy = !connected || needSel;
  const [speedOpen, setSpeedOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(false);

  // A menu closes on Escape, as a pop-up menu does in the original.
  useEffect(() => {
    if (!connOpen && !speedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setConnOpen(false);
      setSpeedOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connOpen, speedOpen]);

  return (
    <section className={`toolbar${big ? " big" : ""}`}>
      {/* The original's tbConnect: a captioned button that connects and
          disconnects, with the saved connections on its drop-down. Its caption
          is where it is connected, and "Connect to Transmission" when it is not
          - the same swap `DoDisconnect` makes in the original. */}
      <div className="dropdown-wrap conn-tool">
        {connected ? (
          /* Connected, the caption is the connection it is on and pressing it
             opens the saved ones - `acConnectExecute` checks `RpcObj.Connected`
             and calls `CheckMenuDropdown` rather than disconnecting. */
          <button
            className="btn"
            onClick={() => setConnOpen((o) => !o)}
            title={t("Connect to Transmission")}
            aria-expanded={connOpen}
          >
            {connectionName || "Transmission"}
          </button>
        ) : (
          <button className="btn primary" onClick={onConnect} disabled={connecting}>
            {connecting ? t("Connecting…") : t("Connect to %s", { s: "Transmission" })}
          </button>
        )}
        <button
          className="btn conn-tool-arrow"
          onClick={() => setConnOpen((o) => !o)}
          title={t("Saved servers")}
          aria-label={t("Saved servers")}
          aria-expanded={connOpen}
        >
          ▾
        </button>
        {connOpen && (
          <>
            <div className="dropdown-backdrop" onClick={() => setConnOpen(false)} />
            <div className="dropdown conn-menu">
              {servers.length === 0 && <div className="muted">{t("(no saved connections)")}</div>}
              {servers.map((s) => (
                <button
                  key={s.id}
                  className="conn-menu-item"
                  onClick={() => {
                    setConnOpen(false);
                    onSwitchServer(s.id);
                  }}
                >
                  <span className="conn-menu-check">{s.id === selectedServerId && connected ? "✓" : ""}</span>
                  {s.name}
                </button>
              ))}
              <div className="dropdown-sep" />
              <button
                className="conn-menu-item"
                onClick={() => {
                  setConnOpen(false);
                  onManageConnections();
                }}
              >
                <span className="conn-menu-check" />
                {t("Manage connections")}…
              </button>
            </div>
          </>
        )}
      </div>
      <button className="btn" onClick={() => onAction("start")} disabled={busy}>
        {t("Start")}
      </button>
      <button className="btn" onClick={() => onAction("stop")} disabled={busy}>
        {t("Stop")}
      </button>
      <button className="btn" onClick={() => onAction("verify")} disabled={busy}>
        {t("Verify")}
      </button>
      <button className="btn" onClick={() => onAction("reannounce")} disabled={busy}>
        {t("Reannounce")}
      </button>

      {/* Low-frequency per-torrent actions live in one control so the bar stays
          short. The value is reset to "" so the same choice can be re-picked.
          Select-all/none are always available, so the menu is gated on the
          connection rather than on a non-empty selection. */}
      <select
        className="action-select"
        value=""
        disabled={!connected}
        title={t("More actions")}
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = "";
          if (v === "select_all") onSelectAll();
          else if (v === "select_none") onSelectNone();
          else if (v === "copy_magnet") onCopyMagnet();
          else if (v) onAction(v);
        }}
      >
        <option value="">{t("More actions")}…</option>
        <option value="select_all">{t("Select all")}</option>
        <option value="select_none">{t("Deselect all")}</option>
        <option value="copy_magnet">{t("Copy Magnet Link(s)")}</option>
        <option value="start_now">{t("Force start")}</option>
        <option value="queue_top">{t("Move top")}</option>
        <option value="queue_up">{t("Move up")}</option>
        <option value="queue_down">{t("Move down")}</option>
        <option value="queue_bottom">{t("Move bottom")}</option>
        <option value="remove_with_data">{t("Remove and delete data")}</option>
      </select>

      <button className="btn danger" onClick={() => onAction("remove")} disabled={busy}>
        {t("Remove")}
      </button>
      <button className="btn" onClick={onOpenLabels} disabled={busy || selectedCount > 1}>
        {t("Labels")}
      </button>
      <button className="btn" onClick={onOpenProps} disabled={!connected || selectedCount !== 1}>
        {t("Properties")}
      </button>
      {selectedCount > 0 && (
        <span className="sel-hint">{t("{n} selected", { n: selectedCount })}</span>
      )}

      <span className="spacer" />

      <button className="btn" onClick={() => onGlobalAction("start_all")} disabled={!connected}>
        {t("Start all")}
      </button>
      <button className="btn" onClick={() => onGlobalAction("stop_all")} disabled={!connected}>
        {t("Stop all")}
      </button>
      <button className="btn" onClick={onOpenStats} disabled={!connected}>
        {t("Statistics")}
      </button>

      {/* Quick session-wide speed controls. */}
      <div className="dropdown-wrap">
        <button
          className="btn"
          title={t("Speed limits")}
          disabled={!connected}
          onClick={() => {
            setSpeedOpen((o) => !o);
            onLoadSession();
          }}
        >
          {t("Speed limits")} ▾
        </button>
        {speedOpen && (
          <>
            <div className="dropdown-backdrop" onClick={() => setSpeedOpen(false)} />
            <div className="dropdown speed-menu">
              <SpeedSelect
                label={t("Download")}
                kbps={speedDown}
                enabled={speedDownEnabled}
                presets={speedDownItems}
                onChange={(v) => onSetSpeed("down", v)}
              />
              <SpeedSelect
                label={t("Upload")}
                kbps={speedUp}
                enabled={speedUpEnabled}
                presets={speedUpItems}
                onChange={(v) => onSetSpeed("up", v)}
              />
            </div>
          </>
        )}
      </div>

      <button
        className={`btn${altSpeedEnabled ? " primary" : ""}`}
        title={t("Toggle alternative speed limits")}
        onClick={onToggleAltSpeed}
        disabled={!connected}
        aria-pressed={altSpeedEnabled}
      >
        {t("Alt speeds")}
      </button>

      <button className="btn primary" onClick={onOpenAdd} disabled={!connected}>
        {t("Add torrent…")}
      </button>
      <button className="btn" onClick={onOpenSettings} disabled={!connected}>
        {t("Settings")}
      </button>
      <button className="btn" onClick={onRefresh} disabled={!connected}>
        {t("Refresh")}
      </button>
      <label className="chk">
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => onAutoRefreshChange(e.target.checked)}
        />
        {t("Auto {n}s", { n: refreshMs / 1000 })}
      </label>
    </section>
  );
}
