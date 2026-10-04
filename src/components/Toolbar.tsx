import { useT } from "../i18n";

interface Props {
  connected: boolean;
  selectedCount: number;
  autoRefresh: boolean;
  refreshMs: number;
  onAction: (action: string) => void;
  onOpenAdd: () => void;
  onOpenSettings: () => void;
  onOpenLabels: () => void;
  onOpenProps: () => void;
  onRefresh: () => void;
  onAutoRefreshChange: (value: boolean) => void;
}

export function Toolbar({
  connected,
  selectedCount,
  autoRefresh,
  refreshMs,
  onAction,
  onOpenAdd,
  onOpenSettings,
  onOpenLabels,
  onOpenProps,
  onRefresh,
  onAutoRefreshChange,
}: Props) {
  const t = useT();
  const needSel = selectedCount === 0;
  return (
    <section className="toolbar">
      <button className="btn" onClick={() => onAction("start")} disabled={!connected || needSel}>
        {t("Start")}
      </button>
      <button className="btn" onClick={() => onAction("stop")} disabled={!connected || needSel}>
        {t("Stop")}
      </button>
      <button className="btn" onClick={() => onAction("verify")} disabled={!connected || needSel}>
        {t("Verify")}
      </button>
      <button className="btn" onClick={() => onAction("reannounce")} disabled={!connected || needSel}>
        {t("Reannounce")}
      </button>
      <button className="btn danger" onClick={() => onAction("remove")} disabled={!connected || needSel}>
        {t("Remove")}
      </button>
      <button className="btn" onClick={onOpenLabels} disabled={!connected || needSel || selectedCount > 1}>
        {t("Labels")}
      </button>
      <button className="btn" onClick={onOpenProps} disabled={!connected || selectedCount !== 1}>
        {t("Properties")}
      </button>
      {selectedCount > 0 && (
        <span className="sel-hint">{t("{n} selected", { n: selectedCount })}</span>
      )}
      <span className="spacer" />
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
