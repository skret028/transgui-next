interface Props {
  connected: boolean;
  selectedCount: number;
  magnet: string;
  autoRefresh: boolean;
  refreshMs: number;
  onAction: (action: string) => void;
  onMagnetChange: (value: string) => void;
  onAdd: () => void;
  onRefresh: () => void;
  onAutoRefreshChange: (value: boolean) => void;
}

export function Toolbar({
  connected,
  selectedCount,
  magnet,
  autoRefresh,
  refreshMs,
  onAction,
  onMagnetChange,
  onAdd,
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
      {selectedCount > 0 && <span className="sel-hint">已选 {selectedCount}</span>}
      <span className="spacer" />
      <input
        className="magnet"
        value={magnet}
        onChange={(e) => onMagnetChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAdd()}
        placeholder="magnet: / http(s) / .torrent 路径"
        disabled={!connected}
      />
      <button className="btn" onClick={onAdd} disabled={!connected}>
        添加
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
