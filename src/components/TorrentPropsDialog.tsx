import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import type { TorrentDetail } from "../types";

interface Props {
  id: number;
  onLoad: (id: number) => Promise<TorrentDetail | null>;
  onClose: () => void;
  onApply: (patch: Record<string, unknown>) => Promise<void>;
}

interface Fields {
  upEnabled: boolean;
  upLimit: string;
  downEnabled: boolean;
  downLimit: string;
  priority: string; // -1 low | 0 normal | 1 high
  ratioMode: string; // 0 global | 1 custom | 2 unlimited
  ratioLimit: string;
  queuePos: string;
  honorsSession: boolean;
}

const numStr = (v: unknown) => (v == null ? "" : String(v));

function fromDetail(d: TorrentDetail): Fields {
  return {
    upEnabled: !!d.uploadLimited,
    upLimit: numStr(d.uploadLimit),
    downEnabled: !!d.downloadLimited,
    downLimit: numStr(d.downloadLimit),
    priority: numStr(d.bandwidthPriority ?? 0),
    ratioMode: numStr(d.seedRatioMode ?? 0),
    ratioLimit: numStr(d.seedRatioLimit),
    queuePos: numStr(d.queuePosition ?? 0),
    honorsSession: d.honorSessionLimits ?? true,
  };
}

function toPatch(f: Fields): Record<string, unknown> {
  const n = (v: string) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    uploadLimited: f.upEnabled,
    uploadLimit: n(f.upLimit),
    downloadLimited: f.downEnabled,
    downloadLimit: n(f.downLimit),
    bandwidthPriority: n(f.priority),
    seedRatioMode: n(f.ratioMode),
    seedRatioLimit: n(f.ratioLimit),
    queuePosition: n(f.queuePos),
    honorsSessionLimits: f.honorsSession,
  };
}

export function TorrentPropsDialog({ id, onLoad, onClose, onApply }: Props) {
  const [fields, setFields] = useState<Fields | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const d = await onLoad(id);
        if (!d) {
          setError("读取种子属性失败");
          return;
        }
        setName(d.name);
        setFields(fromDetail(d));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [id, onLoad]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((f) => (f ? { ...f, [key]: value } : f));

  const apply = async () => {
    if (!fields) return;
    setBusy(true);
    setError("");
    try {
      await onApply(toPatch(fields));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`种子属性${name ? `：${name}` : ""}`}
      width={520}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            关闭
          </button>
          <button className="btn primary" onClick={apply} disabled={busy || !fields}>
            {busy ? "应用中…" : "应用"}
          </button>
        </>
      }
    >
      {error && <div className="error inline">{error}</div>}
      {!fields && !error && <div className="muted">加载中…</div>}

      {fields && (
        <div className="settings-form">
          <div className="group">速度限制（KB/s）</div>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.honorsSession}
              onChange={(e) => set("honorsSession", e.target.checked)}
            />
            遵循全局速度限制
          </label>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.downEnabled}
                onChange={(e) => set("downEnabled", e.target.checked)}
              />
              下载限速
            </label>
            <input
              className="narrow"
              value={fields.downLimit}
              onChange={(e) => set("downLimit", e.target.value)}
              disabled={!fields.downEnabled || fields.honorsSession}
            />
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.upEnabled}
                onChange={(e) => set("upEnabled", e.target.checked)}
              />
              上传限速
            </label>
            <input
              className="narrow"
              value={fields.upLimit}
              onChange={(e) => set("upLimit", e.target.value)}
              disabled={!fields.upEnabled || fields.honorsSession}
            />
          </div>

          <div className="group">优先级与队列</div>
          <label className="field">
            <span>带宽优先级</span>
            <select value={fields.priority} onChange={(e) => set("priority", e.target.value)}>
              <option value="-1">低</option>
              <option value="0">普通</option>
              <option value="1">高</option>
            </select>
          </label>
          <label className="field">
            <span>队列位置（0 = 队首）</span>
            <input
              className="narrow-wide"
              value={fields.queuePos}
              onChange={(e) => set("queuePos", e.target.value)}
            />
          </label>

          <div className="group">做种比率</div>
          <label className="field">
            <span>模式</span>
            <select value={fields.ratioMode} onChange={(e) => set("ratioMode", e.target.value)}>
              <option value="0">使用全局</option>
              <option value="1">自定义</option>
              <option value="2">不限制</option>
            </select>
          </label>
          <label className="field">
            <span>比率上限</span>
            <input
              className="narrow-wide"
              value={fields.ratioLimit}
              onChange={(e) => set("ratioLimit", e.target.value)}
              disabled={fields.ratioMode !== "1"}
            />
          </label>
        </div>
      )}
    </Modal>
  );
}
