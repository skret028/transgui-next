import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask } from "@tauri-apps/plugin-dialog";
import "./App.css";
import { rpc } from "./api";
import {
  DEFAULT_FORM,
  loadConnForm,
  loadLocale,
  loadServers,
  saveConnForm,
  saveLocale,
  saveServers,
} from "./settings";
import {
  filterTorrents,
  nextDir,
  sortTorrents,
  STATUS_FILTERS,
  type SortDir,
  type SortKey,
} from "./torrentList";
import type { AddTorrentOptions, ConnForm, ServerBookmark, Torrent, TorrentDetail } from "./types";
import {
  availableLocales,
  DEFAULT_LOCALE,
  I18nProvider,
  normalizeLocale,
  useI18n,
  useT,
} from "./i18n";
import { ConnectionBar } from "./components/ConnectionBar";
import { Toolbar } from "./components/Toolbar";
import { TorrentTable } from "./components/TorrentTable";
import { DetailsPanel } from "./components/DetailsPanel";
import { AddTorrentDialog } from "./components/AddTorrentDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { LabelsDialog } from "./components/LabelsDialog";
import { TorrentPropsDialog } from "./components/TorrentPropsDialog";
import { StatsDialog } from "./components/StatsDialog";

const REFRESH_MS = 2000;

function AppInner() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const [form, setForm] = useState<ConnForm>(DEFAULT_FORM);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");
  const [torrents, setTorrents] = useState<Torrent[]>([]);

  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [detail, setDetail] = useState<TorrentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [showProps, setShowProps] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsDir, setStatsDir] = useState("");
  const [dragging, setDragging] = useState(false);

  const [servers, setServers] = useState<ServerBookmark[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");

  const timer = useRef<number | null>(null);
  const anchor = useRef<number | null>(null);
  const detailIdRef = useRef<number | null>(null);

  const visible = useMemo(
    () =>
      sortTorrents(
        filterTorrents(torrents, { text: filterText, statusId: filterStatus }),
        sortKey,
        sortDir,
      ),
    [torrents, filterText, filterStatus, sortKey, sortDir],
  );

  const knownLabels = useMemo(() => {
    const set = new Set<string>();
    for (const x of torrents) for (const l of x.labels ?? []) set.add(l);
    return [...set].sort();
  }, [torrents]);

  const selectedLabels = useMemo(() => {
    const set = new Set<string>();
    for (const x of torrents) if (selection.has(x.id)) for (const l of x.labels ?? []) set.add(l);
    return [...set].sort();
  }, [torrents, selection]);

  const refresh = useCallback(async () => {
    try {
      setTorrents(await rpc.torrents());
      setLastUpdate(new Date());
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    const id = detailIdRef.current;
    if (id == null) return;
    setDetailLoading(true);
    try {
      const list = await rpc.details([id]);
      setDetail(list[0] ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const connect = useCallback(
    async (override?: ConnForm) => {
      const cfg = override ?? form;
      setConnecting(true);
      setError("");
      try {
        const res = await rpc.connect(cfg);
        setConnected(true);
        setVersion(`${res.version} (rpc v${res.rpcVersion})`);
        void saveConnForm(cfg);
        await refresh();
      } catch (e) {
        setConnected(false);
        setError(String(e));
      } finally {
        setConnecting(false);
      }
    },
    [form, refresh],
  );

  const disconnect = useCallback(async () => {
    await rpc.disconnect();
    setConnected(false);
    setTorrents([]);
    setSelection(new Set());
    setVersion("");
    setLastUpdate(null);
    detailIdRef.current = null;
    setDetail(null);
  }, []);

  // Bootstrap: load the saved connection and auto-connect when present.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { form: saved, saved: hasSaved } = await loadConnForm();
      const savedServers = await loadServers();
      if (cancelled) return;
      setForm(saved);
      setServers(savedServers);
      if (hasSaved) void connect(saved);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh loop for the list and any open details panel.
  useEffect(() => {
    if (!connected || !autoRefresh) return;
    timer.current = window.setInterval(() => {
      void refresh();
      void refreshDetail();
    }, REFRESH_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [connected, autoRefresh, refresh, refreshDetail]);

  const onRowClick = useCallback(
    (id: number, e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        anchor.current = id;
      } else if (e.shiftKey && anchor.current != null) {
        const ids = visible.map((x) => x.id);
        const i0 = ids.indexOf(anchor.current);
        const i1 = ids.indexOf(id);
        if (i0 >= 0 && i1 >= 0) {
          const [a, b] = i0 < i1 ? [i0, i1] : [i1, i0];
          setSelection(new Set(ids.slice(a, b + 1)));
        }
      } else {
        setSelection(new Set([id]));
        anchor.current = id;
      }
    },
    [visible],
  );

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(nextDir(sortDir, true));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleAll = () => {
    const allSelected = visible.length > 0 && visible.every((x) => selection.has(x.id));
    setSelection(allSelected ? new Set() : new Set(visible.map((x) => x.id)));
  };

  const openDetails = useCallback(
    (id: number) => {
      detailIdRef.current = id;
      void refreshDetail();
    },
    [refreshDetail],
  );

  const action = useCallback(
    async (act: string) => {
      const ids = [...selection];
      if (ids.length === 0) {
        setError(t("Select a torrent in the list first"));
        return;
      }
      // Destroying the payload is the one irreversible action here, so it gets
      // its own name and an explicit confirmation.
      if (act === "remove_with_data") {
        const ok = await ask(
          t("Delete {n} torrent(s) and their downloaded data?", { n: ids.length }),
          { title: t("Remove and delete data"), kind: "warning" },
        );
        if (!ok) return;
      }
      try {
        await rpc.action(act, ids);
        await refresh();
        await refreshDetail();
      } catch (e) {
        setError(String(e));
      }
    },
    [selection, refresh, refreshDetail, t],
  );

  /** Actions that apply to every torrent and need no selection. */
  const globalAction = useCallback(
    async (act: string) => {
      try {
        await rpc.action(act, []);
        await refresh();
        await refreshDetail();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh, refreshDetail],
  );

  const openStats = useCallback(async () => {
    try {
      const s = await rpc.session();
      setStatsDir(String(s["download-dir"] ?? ""));
    } catch {
      setStatsDir("");
    }
    setShowStats(true);
  }, []);

  const submitAdd = useCallback(
    async (options: AddTorrentOptions) => {
      try {
        await rpc.add(options);
        setShowAdd(false);
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh],
  );

  const applySettings = useCallback(
    async (patch: Record<string, unknown>) => {
      await rpc.setSession(patch);
      setShowSettings(false);
      setError("");
      void refresh();
    },
    [refresh],
  );

  const applyLabels = useCallback(
    async (labels: string[]) => {
      const ids = [...selection];
      if (ids.length === 0) return;
      await rpc.setLabels(ids, labels);
      setShowLabels(false);
      await refresh();
      void refreshDetail();
    },
    [selection, refresh, refreshDetail],
  );

  const loadPropsDetail = useCallback(
    async (id: number) => (await rpc.details([id]))[0] ?? null,
    [],
  );

  const applyProps = useCallback(
    async (patch: Record<string, unknown>) => {
      const ids = [...selection];
      if (ids.length !== 1) return;
      await rpc.setTorrent(ids, patch);
      setShowProps(false);
      await refresh();
      void refreshDetail();
    },
    [selection, refresh, refreshDetail],
  );

  // Drag a .torrent file onto the window to add it.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          const p = event.payload;
          if (p.type === "enter" || p.type === "over") {
            setDragging(true);
          } else if (p.type === "drop") {
            setDragging(false);
            const torrents = p.paths.filter((x) => x.toLowerCase().endsWith(".torrent"));
            if (torrents.length === 0) {
              setError(t("Only .torrent files can be dropped"));
              return;
            }
            void (async () => {
              for (const path of torrents) {
                try {
                  await rpc.add({ local_torrent_path: path });
                } catch (e) {
                  setError(String(e));
                }
              }
              await refresh();
            })();
          } else {
            setDragging(false);
          }
        });
      } catch {
        // drag & drop not available in this environment
      }
    })();
    return () => unlisten?.();
  }, [refresh, t]);

  // Keep an open details panel following the current selection.
  useEffect(() => {
    if (detailIdRef.current != null && !selection.has(detailIdRef.current) && selection.size > 0) {
      openDetails([...selection][0]);
    }
  }, [selection, openDetails]);

  const persistServers = useCallback(async (list: ServerBookmark[]) => {
    setServers(list);
    await saveServers(list);
  }, []);

  const selectServer = useCallback(
    (id: string) => {
      setSelectedServerId(id);
      const s = servers.find((x) => x.id === id);
      if (s) setForm(s.form);
    },
    [servers],
  );

  const saveServer = useCallback(
    (name: string) => {
      const existing = servers.find((s) => s.name === name);
      const entry: ServerBookmark = {
        id: existing?.id ?? `srv_${Date.now().toString(36)}`,
        name,
        form,
      };
      const list = existing
        ? servers.map((s) => (s.id === entry.id ? entry : s))
        : [...servers, entry];
      void persistServers(list);
      setSelectedServerId(entry.id);
    },
    [servers, form, persistServers],
  );

  const deleteServer = useCallback(
    (id: string) => {
      if (!id) return;
      void persistServers(servers.filter((s) => s.id !== id));
      setSelectedServerId("");
    },
    [servers, persistServers],
  );

  const setField = <K extends keyof ConnForm>(key: K, value: ConnForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="app">
      {dragging && <div className="drop-overlay">{t("Drop to add a .torrent file")}</div>}
      <header className="topbar">
        <span className="brand">transgui-next</span>
        <span className={`dot ${connected ? "on" : "off"}`} />
        <span className="conn-state">
          {connected ? `${t("Connected")} · ${version}` : t("Not connected")}
        </span>
        <span className="spacer" />
        <select
          className="filter-status locale-select"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          title={t("Language")}
          aria-label={t("Language")}
        >
          {availableLocales().map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <input
          className="filter"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder={t("Filter name / label / hash")}
          disabled={!connected}
        />
        <select
          className="filter-status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          disabled={!connected}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.labelKey)}
            </option>
          ))}
        </select>
      </header>

      <ConnectionBar
        form={form}
        connected={connected}
        connecting={connecting}
        servers={servers}
        selectedServerId={selectedServerId}
        onChange={setField}
        onConnect={() => connect()}
        onDisconnect={disconnect}
        onSelectServer={selectServer}
        onSaveServer={saveServer}
        onDeleteServer={deleteServer}
      />

      {error && <div className="error">{error}</div>}

      <Toolbar
        connected={connected}
        selectedCount={selection.size}
        autoRefresh={autoRefresh}
        refreshMs={REFRESH_MS}
        onAction={action}
        onGlobalAction={globalAction}
        onOpenAdd={() => setShowAdd(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenLabels={() => setShowLabels(true)}
        onOpenProps={() => setShowProps(true)}
        onOpenStats={openStats}
        onRefresh={() => {
          void refresh();
          void refreshDetail();
        }}
        onAutoRefreshChange={setAutoRefresh}
      />

      <TorrentTable
        torrents={visible}
        total={torrents.length}
        connected={connected}
        sortKey={sortKey}
        sortDir={sortDir}
        selection={selection}
        onSort={onSort}
        onRowClick={onRowClick}
        onToggleAll={toggleAll}
        onOpenDetails={openDetails}
      />

      <DetailsPanel
        detail={detail}
        loading={detailLoading}
        onClose={() => {
          detailIdRef.current = null;
          setDetail(null);
        }}
        onRefresh={refreshDetail}
      />

      <footer className="statusbar">
        <span>
          {t("{n} torrents", { n: torrents.length })}
          {visible.length !== torrents.length
            ? ` · ${t("{n} shown", { n: visible.length })}`
            : ""}
        </span>
        {selection.size > 0 && <span>{t("{n} selected", { n: selection.size })}</span>}
        <span className="spacer" />
        {lastUpdate && <span>{t("Updated {time}", { time: lastUpdate.toLocaleTimeString() })}</span>}
      </footer>

      {showAdd && (
        <AddTorrentDialog onClose={() => setShowAdd(false)} onSubmit={submitAdd} />
      )}

      {showSettings && (
        <SettingsDialog
          onLoad={() => rpc.session()}
          onClose={() => setShowSettings(false)}
          onApply={applySettings}
        />
      )}

      {showLabels && (
        <LabelsDialog
          count={selection.size}
          current={selectedLabels}
          known={knownLabels}
          onClose={() => setShowLabels(false)}
          onApply={applyLabels}
        />
      )}

      {showProps && selection.size === 1 && (
        <TorrentPropsDialog
          id={[...selection][0]}
          onLoad={loadPropsDetail}
          onClose={() => setShowProps(false)}
          onApply={applyProps}
        />
      )}

      {showStats && (
        <StatsDialog downloadDir={statsDir} onClose={() => setShowStats(false)} />
      )}
    </div>
  );
}

function App() {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    void (async () => {
      const saved = await loadLocale();
      if (saved) setLocale(normalizeLocale(saved));
    })();
  }, []);

  const changeLocale = useCallback((code: string) => {
    setLocale(code);
    void saveLocale(code);
  }, []);

  return (
    <I18nProvider locale={locale} onLocaleChange={changeLocale}>
      <AppInner />
    </I18nProvider>
  );
}

export default App;
