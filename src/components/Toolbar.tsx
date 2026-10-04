interface Props {
  connected: boolean;
  selectedCount: number;
  autoRefresh: boolean;
  refreshMs: number;
  onAction: (action: string) => void;
  onOpenAdd: () => void;
  onOpenSettings: () => void;
  onOpenLabels: () => void;
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
  onRefresh,
  onAutoRefreshChange,
}: Props) {
  const needSel = selectedCount === 0;
  return (
    <section className="toolbar">
      <button className="btn" onClick={() => onAction("start")} disabled={!connected || needSel}>
        开始
      </button>
      <button className="btn" onClick={() => onAction("stop")} disabled={!connected || needSel}>
        停止
      </button>
      <button className="btn" onClick={() => onAction("verify")} disabled={!connected || needSel}>
        校验
      </button>
      <button className="btn" onClick={() => onAction("reannounce")} disabled={!connected || needSel}>
        汇报
      </button>
      <button className="btn danger" onClick={() => onAction("remove")} disabled={!connected || needSel}>
        移除
      </button>
      <button className="btn" onClick={onOpenLabels} disabled={!connected || needSel}>
        标签
      </button>
      {selectedCount > 0 && <span className="sel-hint">已选 {selectedCount}</span>}
      <span className="spacer" />
      <button className="btn primary" onClick={onOpenAdd} disabled={!connected}>
        添加种子…
      </button>
      <button className="btn" onClick={onOpenSettings} disabled={!connected}>
        设置
      </button>
      <button className="btn" onClick={onRefresh} disabled={!connected}>
        刷新
      </button>
      <label className="chk">
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => onAutoRefreshChange(e.target.checked)}
        />
        自动 {refreshMs / 1000}s
      </label>
    </section>
  );
}
