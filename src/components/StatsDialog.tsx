import { useCallback, useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n";
import { rpc } from "../api";
import { formatBytes, formatDuration, formatRatio, formatSpeed, formatPercent } from "../format";
import type { SessionStats, StatsBucket } from "../types";

interface Props {
  onClose: () => void;
  /** Directory whose free space is reported (the session download dir). */
  downloadDir: string;
}

const ratio = (b: StatsBucket | undefined) =>
  b && b.downloadedBytes > 0 ? b.uploadedBytes / b.downloadedBytes : 0;

export function StatsDialog({ onClose, downloadDir }: Props) {
  const t = useT();
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [free, setFree] = useState<{ free: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const s = await rpc.sessionStats();
      setStats(s);
      if (downloadDir) {
        try {
          const f = await rpc.freeSpace(downloadDir);
          // The daemon answers -1 when it cannot stat the path (a download dir
          // that does not exist yet, for instance) — that is "unknown", not a
          // number to render.
          if (f["size-bytes"] >= 0) {
            setFree({ free: f["size-bytes"], total: f.total_size ?? f.totalSize ?? 0 });
          } else {
            setFree(null);
          }
        } catch {
          setFree(null);
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [downloadDir]);

  useEffect(() => {
    void load();
  }, [load]);

  const cur = stats?.["current-stats"];
  const cum = stats?.["cumulative-stats"];

  const row = (label: string, current: string, cumulative: string) => (
    <>
      <div className="kv-key">{label}</div>
      <div className="kv-val">{current}</div>
      <div className="kv-val">{cumulative}</div>
    </>
  );

  return (
    <Modal
      title={t("Statistics")}
      width={560}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          {busy && <span className="muted">{t("Loading…")}</span>}
          <button className="btn" onClick={onClose}>
            {t("Close")}
          </button>
          <button className="btn primary" onClick={load} disabled={busy}>
            {t("Refresh")}
          </button>
        </>
      }
    >
      {error && <div className="error inline">{error}</div>}
      {!stats && !error && <div className="muted">{t("Loading…")}</div>}

      {stats && (
        <div className="settings-form compact">
          <div className="group">{t("Torrents")}</div>
          <div className="kv-grid two">
            <div className="kv-key">{t("Torrent count")}</div>
            <div className="kv-val">{stats.torrentCount}</div>
            <div className="kv-key">{t("Active")}</div>
            <div className="kv-val">{stats.activeTorrentCount}</div>
            <div className="kv-key">{t("Paused")}</div>
            <div className="kv-val">{stats.pausedTorrentCount}</div>
            <div className="kv-key">{t("Files added")}</div>
            <div className="kv-val">{cum?.filesAdded ?? 0}</div>
          </div>

          <div className="group">{t("Data display")}</div>
          <div className="kv-grid three">
            <div className="kv-key" />
            <div className="kv-val">{t("Current")}</div>
            <div className="kv-val">{t("Cumulative")}</div>
            {row(t("Download speed"), formatSpeed(stats.downloadSpeed), "-")}
            {row(t("Upload speed"), formatSpeed(stats.uploadSpeed), "-")}
            {row(
              t("Downloaded"),
              formatBytes(cur?.downloadedBytes ?? 0),
              formatBytes(cum?.downloadedBytes ?? 0),
            )}
            {row(
              t("Uploaded"),
              formatBytes(cur?.uploadedBytes ?? 0),
              formatBytes(cum?.uploadedBytes ?? 0),
            )}
            {row(t("Share ratio"), formatRatio(ratio(cur)), formatRatio(ratio(cum)))}
            {row(
              t("Active time"),
              formatDuration(cur?.secondsActive ?? 0, t),
              formatDuration(cum?.secondsActive ?? 0, t),
            )}
          </div>

          {free && (
            <>
              <div className="group">{t("Free disk space:")}</div>
              <div className="kv-grid two">
                <div className="kv-key">{t("Free")}</div>
                <div className="kv-val">{formatBytes(free.free)}</div>
                <div className="kv-key">{t("Total size:")}</div>
                <div className="kv-val">
                  {free.total > 0 ? (
                    <>
                      {formatBytes(free.total)}{" "}
                      <span className="muted">
                        ({formatPercent(free.free / free.total)} {t("free")})
                      </span>
                    </>
                  ) : (
                    <span className="muted">{t("Unknown")}</span>
                  )}
                </div>
                <div className="kv-key">{t("Path")}</div>
                <div className="kv-val mono ellipsis">{downloadDir}</div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
