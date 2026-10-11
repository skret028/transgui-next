import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n";
import { trackerPatch, type Tracker } from "../trackers";
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
  peerLimit: string;
  idleMode: string; // 0 global | 1 use the limit | 2 unlimited
  idleLimit: string;
  queuePos: string;
  honorsSession: boolean;
  /** The tracker box: one announce URL per line, as the original's memo is. */
  trackers: string;
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
    peerLimit: numStr(d["peer-limit"]),
    idleMode: numStr(d.seedIdleMode ?? 0),
    idleLimit: numStr(d.seedIdleLimit),
    queuePos: numStr(d.queuePosition ?? 0),
    honorsSession: d.honorSessionLimits ?? true,
    trackers: (d.trackers ?? []).map((tr) => tr.announce).join("\n"),
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
    // Hyphenated: the daemon's field name, not a camelCase one.
    "peer-limit": n(f.peerLimit),
    seedIdleMode: n(f.idleMode),
    seedIdleLimit: n(f.idleLimit),
    queuePosition: n(f.queuePos),
    honorsSessionLimits: f.honorsSession,
  };
}

export function TorrentPropsDialog({ id, onLoad, onClose, onApply }: Props) {
  const t = useT();
  const [fields, setFields] = useState<Fields | null>(null);
  const [name, setName] = useState("");
  /** The trackers as the daemon reported them, to diff the box against. */
  const [base, setBase] = useState<Tracker[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const d = await onLoad(id);
        if (!d) {
          setError(t("Failed to read torrent properties"));
          return;
        }
        setName(d.name);
        setBase(d.trackers ?? []);
        setFields(fromDetail(d));
      } catch (e) {
        setError(String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, onLoad]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((f) => (f ? { ...f, [key]: value } : f));

  const apply = async () => {
    if (!fields) return;
    setBusy(true);
    setError("");
    try {
      // The tracker box is diffed rather than sent whole: the daemon takes
      // additions, replacements and removals as three separate arrays, and a
      // tracker that did not change must not be rewritten.
      await onApply({ ...toPatch(fields), ...trackerPatch(base, fields.trackers) });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`${t("Torrent properties")}${name ? `: ${name}` : ""}`}
      width={520}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {t("Close")}
          </button>
          <button className="btn primary" onClick={apply} disabled={busy || !fields}>
            {busy ? t("Applying…") : t("Apply")}
          </button>
        </>
      }
    >
      {error && <div className="error inline">{error}</div>}
      {!fields && !error && <div className="muted">{t("Loading…")}</div>}

      {fields && (
        <div className="settings-form">
          <div className="group">{t("Speed limits (KB/s)")}</div>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.honorsSession}
              onChange={(e) => set("honorsSession", e.target.checked)}
            />
            {t("Honor global speed limits")}
          </label>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.downEnabled}
                onChange={(e) => set("downEnabled", e.target.checked)}
              />
              {t("Download limit")}
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
              {t("Upload limit")}
            </label>
            <input
              className="narrow"
              value={fields.upLimit}
              onChange={(e) => set("upLimit", e.target.value)}
              disabled={!fields.upEnabled || fields.honorsSession}
            />
          </div>

          <div className="group">{t("Priority and queue")}</div>
          <label className="field">
            <span>{t("Bandwidth priority")}</span>
            <select value={fields.priority} onChange={(e) => set("priority", e.target.value)}>
              <option value="-1">{t("Low")}</option>
              <option value="0">{t("Normal")}</option>
              <option value="1">{t("High")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("Queue position (0 = first)")}</span>
            <input
              className="narrow-wide"
              value={fields.queuePos}
              onChange={(e) => set("queuePos", e.target.value)}
            />
          </label>

          <div className="group">{t("Seed ratio")}</div>
          <label className="field">
            <span>{t("Mode")}</span>
            <select value={fields.ratioMode} onChange={(e) => set("ratioMode", e.target.value)}>
              <option value="0">{t("Use global")}</option>
              <option value="1">{t("Custom")}</option>
              <option value="2">{t("Unlimited")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("Ratio limit")}</span>
            <input
              className="narrow-wide"
              value={fields.ratioLimit}
              onChange={(e) => set("ratioLimit", e.target.value)}
              disabled={fields.ratioMode !== "1"}
            />
          </label>

          <div className="group">{t("Peers and seeding")}</div>
          <label className="field">
            <span>{t("Peer limit")}</span>
            <input
              className="narrow-wide"
              value={fields.peerLimit}
              onChange={(e) => set("peerLimit", e.target.value)}
            />
          </label>
          <p className="muted">
            {t("The most peers this torrent may connect to. 0 means none, not the server default.")}
          </p>
          <label className="field">
            <span>{t("Stop seeding when inactive")}</span>
            <select value={fields.idleMode} onChange={(e) => set("idleMode", e.target.value)}>
              <option value="0">{t("Use global")}</option>
              <option value="1">{t("Custom")}</option>
              <option value="2">{t("Unlimited")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("Idle limit (minutes)")}</span>
            <input
              className="narrow-wide"
              value={fields.idleLimit}
              onChange={(e) => set("idleLimit", e.target.value)}
              disabled={fields.idleMode !== "1"}
            />
          </label>

          <div className="group">{t("Trackers")}</div>
          <label className="field">
            <span>{t("One tracker URL per line")}</span>
            <textarea
              rows={5}
              spellCheck={false}
              value={fields.trackers}
              onChange={(e) => set("trackers", e.target.value)}
            />
          </label>
        </div>
      )}
    </Modal>
  );
}
