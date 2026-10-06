import type { MouseEvent, ReactNode } from "react";
import type { Torrent } from "../types";
import type { SortDir, SortKey } from "../torrentList";
import { columnDef, type ColumnId } from "../columns";
import type { TFn } from "../format";
import { useT } from "../i18n";
import {
  formatBytes,
  formatDate,
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
  columns: ColumnId[];
  /** When set, the list shows these smoothed rates instead of the raw ones. */
  speedAvg?: Map<number, { down: number; up: number }> | null;
  onSort: (key: SortKey) => void;
  onRowClick: (id: number, e: MouseEvent) => void;
  onToggleAll: () => void;
  onOpenDetails: (id: number) => void;
}

const arrow = (active: boolean, dir: SortDir) => (active ? (dir === "asc" ? " ▲" : " ▼") : "");

/** One row's cell for a given column id. */
function cell(
  row: Torrent,
  id: ColumnId,
  t: TFn,
  avg?: Map<number, { down: number; up: number }> | null,
): ReactNode {
  switch (id) {
    case "name":
      return row.name;
    case "status":
      return (
        <span className={`pill ${statusClass(row.status)}`}>
          {t(statusKey(row))}
          {row.isStalled ? ` (${t("Stalled")})` : ""}
        </span>
      );
    case "size":
      return formatBytes(row.sizeWhenDone || row.totalSize);
    case "progress":
      return (
        <div className="prog">
          <div className="prog-fill" style={{ width: `${(row.percentDone || 0) * 100}%` }} />
          <span className="prog-text">{formatPercent(row.percentDone)}</span>
        </div>
      );
    case "down":
      return <span className="down">{formatSpeed(avg?.get(row.id)?.down ?? row.rateDownload)}</span>;
    case "up":
      return <span className="up">{formatSpeed(avg?.get(row.id)?.up ?? row.rateUpload)}</span>;
    case "ratio":
      return formatRatio(row.uploadRatio);
    case "eta":
      return formatEta(row.eta, t);
    case "labels":
      return (row.labels ?? []).join(", ");
    case "peers":
      return (
        <>
          {row.peersConnected}{" "}
          <span className="muted">
            ↓{row.peersSendingToUs} ↑{row.peersGettingFromUs}
          </span>
        </>
      );
    case "added":
      return formatDate(row.addedDate);
    case "downloaded":
      return formatBytes(row.downloadedEver);
    case "queue":
      return row.queuePosition >= 0 ? row.queuePosition : "-";
    case "dir":
      return row.downloadDir;
  }
}

export function TorrentTable({
  torrents,
  total,
  connected,
  sortKey,
  sortDir,
  selection,
  columns,
  speedAvg,
  onSort,
  onRowClick,
  onToggleAll,
  onOpenDetails,
}: Props) {
  const t = useT();
  const allSelected = torrents.length > 0 && torrents.every((x) => selection.has(x.id));

  const cls = (id: ColumnId) => {
    const def = columnDef(id);
    return [def.className, def.num ? "num" : "", def.sortKey ? "sortable" : ""].filter(Boolean).join(" ");
  };

  return (
    <div className="table-wrap">
      <table className="torrents">
        <thead>
          <tr>
            <th className="col-check">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            </th>
            {columns.map((id) => {
              const def = columnDef(id);
              return (
                <th
                  key={id}
                  className={cls(id)}
                  onClick={def.sortKey ? () => onSort(def.sortKey!) : undefined}
                >
                  {t(def.labelKey)}
                  {def.sortKey ? arrow(sortKey === def.sortKey, sortDir) : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {torrents.length === 0 && (
            <tr>
              <td className="empty" colSpan={columns.length + 1}>
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
              {columns.map((id) => (
                <td
                  key={id}
                  className={cls(id)}
                  title={id === "name" ? row.name : id === "dir" ? row.downloadDir : undefined}
                >
                  {cell(row, id, t, speedAvg)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
