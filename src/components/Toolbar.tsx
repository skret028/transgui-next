import { useT } from "../i18n";

interface Props {
  connected: boolean;
  selectedCount: number;
  autoRefresh: boolean;
  refreshMs: number;
  onAction: (action: string) => void;
  onGlobalAction: (action: string) => void;
  onOpenAdd: () => void;
  onOpenSettings: () => void;
  onOpenLabels: () => void;
  onOpenProps: () => void;
  onOpenStats: () => void;
  onRefresh: () => void;
  onAutoRefreshChange: (value: boolean) => void;
}

export function Toolbar({
  connected,
  selectedCount,
  autoRefresh,
  refreshMs,
  onAction,
  onGlobalAction,
  onOpenAdd,
  onOpenSettings,
  onOpenLabels,
  onOpenProps,
  onOpenStats,
  onRefresh,
  onAutoRefreshChange,
}: Props) {
  const t = useT();
  const needSel = selectedCount === 0;
  const busy = !connected || needSel;

  return (
    <section className="toolbar">
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
        {t("Start all torrents")}
      </button>
      <button className="btn" onClick={() => onGlobalAction("stop_all")} disabled={!connected}>
        {t("Stop all torrents")}
      </button>
      <button className="btn" onClick={onOpenStats} disabled={!connected}>
        {t("Statistics")}
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
