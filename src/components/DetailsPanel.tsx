import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FileStat, TorrentDetail } from "../types";
import { useT } from "../i18n";
import { rpc } from "../api";
import { copyText } from "../clipboard";
import type { TFn } from "../format";
import { formatBytes, formatDate, formatDuration, formatPercent, formatRatio, formatSpeed } from "../format";
import { PromptDialog } from "./PromptDialog";
import { MoveLocationDialog } from "./MoveLocationDialog";

interface Props {
  detail: TorrentDetail | null;
  loading: boolean;
  /**
   * Local path to hand the OS for `detail.downloadDir` — the daemon path when
   * it shares this filesystem, else translated through the path mapping.
   * null when it cannot be opened from here.
   */
  revealTarget: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

type Tab = "info" | "files" | "peers" | "trackers";

/**
 * Regional-indicator pair for a two-letter country code, so flags need no image
 * assets. Returns "" for anything that is not a country code.
 */
function flagEmoji(code: string): string {
  if (code.length !== 2) return "";
  const upper = code.toUpperCase();
  const points = [...upper].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  if (points.some((p) => p < 0x1f1e6 || p > 0x1f1ff)) return "";
  return String.fromCodePoint(...points);
}

const TABS: { id: Tab; labelKey: string }[] = [
  { id: "info", labelKey: "General" },
  { id: "files", labelKey: "Files" },
  { id: "peers", labelKey: "Peers" },
  { id: "trackers", labelKey: "Trackers" },
];

const ANNOUNCE_KEY = [
  "tracker.state.disabled",
  "tracker.state.waiting",
  "tracker.state.queued",
  "tracker.state.active",
];

function filePriority(stat: FileStat | undefined, t: TFn): string {
  if (!stat) return "-";
  if (!stat.wanted) return t("Skip");
  if (stat.priority === 1) return t("High");
  if (stat.priority === -1) return t("Low");
  return t("Normal");
}

/** The trailing component of a torrent-relative path; that is what gets renamed. */
const basename = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <div className="kv-key">{label}</div>
      <div className="kv-val">{value}</div>
    </>
  );
}

export function DetailsPanel({ detail, loading, revealTarget, onClose, onRefresh }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("info");
  const [copied, setCopied] = useState("");
  const [renaming, setRenaming] = useState<{ path: string; initial: string } | null>(null);
  const [trackerAdd, setTrackerAdd] = useState(false);
  const [trackerEdit, setTrackerEdit] = useState<{ id: number; url: string } | null>(null);
  const [moving, setMoving] = useState(false);
  /** Reverse-DNS results, keyed by peer address. Filled only on request. */
  const [hostnames, setHostnames] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(false);

  const doCopy = async (what: string, text: string) => {
    if (await copyText(text)) {
      setCopied(what);
      window.setTimeout(() => setCopied(""), 1500);
    }
  };

  if (!detail) {
    return (
      <section className="details empty-details">
        <span className="muted">{t("Double-click a torrent to see details")}</span>
      </section>
    );
  }

  const files = detail.files ?? [];
  const fileStats = detail.fileStats ?? [];
  const peers = detail.peers ?? [];
  const trackers = detail.trackerStats ?? [];

  // Explicit, user-triggered reverse DNS. Sends the peer addresses to the local
  // resolver, so it never runs on its own; the IP is kept when there is no PTR.
  const resolveHostNames = async () => {
    const ips = [...new Set(peers.map((p) => p.address).filter(Boolean))].sort();
    if (ips.length === 0) return;
    setResolving(true);
    try {
      setHostnames(await rpc.resolveHostNames(ips));
    } catch {
      // Best-effort: on failure the addresses stay as plain IPs.
    } finally {
      setResolving(false);
    }
  };

  // Countries come from the optional database; without it the column stays
  // empty rather than guessing. Keyed on the address set so the details refresh
  // every couple of seconds does not re-ask for the same list.
  const [countries, setCountries] = useState<Record<string, string>>({});
  const peerKey = useMemo(
    () => [...new Set(peers.map((p) => p.address).filter(Boolean))].sort().join("|"),
    [peers],
  );
  useEffect(() => {
    const list = peerKey ? peerKey.split("|") : [];
    if (list.length === 0) {
      setCountries({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const found = await rpc.geoipLookup(list);
        if (!cancelled) setCountries(found);
      } catch {
        // Optional feature: no database just means no flags.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peerKey]);

  const copyBtn = (what: string, text: string) => (
    <button
      className="btn icon small"
      title={t("Copy")}
      onClick={() => void doCopy(what, text)}
      disabled={!text}
    >
      ⧉
    </button>
  );

  return (
    <section className="details">
      <header className="details-head">
        <div className="details-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={`tab ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
              {item.id === "files" && files.length > 0 && <span className="badge">{files.length}</span>}
              {item.id === "peers" && peers.length > 0 && <span className="badge">{peers.length}</span>}
              {item.id === "trackers" && trackers.length > 0 && (
                <span className="badge">{trackers.length}</span>
              )}
            </button>
          ))}
        </div>
        <span className="details-title" title={detail.name}>
          {detail.name}
        </span>
        <span className="spacer" />
        {copied && <span className="up">{t("Copied")}</span>}
        {loading && <span className="muted">{t("Refreshing…")}</span>}
        <button
          className="btn"
          disabled={!revealTarget}
          title={
            revealTarget ??
            t("Set a path mapping to open the daemon's folders from this machine")
          }
          onClick={() => {
            if (revealTarget) void rpc.revealPath(revealTarget);
          }}
        >
          {t("Show in folder")}
        </button>
        <button className="btn" onClick={() => setMoving(true)}>
          {t("Move data")}…
        </button>
        <button className="btn" onClick={onRefresh}>
          {t("Refresh")}
        </button>
        <button className="btn" onClick={onClose}>
          {t("Close")}
        </button>
      </header>

      <div className="details-body">
        {tab === "info" && (
          <div className="kv-grid">
            <Row
              label={t("Name")}
              value={
                <span className="inline-actions">
                  <span>{detail.name}</span>
                  <button
                    className="btn icon small"
                    title={t("Rename")}
                    onClick={() => setRenaming({ path: detail.name, initial: detail.name })}
                  >
                    ✎
                  </button>
                </span>
              }
            />
            <Row
              label={t("Hash")}
              value={
                <span className="inline-actions">
                  <span className="mono">{detail.hashString}</span>
                  {copyBtn("hash", detail.hashString)}
                </span>
              }
            />
            <Row
              label={t("Size")}
              value={t("{size} (downloaded {down} / uploaded {up})", {
                size: formatBytes(detail.totalSize),
                down: formatBytes(detail.downloadedEver),
                up: formatBytes(detail.uploadedEver),
              })}
            />
            <Row label={t("Ratio")} value={formatRatio(detail.uploadRatio)} />
            <Row
              label={t("Download directory")}
              value={
                <span className="inline-actions">
                  <span className="mono ellipsis">{detail.downloadDir}</span>
                  {copyBtn("dir", detail.downloadDir)}
                </span>
              }
            />
            {revealTarget && revealTarget !== detail.downloadDir && (
              <Row
                label={t("Local path")}
                value={
                  <span className="inline-actions">
                    <span className="mono ellipsis">{revealTarget}</span>
                    {copyBtn("local", revealTarget)}
                  </span>
                }
              />
            )}
            <Row label={t("Added")} value={formatDate(detail.addedDate)} />
            <Row label={t("Completed")} value={detail.doneDate > 0 ? formatDate(detail.doneDate) : "-"} />
            <Row label={t("Last activity")} value={formatDate(detail.activityDate)} />
            <Row
              label={t("Downloaded / seeded time")}
              value={`${formatDuration(detail.secondsDownloading, t)} / ${formatDuration(detail.secondsSeeding, t)}`}
            />
            <Row label={t("Pieces")} value={`${detail.pieceCount} × ${formatBytes(detail.pieceSize)}`} />
            <Row
              label={t("Speed limits")}
              value={`↓ ${detail.downloadLimited ? formatSpeed(detail.downloadLimit) : t("Unlimited")} · ↑ ${
                detail.uploadLimited ? formatSpeed(detail.uploadLimit) : t("Unlimited")
              }`}
            />
            <Row
              label={t("Seed ratio goal")}
              value={detail.seedRatioMode === 1 ? formatRatio(detail.seedRatioLimit) : t("Global")}
            />
            <Row label={t("Private torrent")} value={detail.isPrivate ? t("Yes") : t("No")} />
            <Row label={t("Creator")} value={detail.creator || "-"} />
            <Row label={t("Comment")} value={detail.comment || "-"} />
            <Row
              label={t("Magnet")}
              value={
                <span className="inline-actions">
                  <span className="mono ellipsis">{detail.magnetLink}</span>
                  {copyBtn("magnet", detail.magnetLink)}
                </span>
              }
            />
          </div>
        )}

        {tab === "files" && (
          <table className="sub-table">
            <thead>
              <tr>
                <th>{t("File")}</th>
                <th className="num">{t("Size")}</th>
                <th className="col-prog">{t("Done")}</th>
                <th>{t("Priority")}</th>
                <th className="col-act" />
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && (
                <tr>
                  <td className="empty" colSpan={5}>
                    {t("No file information")}
                  </td>
                </tr>
              )}
              {files.map((f, i) => {
                const done = f.length > 0 ? f.bytesCompleted / f.length : 0;
                return (
                  <tr key={i}>
                    <td className="ellipsis" title={f.name}>
                      {f.name}
                    </td>
                    <td className="num">{formatBytes(f.length)}</td>
                    <td className="col-prog">
                      <div className="prog small">
                        <div className="prog-fill" style={{ width: `${done * 100}%` }} />
                        <span className="prog-text">{formatPercent(done)}</span>
                      </div>
                    </td>
                    <td>{filePriority(fileStats[i], t)}</td>
                    <td className="col-act">
                      <button
                        className="btn icon small"
                        title={t("Rename")}
                        onClick={() => setRenaming({ path: f.name, initial: basename(f.name) })}
                      >
                        ✎
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "peers" && (
          <>
            <div className="tab-actions">
              <button
                className="btn"
                onClick={() => void resolveHostNames()}
                disabled={resolving || peers.length === 0}
              >
                {resolving ? t("Working…") : t("Resolve host names")}
              </button>
            </div>
            <table className="sub-table">
              <thead>
                <tr>
                  <th>{t("Address")}</th>
                  <th>{t("Host name")}</th>
                  <th>{t("Country")}</th>
                  <th>{t("Client")}</th>
                  <th>{t("Flags")}</th>
                  <th className="col-prog">{t("Progress")}</th>
                  <th className="num">{t("Download")}</th>
                  <th className="num">{t("Upload")}</th>
                </tr>
              </thead>
              <tbody>
                {peers.length === 0 && (
                  <tr>
                    <td className="empty" colSpan={8}>
                      {t("No connected peers")}
                    </td>
                  </tr>
                )}
                {peers.map((p, i) => (
                  <tr key={i}>
                    <td className="mono">{p.address}</td>
                    <td className="mono ellipsis" title={hostnames[p.address] ?? ""}>
                      {hostnames[p.address] ?? "-"}
                    </td>
                    <td className="mono">
                      {countries[p.address]
                        ? `${flagEmoji(countries[p.address])} ${countries[p.address]}`
                        : "-"}
                    </td>
                    <td>{p.clientName || "-"}</td>
                    <td className="mono">{p.flagStr}</td>
                    <td className="col-prog">
                      <div className="prog small">
                        <div className="prog-fill" style={{ width: `${(p.progress || 0) * 100}%` }} />
                        <span className="prog-text">{formatPercent(p.progress)}</span>
                      </div>
                    </td>
                    <td className="num down">{formatSpeed(p.rateToClient)}</td>
                    <td className="num up">{formatSpeed(p.rateToPeer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === "trackers" && (
          <>
            <div className="tab-actions">
              <button className="btn" onClick={() => setTrackerAdd(true)}>
                {t("Add tracker")}…
              </button>
            </div>
            <table className="sub-table">
              <thead>
                <tr>
                  <th>{t("Tracker")}</th>
                  <th>{t("Status")}</th>
                  <th className="num">{t("Seeds")}</th>
                  <th className="num">{t("Leechers")}</th>
                  <th>{t("Last result")}</th>
                  <th className="col-act" />
                </tr>
              </thead>
              <tbody>
                {trackers.length === 0 && (
                  <tr>
                    <td className="empty" colSpan={6}>
                      {t("No tracker information")}
                    </td>
                  </tr>
                )}
                {trackers.map((tr) => (
                  <tr key={tr.id}>
                    <td className="mono ellipsis" title={tr.announce}>
                      {tr.host || tr.announce}
                    </td>
                    <td>{ANNOUNCE_KEY[tr.announceState] ? t(ANNOUNCE_KEY[tr.announceState]) : "?"}</td>
                    <td className="num">{tr.seederCount}</td>
                    <td className="num">{tr.leecherCount}</td>
                    <td className={tr.lastAnnounceSucceeded ? "up" : "down"}>
                      {tr.lastAnnounceResult || "-"}
                    </td>
                    <td className="col-act">
                      <button
                        className="btn icon small"
                        title={t("Edit tracker")}
                        onClick={() => setTrackerEdit({ id: tr.id, url: tr.announce })}
                      >
                        ✎
                      </button>
                      <button
                        className="btn icon small danger"
                        title={t("Remove tracker")}
                        onClick={() => {
                          void (async () => {
                            await rpc.setTorrent([detail.id], { trackerRemove: [tr.id] });
                            onRefresh();
                          })();
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {renaming && (
        <PromptDialog
          title={t("Rename")}
          label={t("New name")}
          context={renaming.path}
          initial={renaming.initial}
          submitLabel={t("Rename")}
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            await rpc.renamePath(detail.id, renaming.path, name);
            onRefresh();
          }}
        />
      )}

      {trackerAdd && (
        <PromptDialog
          title={t("Add tracker")}
          label={t("Tracker URL")}
          placeholder="udp://tracker.example:6969/announce"
          submitLabel={t("Add")}
          onClose={() => setTrackerAdd(false)}
          onSubmit={async (url) => {
            await rpc.setTorrent([detail.id], { trackerAdd: [url] });
            onRefresh();
          }}
        />
      )}

      {trackerEdit && (
        <PromptDialog
          title={t("Edit tracker")}
          label={t("Tracker URL")}
          initial={trackerEdit.url}
          submitLabel={t("Apply")}
          onClose={() => setTrackerEdit(null)}
          onSubmit={async (url) => {
            await rpc.setTorrent([detail.id], { trackerReplace: [trackerEdit.id, url] });
            onRefresh();
          }}
        />
      )}

      {moving && (
        <MoveLocationDialog
          count={1}
          current={detail.downloadDir}
          onClose={() => setMoving(false)}
          onSubmit={async (location, moveData) => {
            await rpc.setLocation([detail.id], location, moveData);
            onRefresh();
          }}
        />
      )}
    </section>
  );
}
