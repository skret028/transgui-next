import { useState, type ReactNode } from "react";
import type { FileStat, TorrentDetail } from "../types";
import { formatBytes, formatDate, formatDuration, formatPercent, formatRatio, formatSpeed } from "../format";

interface Props {
  detail: TorrentDetail | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

type Tab = "info" | "files" | "peers" | "trackers";

const TABS: { id: Tab; label: string }[] = [
  { id: "info", label: "常规" },
  { id: "files", label: "文件" },
  { id: "peers", label: "Peers" },
  { id: "trackers", label: "追踪器" },
];

const ANNOUNCE_STATE = ["未启用", "等待", "排队", "活动中"];

function filePriority(stat?: FileStat): string {
  if (!stat) return "-";
  if (!stat.wanted) return "跳过";
  if (stat.priority === 1) return "高";
  if (stat.priority === -1) return "低";
  return "普通";
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <div className="kv-key">{label}</div>
      <div className="kv-val">{value}</div>
    </>
  );
}

export function DetailsPanel({ detail, loading, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<Tab>("info");

  if (!detail) {
    return (
      <section className="details empty-details">
        <span className="muted">双击列表中的种子查看详情</span>
      </section>
    );
  }

  const files = detail.files ?? [];
  const fileStats = detail.fileStats ?? [];
  const peers = detail.peers ?? [];
  const trackers = detail.trackerStats ?? [];

  return (
    <section className="details">
      <header className="details-head">
        <div className="details-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "files" && files.length > 0 && <span className="badge">{files.length}</span>}
              {t.id === "peers" && peers.length > 0 && <span className="badge">{peers.length}</span>}
              {t.id === "trackers" && trackers.length > 0 && <span className="badge">{trackers.length}</span>}
            </button>
          ))}
        </div>
        <span className="details-title" title={detail.name}>
          {detail.name}
        </span>
        <span className="spacer" />
        {loading && <span className="muted">刷新中…</span>}
        <button className="btn" onClick={onRefresh}>
          刷新
        </button>
        <button className="btn" onClick={onClose}>
          关闭
        </button>
      </header>

      <div className="details-body">
        {tab === "info" && (
          <div className="kv-grid">
            <Row label="名称" value={detail.name} />
            <Row label="哈希" value={<span className="mono">{detail.hashString}</span>} />
            <Row
              label="大小"
              value={`${formatBytes(detail.totalSize)} （已下 ${formatBytes(detail.downloadedEver)} / 已上 ${formatBytes(detail.uploadedEver)}）`}
            />
            <Row label="比率" value={formatRatio(detail.uploadRatio)} />
            <Row label="下载目录" value={<span className="mono">{detail.downloadDir}</span>} />
            <Row label="添加时间" value={formatDate(detail.addedDate)} />
            <Row label="完成时间" value={detail.doneDate > 0 ? formatDate(detail.doneDate) : "-"} />
            <Row label="上次活动" value={formatDate(detail.activityDate)} />
            <Row
              label="下载/做种时长"
              value={`${formatDuration(detail.secondsDownloading)} / ${formatDuration(detail.secondsSeeding)}`}
            />
            <Row
              label="片段"
              value={`${detail.pieceCount} × ${formatBytes(detail.pieceSize)}`}
            />
            <Row
              label="限速"
              value={`↓ ${detail.downloadLimited ? formatSpeed(detail.downloadLimit) : "不限"} · ↑ ${detail.uploadLimited ? formatSpeed(detail.uploadLimit) : "不限"}`}
            />
            <Row
              label="做种目标"
              value={detail.seedRatioMode === 1 ? formatRatio(detail.seedRatioLimit) : "全局"}
            />
            <Row label="私有种子" value={detail.isPrivate ? "是" : "否"} />
            <Row label="创建者" value={detail.creator || "-"} />
            <Row label="备注" value={detail.comment || "-"} />
            <Row label="Magnet" value={<span className="mono ellipsis">{detail.magnetLink}</span>} />
          </div>
        )}

        {tab === "files" && (
          <table className="sub-table">
            <thead>
              <tr>
                <th>文件</th>
                <th className="num">大小</th>
                <th className="col-prog">完成</th>
                <th>优先级</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && (
                <tr>
                  <td className="empty" colSpan={4}>
                    无文件信息
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
                    <td>{filePriority(fileStats[i])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "peers" && (
          <table className="sub-table">
            <thead>
              <tr>
                <th>地址</th>
                <th>客户端</th>
                <th>标志</th>
                <th className="col-prog">进度</th>
                <th className="num">下载</th>
                <th className="num">上传</th>
              </tr>
            </thead>
            <tbody>
              {peers.length === 0 && (
                <tr>
                  <td className="empty" colSpan={6}>
                    无连接中的 peer
                  </td>
                </tr>
              )}
              {peers.map((p, i) => (
                <tr key={i}>
                  <td className="mono">{p.address}</td>
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
        )}

        {tab === "trackers" && (
          <table className="sub-table">
            <thead>
              <tr>
                <th>追踪器</th>
                <th>状态</th>
                <th className="num">种子</th>
                <th className="num">下载</th>
                <th>最近结果</th>
              </tr>
            </thead>
            <tbody>
              {trackers.length === 0 && (
                <tr>
                  <td className="empty" colSpan={5}>
                    无追踪器信息
                  </td>
                </tr>
              )}
              {trackers.map((t, i) => (
                <tr key={i}>
                  <td className="mono ellipsis" title={t.announce}>
                    {t.host || t.announce}
                  </td>
                  <td>{ANNOUNCE_STATE[t.announceState] ?? "?"}</td>
                  <td className="num">{t.seederCount}</td>
                  <td className="num">{t.leecherCount}</td>
                  <td className={t.lastAnnounceSucceeded ? "up" : "down"}>
                    {t.lastAnnounceResult || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
