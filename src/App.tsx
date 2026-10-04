import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatRatio,
  formatSpeed,
  statusClass,
  statusText,
} from "./format";

interface Torrent {
  id: number;
  name: string;
  status: number;
  totalSize: number;
  sizeWhenDone: number;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  uploadRatio: number;
  eta: number;
  uploadedEver: number;
  downloadedEver: number;
  labels?: string[];
  peersConnected: number;
  peersSendingToUs: number;
  peersGettingFromUs: number;
  queuePosition: number;
  error: number;
  errorString: string;
  hashString: string;
  downloadDir: string;
  isFinished: boolean;
  isStalled: boolean;
  addedDate: number;
}

interface ConnForm {
  host: string;
  port: string;
  path: string;
  username: string;
  password: string;
  https: boolean;
  acceptInvalid: boolean;
}

interface ConnectResult {
  version: string;
  rpcVersion: number;
}

const REFRESH_MS = 2000;

function App() {
  const [form, setForm] = useState<ConnForm>({
    host: "localhost",
    port: "19091",
    path: "/transmission/rpc",
    username: "admin",
    password: "admin",
    https: false,
    acceptInvalid: false,
  });
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [serverVersion, setServerVersion] = useState("");
  const [error, setError] = useState("");
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [magnet, setMagnet] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<Torrent[]>("rpc_torrents");
      setTorrents(list);
      setLastUpdate(new Date());
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError("");
    try {
      const res = await invoke<ConnectResult>("rpc_connect", {
        config: {
          host: form.host,
          port: Number(form.port),
          path: form.path,
          username: form.username,
          password: form.password,
          https: form.https,
          accept_invalid_certs: form.acceptInvalid,
        },
      });
      setConnected(true);
      setServerVersion(`${res.version} (rpc v${res.rpcVersion})`);
      await refresh();
    } catch (e) {
      setConnected(false);
      setError(String(e));
    } finally {
      setConnecting(false);
    }
  }, [form, refresh]);

  const disconnect = useCallback(async () => {
    await invoke("rpc_disconnect");
    setConnected(false);
    setTorrents([]);
    setServerVersion("");
    setLastUpdate(null);
  }, []);

  useEffect(() => {
    if (!connected || !autoRefresh) return;
    timer.current = window.setInterval(refresh, REFRESH_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [connected, autoRefresh, refresh]);

  const action = useCallback(
    async (act: string) => {
      const ids = selected != null ? [selected] : [];
      if (ids.length === 0) {
        setError("先在列表里选一个种子");
        return;
      }
      try {
        await invoke("rpc_torrent_action", { action: act, ids });
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [selected, refresh],
  );

  const addTorrent = useCallback(async () => {
    if (!magnet.trim()) return;
    try {
      await invoke("rpc_add_torrent", { filename: magnet.trim(), downloadDir: null });
      setMagnet("");
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }, [magnet, refresh]);

  const set = <K extends keyof ConnForm>(key: K, value: ConnForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">transgui-next</span>
        <span className={`dot ${connected ? "on" : "off"}`} />
        <span className="conn-state">{connected ? `已连接 · ${serverVersion}` : "未连接"}</span>
      </header>

      <section className="conn-form">
        <input
          className="mono"
          value={form.host}
          onChange={(e) => set("host", e.target.value)}
          placeholder="主机"
          disabled={connected}
        />
        <input
          className="narrow"
          value={form.port}
          onChange={(e) => set("port", e.target.value)}
          placeholder="端口"
          disabled={connected}
        />
        <input
          value={form.username}
          onChange={(e) => set("username", e.target.value)}
          placeholder="用户名"
          disabled={connected}
        />
        <input
          type="password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          placeholder="密码"
          disabled={connected}
        />
        <label className="chk">
          <input
            type="checkbox"
            checked={form.https}
            onChange={(e) => set("https", e.target.checked)}
            disabled={connected}
          />
          HTTPS
        </label>
        {connected ? (
          <button className="btn danger" onClick={disconnect}>
            断开
          </button>
        ) : (
          <button className="btn primary" onClick={connect} disabled={connecting}>
            {connecting ? "连接中…" : "连接"}
          </button>
        )}
      </section>

      {error && <div className="error">{error}</div>}

      <section className="toolbar">
        <button className="btn" onClick={() => action("start")} disabled={!connected}>
          开始
        </button>
        <button className="btn" onClick={() => action("stop")} disabled={!connected}>
          停止
        </button>
        <button className="btn" onClick={() => action("verify")} disabled={!connected}>
          校验
        </button>
        <button className="btn" onClick={() => action("reannounce")} disabled={!connected}>
          汇报
        </button>
        <button className="btn danger" onClick={() => action("remove")} disabled={!connected}>
          移除
        </button>
        <span className="spacer" />
        <input
          className="magnet"
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTorrent()}
          placeholder="magnet: / http(s) / .torrent 路径"
          disabled={!connected}
        />
        <button className="btn" onClick={addTorrent} disabled={!connected}>
          添加
        </button>
        <button className="btn" onClick={refresh} disabled={!connected}>
          刷新
        </button>
        <label className="chk">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          自动 {REFRESH_MS / 1000}s
        </label>
      </section>

      <div className="table-wrap">
        <table className="torrents">
          <thead>
            <tr>
              <th className="col-name">名称</th>
              <th>状态</th>
              <th className="num">大小</th>
              <th className="col-prog">进度</th>
              <th className="num">下载</th>
              <th className="num">上传</th>
              <th className="num">比率</th>
              <th className="num">剩余</th>
              <th>标签</th>
              <th className="num">Peer</th>
            </tr>
          </thead>
          <tbody>
            {torrents.length === 0 && (
              <tr>
                <td className="empty" colSpan={10}>
                  {connected ? "暂无种子" : "连接 daemon 后显示种子列表"}
                </td>
              </tr>
            )}
            {torrents.map((t) => (
              <tr
                key={t.id}
                className={selected === t.id ? "sel" : ""}
                onClick={() => setSelected(t.id)}
                onDoubleClick={() => setSelected(t.id)}
                title={t.error ? t.errorString : `${t.hashString}\n${t.downloadDir}`}
              >
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
                  {t.peersConnected} <span className="muted">↓{t.peersSendingToUs} ↑{t.peersGettingFromUs}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="statusbar">
        <span>共 {torrents.length} 个种子</span>
        {selected != null && <span>选中 #{selected}</span>}
        <span className="spacer" />
        {lastUpdate && <span>更新于 {lastUpdate.toLocaleTimeString()}</span>}
      </footer>
    </div>
  );
}

export default App;
