import { useState } from "react";
import { Modal } from "./Modal";

interface Props {
  count: number;
  current: string[];
  known: string[];
  onClose: () => void;
  onApply: (labels: string[]) => Promise<void>;
}

export function LabelsDialog({ count, current, known, onClose, onApply }: Props) {
  const [text, setText] = useState(current.join(", "));
  const [busy, setBusy] = useState(false);

  const labels = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = new Set(labels);
  const toggleKnown = (label: string) => {
    const next = new Set(parsed);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setText([...next].join(", "));
  };

  const apply = async () => {
    setBusy(true);
    try {
      await onApply(labels);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`设置标签（${count} 个种子）`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={apply} disabled={busy}>
            {busy ? "应用中…" : "应用"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>标签（逗号分隔，留空清除）</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="电影, 剧集, 收藏"
        />
      </label>

      {known.length > 0 && (
        <>
          <div className="group">已有标签（点击切换）</div>
          <div className="chips">
            {known.map((label) => (
              <button
                key={label}
                className={`chip ${parsed.has(label) ? "on" : ""}`}
                onClick={() => toggleKnown(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="muted">应用后会用上面的标签列表覆盖这些种子的现有标签。</p>
    </Modal>
  );
}
