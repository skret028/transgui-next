import type { MouseEvent } from "react";
import type { Torrent } from "../types";
import type { SortDir, SortKey } from "../torrentList";
import { useT } from "../i18n";
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatRatio,
  formatSpeed,
  statusClass,
  statusKey,
} from "../format";

interface Props {
  torrents: Torrent[];
  total: number;
  connected: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  selection: Set<number>;
  onSort: (key: SortKey) => void;
  onRowClick: (id: number, e: MouseEvent) => void;
  onToggleAll: () => void;
  onOpenDetails: (id: number) => void;
}

const arrow = (active: boolean, dir: SortDir) => (active ? (dir === "asc" ? " ▲" : " ▼") : "");

export function TorrentTable({
  torrents,
  total,
  connected,
  sortKey,
  sortDir,
  selection,
  onSort,
  onRowClick,
  onToggleAll,
  onOpenDetails,
}: Props) {
  const t = useT();
  const allSelected = torrents.length > 0 && torrents.every((x) => selection.has(x.id));

  return (
    <div className="table-wrap">
      <table className="torrents">
        <thead>
          <tr>
            <th className="col-check">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            </th>
            <th className="col-name sortable" onClick={() => onSort("name")}>
              {t("Name")}
              {arrow(sortKey === "name", sortDir)}
            </th>
            <th className="sortable" onClick={() => onSort("status")}>
              {t("Status")}
              {arrow(sortKey === "status", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("sizeWhenDone")}>
              {t("Size")}
              {arrow(sortKey === "sizeWhenDone", sortDir)}
            </th>
            <th className="col-prog sortable" onClick={() => onSort("percentDone")}>
              {t("Progress")}
              {arrow(sortKey === "percentDone", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("rateDownload")}>
              {t("Download")}
              {arrow(sortKey === "rateDownload", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("rateUpload")}>
              {t("Upload")}
              {arrow(sortKey === "rateUpload", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("uploadRatio")}>
              {t("Ratio")}
              {arrow(sortKey === "uploadRatio", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("eta")}>
              {t("Remaining")}
              {arrow(sortKey === "eta", sortDir)}
            </th>
            <th>{t("Labels")}</th>
            <th className="num">{t("Peer")}</th>
          </tr>
        </thead>
        <tbody>
          {torrents.length === 0 && (
            <tr>
              <td className="empty" colSpan={11}>
                {!connected
                  ? t("Connect to a daemon to see torrents")
                  : total === 0
                    ? t("No torrents on the daemon")
                    : t("No torrents match the current filter")}
              </td>
            </tr>
          )}
          {torrents.map((row) => (
            <tr
              key={row.id}
              className={selection.has(row.id) ? "sel" : ""}
              onClick={(e) => onRowClick(row.id, e)}
              onDoubleClick={() => onOpenDetails(row.id)}
              title={row.error ? row.errorString : `${row.hashString}\n${row.downloadDir}`}
            >
              <td className="col-check">
                <input
                  type="checkbox"
                  checked={selection.has(row.id)}
                  onChange={() => undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRowClick(row.id, e);
                  }}
                />
              </td>
              <td className="col-name" title={row.name}>
                {row.name}
              </td>
              <td>
                <span className={`pill ${statusClass(row.status)}`}>
                  {t(statusKey(row))}
                  {row.isStalled ? ` (${t("Stalled")})` : ""}
                </span>
              </td>
              <td className="num">{formatBytes(row.sizeWhenDone || row.totalSize)}</td>
              <td className="col-prog">
                <div className="prog">
                  <div className="prog-fill" style={{ width: `${(row.percentDone || 0) * 100}%` }} />
                  <span className="prog-text">{formatPercent(row.percentDone)}</span>
                </div>
              </td>
              <td className="num down">{formatSpeed(row.rateDownload)}</td>
              <td className="num up">{formatSpeed(row.rateUpload)}</td>
              <td className="num">{formatRatio(row.uploadRatio)}</td>
              <td className="num">{formatEta(row.eta, t)}</td>
              <td className="labels">{(row.labels ?? []).join(", ")}</td>
              <td className="num">
                {row.peersConnected}{" "}
                <span className="muted">
                  ↓{row.peersSendingToUs} ↑{row.peersGettingFromUs}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
