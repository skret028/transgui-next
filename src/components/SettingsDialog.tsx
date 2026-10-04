import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import type { SessionInfo } from "../types";

interface Props {
  onLoad: () => Promise<SessionInfo>;
  onClose: () => void;
  onApply: (patch: Record<string, unknown>) => Promise<void>;
}

interface Fields {
  downloadDir: string;
  incompleteDir: string;
  incompleteDirEnabled: boolean;
  speedDown: string;
  speedDownEnabled: boolean;
  speedUp: string;
  speedUpEnabled: boolean;
  altDown: string;
  altUp: string;
  altEnabled: boolean;
  peerPort: string;
  peerPortRandom: boolean;
  encryption: string;
  dht: boolean;
  pex: boolean;
  lpd: boolean;
  utp: boolean;
  startAdded: boolean;
  renamePartial: boolean;
  seedRatioLimit: string;
  seedRatioLimited: boolean;
}

const numStr = (v: unknown) => (v == null ? "" : String(v));

function fromSession(s: SessionInfo): Fields {
  return {
    downloadDir: String(s["download-dir"] ?? ""),
    incompleteDir: String(s["incomplete-dir"] ?? ""),
    incompleteDirEnabled: !!s["incomplete-dir-enabled"],
    speedDown: numStr(s["speed-limit-down"]),
    speedDownEnabled: !!s["speed-limit-down-enabled"],
    speedUp: numStr(s["speed-limit-up"]),
    speedUpEnabled: !!s["speed-limit-up-enabled"],
    altDown: numStr(s["alt-speed-down"]),
    altUp: numStr(s["alt-speed-up"]),
    altEnabled: !!s["alt-speed-enabled"],
    peerPort: numStr(s["peer-port"]),
    peerPortRandom: !!s["peer-port-random-on-start"],
    encryption: String(s.encryption ?? "preferred"),
    dht: !!s["dht-enabled"],
    pex: !!s["pex-enabled"],
    lpd: !!s["lpd-enabled"],
    utp: !!s["utp-enabled"],
    startAdded: !!s["start-added-torrents"],
    renamePartial: !!s["rename-partial-files"],
    seedRatioLimit: numStr(s["seedRatioLimit"]),
    seedRatioLimited: !!s["seedRatioLimited"],
  };
}

function toPatch(f: Fields): Record<string, unknown> {
  const n = (v: string) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    "download-dir": f.downloadDir.trim(),
    "incomplete-dir": f.incompleteDir.trim(),
    "incomplete-dir-enabled": f.incompleteDirEnabled,
    "speed-limit-down": n(f.speedDown),
    "speed-limit-down-enabled": f.speedDownEnabled,
    "speed-limit-up": n(f.speedUp),
    "speed-limit-up-enabled": f.speedUpEnabled,
    "alt-speed-down": n(f.altDown),
    "alt-speed-up": n(f.altUp),
    "alt-speed-enabled": f.altEnabled,
    "peer-port": n(f.peerPort),
    "peer-port-random-on-start": f.peerPortRandom,
    encryption: f.encryption,
    "dht-enabled": f.dht,
    "pex-enabled": f.pex,
    "lpd-enabled": f.lpd,
    "utp-enabled": f.utp,
    "start-added-torrents": f.startAdded,
    "rename-partial-files": f.renamePartial,
    seedRatioLimit: n(f.seedRatioLimit),
    seedRatioLimited: f.seedRatioLimited,
  };
}

export function SettingsDialog({ onLoad, onClose, onApply }: Props) {
  const [fields, setFields] = useState<Fields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setFields(fromSession(await onLoad()));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [onLoad]);

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
      title="服务器 / 传输设置"
      width={540}
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
          <div className="group">目录</div>
          <label className="field">
            <span>默认下载目录</span>
            <input value={fields.downloadDir} onChange={(e) => set("downloadDir", e.target.value)} />
          </label>
          <label className="field">
            <span>未完成目录</span>
            <input
              value={fields.incompleteDir}
              onChange={(e) => set("incompleteDir", e.target.value)}
              disabled={!fields.incompleteDirEnabled}
            />
          </label>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.incompleteDirEnabled}
              onChange={(e) => set("incompleteDirEnabled", e.target.checked)}
            />
            启用未完成目录
          </label>

          <div className="group">速度限制（KB/s）</div>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.speedDownEnabled}
                onChange={(e) => set("speedDownEnabled", e.target.checked)}
              />
              下载限速
            </label>
            <input
              className="narrow"
              value={fields.speedDown}
              onChange={(e) => set("speedDown", e.target.value)}
            />
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.speedUpEnabled}
                onChange={(e) => set("speedUpEnabled", e.target.checked)}
              />
              上传限速
            </label>
            <input
              className="narrow"
              value={fields.speedUp}
              onChange={(e) => set("speedUp", e.target.value)}
            />
          </div>

          <div className="group">备选限速（夜间/忙时）</div>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.altEnabled}
              onChange={(e) => set("altEnabled", e.target.checked)}
            />
            启用备选限速
          </label>
          <div className="kv-inline">
            <span className="muted">下载</span>
            <input className="narrow" value={fields.altDown} onChange={(e) => set("altDown", e.target.value)} />
            <span className="muted">上传</span>
            <input className="narrow" value={fields.altUp} onChange={(e) => set("altUp", e.target.value)} />
          </div>

          <div className="group">网络</div>
          <div className="kv-inline">
            <span className="muted">监听端口</span>
            <input className="narrow" value={fields.peerPort} onChange={(e) => set("peerPort", e.target.value)} />
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.peerPortRandom}
                onChange={(e) => set("peerPortRandom", e.target.checked)}
              />
              启动时随机
            </label>
          </div>
          <label className="field">
            <span>加密</span>
            <select value={fields.encryption} onChange={(e) => set("encryption", e.target.value)}>
              <option value="preferred">优先</option>
              <option value="required">必须</option>
              <option value="tolerated">允许</option>
            </select>
          </label>
          <div className="kv-inline">
            <label className="chk">
              <input type="checkbox" checked={fields.dht} onChange={(e) => set("dht", e.target.checked)} />
              DHT
            </label>
            <label className="chk">
              <input type="checkbox" checked={fields.pex} onChange={(e) => set("pex", e.target.checked)} />
              PEX
            </label>
            <label className="chk">
              <input type="checkbox" checked={fields.lpd} onChange={(e) => set("lpd", e.target.checked)} />
              LPD
            </label>
            <label className="chk">
              <input type="checkbox" checked={fields.utp} onChange={(e) => set("utp", e.target.checked)} />
              µTP
            </label>
          </div>

          <div className="group">行为</div>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.startAdded}
              onChange={(e) => set("startAdded", e.target.checked)}
            />
            添加种子后自动开始
          </label>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.renamePartial}
              onChange={(e) => set("renamePartial", e.target.checked)}
            />
            未完成文件加 .part 后缀
          </label>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.seedRatioLimited}
                onChange={(e) => set("seedRatioLimited", e.target.checked)}
              />
              做种比率限制
            </label>
            <input
              className="narrow"
              value={fields.seedRatioLimit}
              onChange={(e) => set("seedRatioLimit", e.target.value)}
              disabled={!fields.seedRatioLimited}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
