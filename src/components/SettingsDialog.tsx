import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n";
import { rpc } from "../api";
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
  portForwarding: boolean;
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
    portForwarding: !!s["port-forwarding-enabled"],
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
    "port-forwarding-enabled": f.portForwarding,
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
  const t = useT();
  const [fields, setFields] = useState<Fields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [portBusy, setPortBusy] = useState(false);
  const [portOpen, setPortOpen] = useState<boolean | null>(null);

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

  // Ask the daemon to probe its own peer port. This is a daemon-side test: it
  // does not tell us anything about our connection to it.
  const testPort = async () => {
    setPortBusy(true);
    setPortOpen(null);
    try {
      const res = await rpc.portTest();
      setPortOpen(!!res["port-is-open"]);
    } catch (e) {
      setError(String(e));
    } finally {
      setPortBusy(false);
    }
  };

  return (
    <Modal
      title={t("Server / transfer settings")}
      width={540}
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
          <div className="group">{t("Directories")}</div>
          <label className="field">
            <span>{t("Default download directory")}</span>
            <input value={fields.downloadDir} onChange={(e) => set("downloadDir", e.target.value)} />
          </label>
          <label className="field">
            <span>{t("Incomplete directory")}</span>
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
            {t("Enable incomplete directory")}
          </label>

          <div className="group">{t("Speed limits (KB/s)")}</div>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.speedDownEnabled}
                onChange={(e) => set("speedDownEnabled", e.target.checked)}
              />
              {t("Download limit")}
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
              {t("Upload limit")}
            </label>
            <input
              className="narrow"
              value={fields.speedUp}
              onChange={(e) => set("speedUp", e.target.value)}
            />
          </div>

          <div className="group">{t("Alternative speed limits (night/busy)")}</div>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.altEnabled}
              onChange={(e) => set("altEnabled", e.target.checked)}
            />
            {t("Enable alternative speed limits")}
          </label>
          <div className="kv-inline">
            <span className="muted">{t("Download")}</span>
            <input className="narrow" value={fields.altDown} onChange={(e) => set("altDown", e.target.value)} />
            <span className="muted">{t("Upload")}</span>
            <input className="narrow" value={fields.altUp} onChange={(e) => set("altUp", e.target.value)} />
          </div>

          <div className="group">{t("Network")}</div>
          <div className="kv-inline">
            <span className="muted">{t("Listening port")}</span>
            <input className="narrow" value={fields.peerPort} onChange={(e) => set("peerPort", e.target.value)} />
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.peerPortRandom}
                onChange={(e) => set("peerPortRandom", e.target.checked)}
              />
              {t("Randomize on start")}
            </label>
          </div>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.portForwarding}
                onChange={(e) => set("portForwarding", e.target.checked)}
              />
              {t("Enable port forwarding")}
            </label>
            <button className="btn" onClick={testPort} disabled={portBusy || busy}>
              {portBusy ? t("Testing…") : t("Test port")}
            </button>
            {portOpen !== null && (
              <span className={portOpen ? "up" : "down"}>
                {portOpen ? t("Port is open") : t("Port is closed")}
              </span>
            )}
          </div>
          <label className="field">
            <span>{t("Encryption")}</span>
            <select value={fields.encryption} onChange={(e) => set("encryption", e.target.value)}>
              <option value="preferred">{t("Preferred")}</option>
              <option value="required">{t("Required")}</option>
              <option value="tolerated">{t("Tolerated")}</option>
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

          <div className="group">{t("Behavior")}</div>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.startAdded}
              onChange={(e) => set("startAdded", e.target.checked)}
            />
            {t("Start added torrents automatically")}
          </label>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.renamePartial}
              onChange={(e) => set("renamePartial", e.target.checked)}
            />
            {t("Append .part to incomplete files")}
          </label>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.seedRatioLimited}
                onChange={(e) => set("seedRatioLimited", e.target.checked)}
              />
              {t("Seed ratio limit")}
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
