import { useState } from "react";
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
}

/** Presets shared by both directions; 0 means unlimited (handled as a null). */
const SPEED_PRESETS = [1, 5, 10, 50, 100, 500];

function SpeedSelect({
  label,
  kbps,
  enabled,
  onChange,
}: {
  label: string;
  kbps: number;
  enabled: boolean;
  onChange: (kbps: number | null) => void;
}) {
  const t = useT();
  const value = enabled ? String(kbps) : "";
  const custom = enabled && kbps > 0 && !SPEED_PRESETS.includes(kbps);
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
        {SPEED_PRESETS.map((p) => (
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
}: Props) {
  const t = useT();
  const needSel = selectedCount === 0;
  const busy = !connected || needSel;
  const [speedOpen, setSpeedOpen] = useState(false);

  return (
    <section className={`toolbar${big ? " big" : ""}`}>
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
          short. The value is reset to "" so the same choice can be re-picked. */}
      <select
        className="action-select"
        value=""
        disabled={busy}
        title={t("More actions")}
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = "";
          if (v) onAction(v);
        }}
      >
        <option value="">{t("More actions")}…</option>
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
                onChange={(v) => onSetSpeed("down", v)}
              />
              <SpeedSelect
                label={t("Upload")}
                kbps={speedUp}
                enabled={speedUpEnabled}
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
