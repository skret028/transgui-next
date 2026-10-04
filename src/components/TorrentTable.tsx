import type { MouseEvent } from "react";
import type { Torrent } from "../types";
import type { SortDir, SortKey } from "../torrentList";
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatRatio,
  formatSpeed,
  statusClass,
  statusText,
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
  const allSelected = torrents.length > 0 && torrents.every((t) => selection.has(t.id));

  return (
    <div className="table-wrap">
      <table className="torrents">
        <thead>
          <tr>
            <th className="col-check">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            </th>
            <th className="col-name sortable" onClick={() => onSort("name")}>
              名称{arrow(sortKey === "name", sortDir)}
            </th>
            <th className="sortable" onClick={() => onSort("status")}>
              状态{arrow(sortKey === "status", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("sizeWhenDone")}>
              大小{arrow(sortKey === "sizeWhenDone", sortDir)}
            </th>
            <th className="col-prog sortable" onClick={() => onSort("percentDone")}>
              进度{arrow(sortKey === "percentDone", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("rateDownload")}>
              下载{arrow(sortKey === "rateDownload", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("rateUpload")}>
              上传{arrow(sortKey === "rateUpload", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("uploadRatio")}>
              比率{arrow(sortKey === "uploadRatio", sortDir)}
            </th>
            <th className="num sortable" onClick={() => onSort("eta")}>
              剩余{arrow(sortKey === "eta", sortDir)}
            </th>
            <th>标签</th>
            <th className="num">Peer</th>
          </tr>
        </thead>
        <tbody>
          {torrents.length === 0 && (
            <tr>
              <td className="empty" colSpan={11}>
                {!connected
                  ? "连接 daemon 后显示种子列表"
                  : total === 0
                    ? "daemon 上暂无种子"
                    : "没有匹配当前筛选的种子"}
              </td>
            </tr>
          )}
          {torrents.map((t) => (
            <tr
              key={t.id}
              className={selection.has(t.id) ? "sel" : ""}
              onClick={(e) => onRowClick(t.id, e)}
              onDoubleClick={() => onOpenDetails(t.id)}
              title={t.error ? t.errorString : `${t.hashString}\n${t.downloadDir}`}
            >
              <td className="col-check">
                <input
                  type="checkbox"
                  checked={selection.has(t.id)}
                  onChange={() => undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRowClick(t.id, e);
                  }}
                />
              </td>
              <td className="col-name" title={t.name}>
                {t.name}
              </td>
              <td>
                <span className={`pill ${statusClass(t.status)}`}>{statusText(t)}</span>
              </td>
              <td className="num">{formatBytes(t.sizeWhenDone || t.totalSize)}</td>
              <td className="col-prog">
                <div className="prog">
                  <div className="prog-fill" style={{ width: `${(t.percentDone || 0) * 100}%` }} />
                  <span className="prog-text">{formatPercent(t.percentDone)}</span>
                </div>
              </td>
              <td className="num down">{formatSpeed(t.rateDownload)}</td>
              <td className="num up">{formatSpeed(t.rateUpload)}</td>
              <td className="num">{formatRatio(t.uploadRatio)}</td>
              <td className="num">{formatEta(t.eta)}</td>
              <td className="labels">{(t.labels ?? []).join(", ")}</td>
              <td className="num">
                {t.peersConnected}{" "}
                <span className="muted">
                  ↓{t.peersSendingToUs} ↑{t.peersGettingFromUs}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
