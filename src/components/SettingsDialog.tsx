import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n";
import { rpc, type GeoIpStatus } from "../api";
import type { SessionInfo } from "../types";
import type { PathMapping } from "../paths";

interface Props {
  onLoad: () => Promise<SessionInfo>;
  onClose: () => void;
  onApply: (patch: Record<string, unknown>) => Promise<void>;
  /** Client-side preference: kept in the local store, not on the daemon. */
  notifyOnComplete: boolean;
  onNotifyChange: (on: boolean) => void;
  /** Client-side too: how daemon paths map onto this machine. */
  pathMap: PathMapping[];
  onPathMapChange: (list: PathMapping[]) => void;
  /** Resolve to a status message, or throw/"" to stay quiet (e.g. cancelled). */
  onExportSettings: () => Promise<string>;
  onImportSettings: () => Promise<string>;
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
  startAdded: boolean;
  renamePartial: boolean;
  seedRatioLimit: string;
  seedRatioLimited: boolean;
  altTimeEnabled: boolean;
  altTimeBegin: string;
  altTimeEnd: string;
  /** Kept as the raw bit mask so a custom schedule survives a round trip. */
  altTimeDay: string;
  peerLimitGlobal: string;
  peerLimitTorrent: string;
  downloadQueueEnabled: boolean;
  downloadQueueSize: string;
  seedQueueEnabled: boolean;
  seedQueueSize: string;
  queueStalledEnabled: boolean;
  queueStalledMinutes: string;
  cacheSizeMb: string;
  idleSeedingEnabled: boolean;
  idleSeedingLimit: string;
  blocklistEnabled: boolean;
  blocklistUrl: string;
  /** Read-only: how many rules the daemon currently has loaded. */
  blocklistSize: number;
  trashOriginal: boolean;
  defaultTrackers: string;
  sequential: boolean;
  transportTcp: boolean;
  transportUtp: boolean;
  abfEnabled: boolean;
  abfThreshold: string;
  scriptAddedEnabled: boolean;
  scriptAddedFilename: string;
  scriptDoneEnabled: boolean;
  scriptDoneFilename: string;
  scriptSeedingEnabled: boolean;
  scriptSeedingFilename: string;
}

const numStr = (v: unknown) => (v == null ? "" : String(v));

/** preferred_transports arrives as an array; daemons that lack it send none. */
const transports = (s: SessionInfo): string[] =>
  Array.isArray(s.preferred_transports) ? s.preferred_transports : [];

/** Sunday-first bits, matching how Transmission encodes alt-speed-time-day. */
const DAY_BITS = [1, 2, 4, 8, 16, 32, 64];
const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Transmission stores these as minutes since midnight. */
function minsToTime(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "00:00";
  const h = Math.floor(n / 60) % 24;
  const m = Math.floor(n % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMins(v: string): number {
  const parts = v.trim().split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(1439, Math.floor(h) * 60 + Math.floor(m)));
}

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
    startAdded: !!s["start-added-torrents"],
    renamePartial: !!s["rename-partial-files"],
    seedRatioLimit: numStr(s["seedRatioLimit"]),
    seedRatioLimited: !!s["seedRatioLimited"],
    altTimeEnabled: !!s["alt-speed-time-enabled"],
    altTimeBegin: minsToTime(s["alt-speed-time-begin"]),
    altTimeEnd: minsToTime(s["alt-speed-time-end"]),
    altTimeDay: String(s["alt-speed-time-day"] ?? 127),
    peerLimitGlobal: numStr(s["peer-limit-global"]),
    peerLimitTorrent: numStr(s["peer-limit-per-torrent"]),
    downloadQueueEnabled: !!s["download-queue-enabled"],
    downloadQueueSize: numStr(s["download-queue-size"]),
    seedQueueEnabled: !!s["seed-queue-enabled"],
    seedQueueSize: numStr(s["seed-queue-size"]),
    queueStalledEnabled: !!s["queue-stalled-enabled"],
    queueStalledMinutes: numStr(s["queue-stalled-minutes"]),
    cacheSizeMb: numStr(s["cache-size-mb"]),
    idleSeedingEnabled: !!s["idle-seeding-limit-enabled"],
    idleSeedingLimit: numStr(s["idle-seeding-limit"]),
    blocklistEnabled: !!s["blocklist-enabled"],
    blocklistUrl: String(s["blocklist-url"] ?? ""),
    blocklistSize: Number(s["blocklist-size"] ?? 0),
    trashOriginal: !!s["trash-original-torrent-files"],
    defaultTrackers: String(s["default-trackers"] ?? ""),
    sequential: !!s["sequential_download"],
    transportTcp: transports(s).includes("tcp"),
    transportUtp: transports(s).includes("utp"),
    abfEnabled: !!s["anti-brute-force-enabled"],
    abfThreshold: numStr(s["anti-brute-force-threshold"]),
    scriptAddedEnabled: !!s["script-torrent-added-enabled"],
    scriptAddedFilename: String(s["script-torrent-added-filename"] ?? ""),
    scriptDoneEnabled: !!s["script-torrent-done-enabled"],
    scriptDoneFilename: String(s["script-torrent-done-filename"] ?? ""),
    scriptSeedingEnabled: !!s["script-torrent-done-seeding-enabled"],
    scriptSeedingFilename: String(s["script-torrent-done-seeding-filename"] ?? ""),
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
    // Legacy alias kept in step with preferred_transports for older daemons.
    "utp-enabled": f.transportUtp,
    "start-added-torrents": f.startAdded,
    "rename-partial-files": f.renamePartial,
    seedRatioLimit: n(f.seedRatioLimit),
    seedRatioLimited: f.seedRatioLimited,
    "alt-speed-time-enabled": f.altTimeEnabled,
    "alt-speed-time-begin": timeToMins(f.altTimeBegin),
    "alt-speed-time-end": timeToMins(f.altTimeEnd),
    "alt-speed-time-day": n(f.altTimeDay),
    "peer-limit-global": n(f.peerLimitGlobal),
    "peer-limit-per-torrent": n(f.peerLimitTorrent),
    "download-queue-enabled": f.downloadQueueEnabled,
    "download-queue-size": n(f.downloadQueueSize),
    "seed-queue-enabled": f.seedQueueEnabled,
    "seed-queue-size": n(f.seedQueueSize),
    "queue-stalled-enabled": f.queueStalledEnabled,
    "queue-stalled-minutes": n(f.queueStalledMinutes),
    "cache-size-mb": n(f.cacheSizeMb),
    "idle-seeding-limit-enabled": f.idleSeedingEnabled,
    "idle-seeding-limit": n(f.idleSeedingLimit),
    "blocklist-enabled": f.blocklistEnabled,
    "blocklist-url": f.blocklistUrl.trim(),
    // blocklist-size is an accessor; the daemon owns it.
    "trash-original-torrent-files": f.trashOriginal,
    "default-trackers": f.defaultTrackers.trim(),
    sequential_download: f.sequential,
    // The daemon wants an array here; an empty one would leave it with no way
    // to reach peers, so keep TCP as the floor.
    preferred_transports: tcpFloor(f),
    "anti-brute-force-enabled": f.abfEnabled,
    "anti-brute-force-threshold": n(f.abfThreshold),
    "script-torrent-added-enabled": f.scriptAddedEnabled,
    "script-torrent-added-filename": f.scriptAddedFilename.trim(),
    "script-torrent-done-enabled": f.scriptDoneEnabled,
    "script-torrent-done-filename": f.scriptDoneFilename.trim(),
    "script-torrent-done-seeding-enabled": f.scriptSeedingEnabled,
    "script-torrent-done-seeding-filename": f.scriptSeedingFilename.trim(),
  };
}

function tcpFloor(f: Fields): string[] {
  const list: string[] = [];
  if (f.transportTcp) list.push("tcp");
  if (f.transportUtp) list.push("utp");
  return list.length > 0 ? list : ["tcp"];
}

export function SettingsDialog({
  onLoad,
  onClose,
  onApply,
  notifyOnComplete,
  onNotifyChange,
  pathMap,
  onPathMapChange,
  onExportSettings,
  onImportSettings,
}: Props) {
  const t = useT();
  const [fields, setFields] = useState<Fields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [portBusy, setPortBusy] = useState(false);
  const [portOpen, setPortOpen] = useState<boolean | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMsg, setFileMsg] = useState("");
  const [geo, setGeo] = useState<GeoIpStatus | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");

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

  // The daemon downloads the blocklist itself; we only trigger it and read back
  // the new rule count.
  const updateBlocklist = async () => {
    setBlockBusy(true);
    setError("");
    try {
      const res = await rpc.blocklistUpdate();
      const size = Number(res["blocklist-size"] ?? 0);
      setFields((f) => (f ? { ...f, blocklistSize: size } : f));
    } catch (e) {
      setError(String(e));
    } finally {
      setBlockBusy(false);
    }
  };

  // Export/import run through the app, which owns the settings state.
  const runFile = async (action: () => Promise<string>) => {
    setFileBusy(true);
    setFileMsg("");
    try {
      setFileMsg(await action());
    } catch (e) {
      setFileMsg(String(e));
    } finally {
      setFileBusy(false);
    }
  };

  // The country database is optional and lives outside the daemon.
  useEffect(() => {
    void (async () => {
      try {
        setGeo(await rpc.geoipStatus());
      } catch {
        setGeo(null);
      }
    })();
  }, []);
  const runGeo = async (action: () => Promise<GeoIpStatus>) => {
    setGeoBusy(true);
    setGeoMsg("");
    try {
      setGeo(await action());
    } catch (e) {
      setGeoMsg(String(e));
    } finally {
      setGeoBusy(false);
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
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.altTimeEnabled}
              onChange={(e) => set("altTimeEnabled", e.target.checked)}
            />
            {t("Schedule alternative limits")}
          </label>
          <div className="kv-inline">
            <span className="muted">{t("From")}</span>
            <input
              type="time"
              value={fields.altTimeBegin}
              onChange={(e) => set("altTimeBegin", e.target.value)}
              disabled={!fields.altTimeEnabled}
            />
            <span className="muted">{t("To")}</span>
            <input
              type="time"
              value={fields.altTimeEnd}
              onChange={(e) => set("altTimeEnd", e.target.value)}
              disabled={!fields.altTimeEnabled}
            />
          </div>
          <div className="kv-inline">
            <span className="muted">{t("On days")}</span>
            {DAY_KEYS.map((day, i) => (
              <label key={day} className="chk">
                <input
                  type="checkbox"
                  checked={(Number(fields.altTimeDay) & DAY_BITS[i]) !== 0}
                  disabled={!fields.altTimeEnabled}
                  onChange={(e) => {
                    const cur = Number(fields.altTimeDay) || 0;
                    const next = e.target.checked ? cur | DAY_BITS[i] : cur & ~DAY_BITS[i];
                    set("altTimeDay", String(next));
                  }}
                />
                {day}
              </label>
            ))}
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
          </div>
          <div className="kv-inline">
            <span className="muted">{t("Transports")}</span>
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.transportTcp}
                onChange={(e) => set("transportTcp", e.target.checked)}
              />
              TCP
            </label>
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.transportUtp}
                onChange={(e) => set("transportUtp", e.target.checked)}
              />
              µTP
            </label>
          </div>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.abfEnabled}
                onChange={(e) => set("abfEnabled", e.target.checked)}
              />
              {t("Refuse brute-force RPC attempts after")}
            </label>
            <input
              className="narrow"
              value={fields.abfThreshold}
              onChange={(e) => set("abfThreshold", e.target.value)}
            />
          </div>

          <div className="group">{t("Peers and queue")}</div>
          <div className="kv-inline">
            <span className="muted">{t("Max peers overall")}</span>
            <input
              className="narrow"
              value={fields.peerLimitGlobal}
              onChange={(e) => set("peerLimitGlobal", e.target.value)}
            />
            <span className="muted">{t("per torrent")}</span>
            <input
              className="narrow"
              value={fields.peerLimitTorrent}
              onChange={(e) => set("peerLimitTorrent", e.target.value)}
            />
          </div>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.downloadQueueEnabled}
                onChange={(e) => set("downloadQueueEnabled", e.target.checked)}
              />
              {t("Download queue")}
            </label>
            <input
              className="narrow"
              value={fields.downloadQueueSize}
              onChange={(e) => set("downloadQueueSize", e.target.value)}
              disabled={!fields.downloadQueueEnabled}
            />
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.seedQueueEnabled}
                onChange={(e) => set("seedQueueEnabled", e.target.checked)}
              />
              {t("Seed queue")}
            </label>
            <input
              className="narrow"
              value={fields.seedQueueSize}
              onChange={(e) => set("seedQueueSize", e.target.value)}
              disabled={!fields.seedQueueEnabled}
            />
          </div>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.queueStalledEnabled}
                onChange={(e) => set("queueStalledEnabled", e.target.checked)}
              />
              {t("Stalled torrents leave the queue after")}
            </label>
            <input
              className="narrow"
              value={fields.queueStalledMinutes}
              onChange={(e) => set("queueStalledMinutes", e.target.value)}
              disabled={!fields.queueStalledEnabled}
            />
            <span className="muted">{t("min")}</span>
          </div>
          <div className="kv-inline">
            <span className="muted">{t("Disk cache (MB)")}</span>
            <input
              className="narrow"
              value={fields.cacheSizeMb}
              onChange={(e) => set("cacheSizeMb", e.target.value)}
            />
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.idleSeedingEnabled}
                onChange={(e) => set("idleSeedingEnabled", e.target.checked)}
              />
              {t("Stop seeding when idle for")}
            </label>
            <input
              className="narrow"
              value={fields.idleSeedingLimit}
              onChange={(e) => set("idleSeedingLimit", e.target.value)}
              disabled={!fields.idleSeedingEnabled}
            />
            <span className="muted">{t("min")}</span>
          </div>

          <div className="group">{t("Blocklist")}</div>
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.blocklistEnabled}
              onChange={(e) => set("blocklistEnabled", e.target.checked)}
            />
            {t("Enable blocklist")}
          </label>
          <label className="field">
            <span>{t("Blocklist URL")}</span>
            <input
              className="mono"
              value={fields.blocklistUrl}
              onChange={(e) => set("blocklistUrl", e.target.value)}
            />
          </label>
          <div className="kv-inline">
            <button className="btn" onClick={updateBlocklist} disabled={blockBusy || busy}>
              {blockBusy ? t("Updating…") : t("Update now")}
            </button>
            <span className="muted">{t("{n} rules loaded", { n: fields.blocklistSize })}</span>
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
              checked={fields.sequential}
              onChange={(e) => set("sequential", e.target.checked)}
            />
            {t("Download pieces in order")}
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
          <label className="chk">
            <input
              type="checkbox"
              checked={fields.trashOriginal}
              onChange={(e) => set("trashOriginal", e.target.checked)}
            />
            {t("Move original .torrent to the trash")}
          </label>
          <label className="field">
            <span>{t("Default trackers")}</span>
            <input
              className="mono"
              value={fields.defaultTrackers}
              onChange={(e) => set("defaultTrackers", e.target.value)}
            />
          </label>

          <div className="group">{t("Event scripts")}</div>
          <p className="muted">{t("Run a command on the daemon when an event happens.")}</p>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.scriptAddedEnabled}
                onChange={(e) => set("scriptAddedEnabled", e.target.checked)}
              />
              {t("Torrent added")}
            </label>
            <input
              className="mono"
              value={fields.scriptAddedFilename}
              onChange={(e) => set("scriptAddedFilename", e.target.value)}
            />
          </div>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.scriptDoneEnabled}
                onChange={(e) => set("scriptDoneEnabled", e.target.checked)}
              />
              {t("Download finished")}
            </label>
            <input
              className="mono"
              value={fields.scriptDoneFilename}
              onChange={(e) => set("scriptDoneFilename", e.target.value)}
            />
          </div>
          <div className="kv-inline">
            <label className="chk">
              <input
                type="checkbox"
                checked={fields.scriptSeedingEnabled}
                onChange={(e) => set("scriptSeedingEnabled", e.target.checked)}
              />
              {t("Seeding finished")}
            </label>
            <input
              className="mono"
              value={fields.scriptSeedingFilename}
              onChange={(e) => set("scriptSeedingFilename", e.target.value)}
            />
          </div>

          {/* Client-side, so it sits apart from the daemon settings above. */}
          <div className="group">{t("This machine")}</div>
          <label className="chk">
            <input
              type="checkbox"
              checked={notifyOnComplete}
              onChange={(e) => onNotifyChange(e.target.checked)}
            />
            {t("Notify me when a download finishes")}
          </label>
          <p className="muted">{t("Kept on this machine, not on the daemon.")}</p>

          <div className="pathmap">
            <div className="pathmap-head">
              <span>{t("Path mapping")}</span>
              <button
                className="btn icon small"
                onClick={() => onPathMapChange([...pathMap, { remote: "", local: "" }])}
              >
                {t("Add row")}
              </button>
            </div>
            <p className="muted">
              {t("Daemon paths → this machine. Longest matching prefix wins.")}
            </p>
            {pathMap.length === 0 && <p className="muted">{t("No mappings yet.")}</p>}
            {pathMap.map((m, i) => (
              <div className="pathmap-row" key={i}>
                <input
                  className="mono"
                  value={m.remote}
                  placeholder={t("Remote path")}
                  onChange={(e) =>
                    onPathMapChange(
                      pathMap.map((x, j) => (j === i ? { ...x, remote: e.target.value } : x)),
                    )
                  }
                />
                <span className="pathmap-arrow">→</span>
                <input
                  className="mono"
                  value={m.local}
                  placeholder={t("Local path")}
                  onChange={(e) =>
                    onPathMapChange(
                      pathMap.map((x, j) => (j === i ? { ...x, local: e.target.value } : x)),
                    )
                  }
                />
                <button
                  className="btn icon small"
                  title={t("Remove")}
                  onClick={() => onPathMapChange(pathMap.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="settings-file">
            <div className="pathmap-head">
              <span>{t("Settings file")}</span>
            </div>
            <p className="muted">{t("Passwords are never written to an exported file.")}</p>
            <div className="inline-actions">
              <button
                className="btn"
                disabled={fileBusy}
                onClick={() => void runFile(onExportSettings)}
              >
                {t("Export…")}
              </button>
              <button
                className="btn"
                disabled={fileBusy}
                onClick={() => void runFile(onImportSettings)}
              >
                {t("Import…")}
              </button>
              {fileMsg && <span className="muted">{fileMsg}</span>}
            </div>
          </div>

          <div className="settings-file">
            <div className="pathmap-head">
              <span>{t("Country lookup")}</span>
            </div>
            <p className="muted">
              {t("Peer countries come from a database you download on demand. Addresses are never sent anywhere.")}
            </p>
            <div className="inline-actions">
              <button className="btn" disabled={geoBusy} onClick={() => void runGeo(rpc.geoipDownload)}>
                {geo?.installed ? t("Update") : t("Download")}…
              </button>
              {geo?.installed && (
                <button
                  className="btn danger"
                  disabled={geoBusy}
                  onClick={() => void runGeo(rpc.geoipClear)}
                >
                  {t("Remove")}
                </button>
              )}
              <span className="muted">
                {geoBusy
                  ? t("Working…")
                  : geo?.installed
                    ? `${t("Installed")} · ${geo.entries.toLocaleString()} · ${(geo.bytes / 1048576).toFixed(1)} MB · ${new Date((geo.updatedAt ?? 0) * 1000).toLocaleDateString()}`
                    : t("Not installed")}
              </span>
            </div>
            {geoMsg && <p className="muted">{geoMsg}</p>}
            <p className="muted">{t("Data: DB-IP Lite (CC BY 4.0)")}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
