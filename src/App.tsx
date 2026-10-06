import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import "./App.css";
import { rpc } from "./api";
import {
  DEFAULT_FORM,
  DEFAULT_HIDDEN_REFRESH,
  DEFAULT_STATUS_FIELDS,
  DEFAULT_VIEW_OPTIONS,
  loadColumns,
  loadConnForm,
  loadHiddenRefresh,
  loadLocale,
  loadMinimizeToTray,
  loadNotifyOnComplete,
  loadPathMap,
  loadServers,
  loadStatusBarFields,
  loadUiFontSize,
  loadViewOptions,
  saveColumns,
  saveConnForm,
  saveHiddenRefresh,
  saveLocale,
  saveMinimizeToTray,
  saveNotifyOnComplete,
  savePathMap,
  saveServers,
  saveStatusBarFields,
  saveUiFontSize,
  saveViewOptions,
  type HiddenRefresh,
  type StatusBarFields,
  type UiFontSize,
  type ViewOptions,
} from "./settings";
import { revealPathFor, type PathMapping } from "./paths";
import { buildSettingsFile, parseSettingsFile } from "./settingsFile";
import {
  ALL_SELECTION,
  filterTorrents,
  nextDir,
  pickNewlyFinished,
  seedFinished,
  sortTorrents,
  STATUS_FILTERS,
  statusIdOf,
  type FilterSelection,
  type SortDir,
  type SortKey,
} from "./torrentList";
import type {
  AddTorrentOptions,
  ConnForm,
  ServerBookmark,
  SessionInfo,
  Torrent,
  TorrentDetail,
} from "./types";
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
import { ColumnsDialog } from "./components/ColumnsDialog";
import { FilterPane } from "./components/FilterPane";
import { ViewMenu } from "./components/ViewMenu";
import { DEFAULT_COLUMNS, normalizeColumns, type ColumnId } from "./columns";
import { notify } from "./notify";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

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
  const [filterSel, setFilterSel] = useState<FilterSelection>(ALL_SELECTION);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [columns, setColumns] = useState<ColumnId[]>(DEFAULT_COLUMNS);
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [pathMap, setPathMap] = useState<PathMapping[]>([]);
  /** Transient status-bar message, e.g. a just-finished download. */
  const [flash, setFlash] = useState("");
  const [uiFontSize, setUiFontSize] = useState<UiFontSize>("medium");
  const [statusFields, setStatusFields] = useState<StatusBarFields>(DEFAULT_STATUS_FIELDS);
  const [hiddenRefresh, setHiddenRefresh] = useState<HiddenRefresh>(DEFAULT_HIDDEN_REFRESH);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);

  const [detail, setDetail] = useState<TorrentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [showProps, setShowProps] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [statsDir, setStatsDir] = useState("");
  const [dragging, setDragging] = useState(false);

  const [servers, setServers] = useState<ServerBookmark[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  /** Daemon session values backing the quick alt-speed and limit controls. */
  const [session, setSession] = useState<SessionInfo | null>(null);
  /** Whether the window is currently hidden/backgrounded. */
  const [documentHidden, setDocumentHidden] = useState(false);

  const timer = useRef<number | null>(null);
  const anchor = useRef<number | null>(null);
  const detailIdRef = useRef<number | null>(null);
  /** Torrent ids already accounted for by the completion notifier. */
  const notifiedRef = useRef<Set<number>>(new Set());
  /** Whether the baseline (first list of the session) has been taken. */
  const seededRef = useRef(false);
  /** Live value for the window close handler (which is registered once). */
  const minimizeToTrayRef = useRef(true);

  const visible = useMemo(
    () =>
      sortTorrents(
        filterTorrents(torrents, { text: filterText, selection: filterSel }),
        sortKey,
        sortDir,
      ),
    [torrents, filterText, filterSel, sortKey, sortDir],
  );

  // Which local path "Show in folder" opens: the daemon's own path when it
  // shares this filesystem, otherwise the mapped one. null = not openable.
  const revealTarget = useMemo(
    () => (detail ? revealPathFor(detail.downloadDir, form.host, pathMap) : null),
    [detail, form.host, pathMap],
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
      const savedColumns = await loadColumns();
      const notifyPref = await loadNotifyOnComplete();
      const savedPathMap = await loadPathMap();
      const savedFont = await loadUiFontSize();
      const savedStatusFields = await loadStatusBarFields();
      const savedHiddenRefresh = await loadHiddenRefresh();
      const savedMinimizeToTray = await loadMinimizeToTray();
      const savedViewOptions = await loadViewOptions();
      if (cancelled) return;
      setForm(saved);
      setServers(savedServers);
      setColumns(normalizeColumns(savedColumns));
      setNotifyOnComplete(notifyPref);
      setPathMap(savedPathMap);
      setUiFontSize(savedFont);
      setStatusFields(savedStatusFields);
      setHiddenRefresh(savedHiddenRefresh);
      setMinimizeToTray(savedMinimizeToTray);
      minimizeToTrayRef.current = savedMinimizeToTray;
      void rpc.setCloseToTray(savedMinimizeToTray);
      setViewOptions(savedViewOptions);
      if (hasSaved) void connect(saved);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Interface text scale: a data attribute on <html>, styled by App.css.
  useEffect(() => {
    document.documentElement.dataset.fontSize = uiFontSize;
  }, [uiFontSize]);

  // Track page visibility so the polling interval can back off while hidden.
  useEffect(() => {
    const onVisibility = () => setDocumentHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Auto-refresh loop for the list and any open details panel. When the window
  // is hidden and the user opted in, poll at the slower interval instead.
  useEffect(() => {
    if (!connected || !autoRefresh) return;
    const interval =
      documentHidden && hiddenRefresh.enabled
        ? Math.max(1, hiddenRefresh.seconds) * 1000
        : REFRESH_MS;
    timer.current = window.setInterval(() => {
      void refresh();
      void refreshDetail();
    }, interval);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [connected, autoRefresh, documentHidden, hiddenRefresh, refresh, refreshDetail]);

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

  // Stable identity: the dialog reloads its form in an effect keyed on this
  // prop, so a fresh arrow here would wipe unsaved edits on every poll tick.
  const loadSession = useCallback(() => rpc.session(), []);

  /** Cached session snapshot for the toolbar's quick speeds / alt-speed button. */
  const loadSessionInfo = useCallback(async () => {
    try {
      setSession(await rpc.session());
    } catch {
      // keep the previous snapshot; the poll or the next open will retry
    }
  }, []);

  // Fetch the daemon's session once connected so the quick controls reflect it.
  useEffect(() => {
    if (connected) void loadSessionInfo();
  }, [connected, loadSessionInfo]);

  const toggleAltSpeed = useCallback(async () => {
    const next = !session?.["alt-speed-enabled"];
    try {
      await rpc.setSession({ "alt-speed-enabled": next });
      setSession((s) => (s ? { ...s, "alt-speed-enabled": next } : s));
    } catch (e) {
      setError(String(e));
    }
  }, [session]);

  const setSpeedLimit = useCallback(async (which: "down" | "up", kbps: number | null) => {
    const patch: Record<string, unknown> =
      which === "down"
        ? { "speed-limit-down-enabled": kbps != null, "speed-limit-down": kbps ?? 0 }
        : { "speed-limit-up-enabled": kbps != null, "speed-limit-up": kbps ?? 0 };
    try {
      await rpc.setSession(patch);
      setSession((s) => (s ? ({ ...s, ...patch } as SessionInfo) : s));
    } catch (e) {
      setError(String(e));
    }
  }, []);

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

  const applyColumns = useCallback((cols: ColumnId[]) => {
    const normalized = normalizeColumns(cols);
    setColumns(normalized);
    void saveColumns(normalized);
  }, []);

  const changeNotify = useCallback((on: boolean) => {
    setNotifyOnComplete(on);
    void saveNotifyOnComplete(on);
  }, []);

  const changePathMap = useCallback((list: PathMapping[]) => {
    setPathMap(list);
    void savePathMap(list);
  }, []);

  const changeUiFontSize = useCallback((size: UiFontSize) => {
    setUiFontSize(size);
    void saveUiFontSize(size);
  }, []);

  const changeStatusFields = useCallback((fields: StatusBarFields) => {
    setStatusFields(fields);
    void saveStatusBarFields(fields);
  }, []);

  const changeHiddenRefresh = useCallback((value: HiddenRefresh) => {
    setHiddenRefresh(value);
    void saveHiddenRefresh(value);
  }, []);

  const changeMinimizeToTray = useCallback((on: boolean) => {
    setMinimizeToTray(on);
    minimizeToTrayRef.current = on;
    void rpc.setCloseToTray(on);
    void saveMinimizeToTray(on);
  }, []);

  const changeViewOptions = useCallback((value: ViewOptions) => {
    setViewOptions(value);
    void saveViewOptions(value);
  }, []);

  // Close button: hide to the tray when enabled (the backend already does this),
  // otherwise force the window closed. destroy() is best-effort — it needs the
  // window-destroy capability, so a denial just falls back to the hide.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          if (minimizeToTrayRef.current) {
            event.preventDefault();
            return;
          }
          // Otherwise let the close go ahead: the backend's handler decides
          // whether that hides to the tray or quits.
        });
      } catch {
        // not running under Tauri
      }
    })();
    return () => unlisten?.();
  }, []);

  // Settings export/import. Passwords are never written out.
  const exportSettings = useCallback(async (): Promise<string> => {
    const payload = buildSettingsFile({
      form,
      servers,
      locale,
      columns,
      notifyOnComplete,
      pathMap,
    });
    const target = await save({
      defaultPath: "transgui-next-settings.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!target) return "";
    await rpc.writeTextFile(target, JSON.stringify(payload, null, 2) + "\n");
    return `${t("Exported to")} ${target}`;
  }, [form, servers, locale, columns, notifyOnComplete, pathMap, t]);

  const importSettings = useCallback(async (): Promise<string> => {
    const picked = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof picked !== "string") return "";
    const parsed = parseSettingsFile(await rpc.readTextFile(picked));
    if (!parsed.ok) throw new Error(t(parsed.error));
    const s = parsed.settings;

    if (s.form) {
      // The file carries no password: keep ours when it is the same server,
      // otherwise the imported entry has to be filled in by hand.
      const merged = { ...s.form, password: s.form.host === form.host ? form.password : "" };
      const reconnects =
        merged.host !== form.host ||
        merged.port !== form.port ||
        merged.path !== form.path ||
        merged.username !== form.username ||
        merged.https !== form.https ||
        merged.acceptInvalid !== form.acceptInvalid;
      setForm(merged);
      void saveConnForm(merged);
      if (reconnects) void connect(merged);
    }
    if (s.servers) {
      // Same rule as the connection above: match the stored password by server.
      const bookmarks = s.servers.map((sv) => {
        const known = servers.find(
          (c) => c.form.host === sv.form.host && c.form.port === sv.form.port,
        );
        return {
          id: sv.id || sv.form.host,
          name: sv.name || sv.form.host,
          form: { ...sv.form, password: known?.form.password ?? "" },
        };
      });
      setServers(bookmarks);
      void saveServers(bookmarks);
    }
    if (s.locale) {
      setLocale(s.locale);
      void saveLocale(s.locale);
    }
    if (s.columns) {
      setColumns(s.columns);
      void saveColumns(s.columns);
    }
    if (typeof s.notifyOnComplete === "boolean") {
      setNotifyOnComplete(s.notifyOnComplete);
      void saveNotifyOnComplete(s.notifyOnComplete);
    }
    if (s.pathMap) {
      setPathMap(s.pathMap);
      void savePathMap(s.pathMap);
    }

    const base = t("Imported");
    return parsed.warnings.length
      ? `${base} · ${parsed.warnings.map((w) => t(w)).join("; ")}`
      : base;
  }, [form, servers, connect, t]);

  // Add a .torrent (or magnet) the OS asked us to open.
  const addFromOs = useCallback(
    async (target: string) => {
      try {
        await rpc.add(
          target.toLowerCase().startsWith("magnet:")
            ? { filename: target }
            : { local_torrent_path: target },
        );
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh],
  );

  // File associations: register the listener first, then drain whatever the OS
  // queued before the webview was up - that is the normal case when the app is
  // launched by opening a .torrent, so an event-only listener would miss it.
  //
  // Gated on `connected`: on a cold launch the file arrives while the RPC
  // connection is still being established, and adding a torrent then just fails
  // with "not connected". Until we drain, the backend keeps queueing, so
  // nothing is lost by waiting.
  useEffect(() => {
    if (!connected) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen<string>("open-torrent", (e) => {
          void addFromOs(e.payload);
        });
        for (const target of await invoke<string[]>("take_pending_opens")) {
          void addFromOs(target);
        }
      } catch {
        // not running under Tauri
      }
    })();
    return () => unlisten?.();
  }, [connected, addFromOs]);

  // Tell the user once per torrent that finishes downloading.
  useEffect(() => {
    if (!connected) {
      // Fresh session: forget everything so a reconnect re-baselines instead of
      // re-announcing the whole library.
      notifiedRef.current = new Set();
      seededRef.current = false;
      return;
    }
    if (!notifyOnComplete) return;
    if (!seededRef.current) {
      // Wait for the first real list, then treat it as the baseline: whatever
      // was already complete when we connected is not news.
      if (torrents.length === 0) return;
      seedFinished(torrents, notifiedRef.current);
      seededRef.current = true;
      return;
    }
    for (const x of pickNewlyFinished(torrents, notifiedRef.current)) {
      notifiedRef.current.add(x.id);
      // In-app echo as well: an OS notification can be missed (or refused), and
      // this also makes the trigger observable without a notification centre.
      setFlash(`${t("Download complete")}: ${x.name}`);
      window.setTimeout(() => setFlash(""), 8000);
      void notify(x.name, t("Download complete"));
    }
  }, [torrents, connected, notifyOnComplete, t]);

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
          value={statusIdOf(filterSel)}
          onChange={(e) =>
            setFilterSel(e.target.value === "all" ? ALL_SELECTION : { kind: "status", value: e.target.value })
          }
          disabled={!connected}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.labelKey)}
            </option>
          ))}
        </select>
        <ViewMenu view={viewOptions} onChange={changeViewOptions} />
        <button className="btn" onClick={() => setShowColumns(true)}>
          {t("Columns")}…
        </button>
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

      {viewOptions.toolbar && (
        <Toolbar
          connected={connected}
          selectedCount={selection.size}
          autoRefresh={autoRefresh}
          refreshMs={REFRESH_MS}
          big={viewOptions.bigToolbar}
          altSpeedEnabled={!!session?.["alt-speed-enabled"]}
          speedDown={Number(session?.["speed-limit-down"] ?? 0)}
          speedDownEnabled={!!session?.["speed-limit-down-enabled"]}
          speedUp={Number(session?.["speed-limit-up"] ?? 0)}
          speedUpEnabled={!!session?.["speed-limit-up-enabled"]}
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
          onToggleAltSpeed={toggleAltSpeed}
          onSetSpeed={setSpeedLimit}
          onLoadSession={loadSessionInfo}
        />
      )}

      <div className="main-area">
        {viewOptions.filterPane && (
          <FilterPane torrents={torrents} selection={filterSel} onSelect={setFilterSel} />
        )}

        <div className="list-area">
          <TorrentTable
            torrents={visible}
            total={torrents.length}
            connected={connected}
            sortKey={sortKey}
            sortDir={sortDir}
            selection={selection}
            columns={columns}
            onSort={onSort}
            onRowClick={onRowClick}
            onToggleAll={toggleAll}
            onOpenDetails={openDetails}
          />

          {viewOptions.details && (
            <DetailsPanel
              detail={detail}
              loading={detailLoading}
              revealTarget={revealTarget}
              onClose={() => {
                detailIdRef.current = null;
                setDetail(null);
              }}
              onRefresh={refreshDetail}
            />
          )}
        </div>
      </div>

      {viewOptions.statusBar && (
        <footer className="statusbar">
          {statusFields.total && (
            <span>{t("{n} torrents", { n: torrents.length })}</span>
          )}
          {statusFields.shown && visible.length !== torrents.length && (
            <span>{t("{n} shown", { n: visible.length })}</span>
          )}
          {statusFields.selected && selection.size > 0 && (
            <span>{t("{n} selected", { n: selection.size })}</span>
          )}
          {statusFields.doubleClick && (
            <span className="muted">{t("Double-click a torrent to open details")}</span>
          )}
          <span className="spacer" />
          {statusFields.hint && flash && <span className="up">{flash}</span>}
          {statusFields.updated && lastUpdate && (
            <span>{t("Updated {time}", { time: lastUpdate.toLocaleTimeString() })}</span>
          )}
        </footer>
      )}

      {showAdd && (
        <AddTorrentDialog onClose={() => setShowAdd(false)} onSubmit={submitAdd} />
      )}

      {showSettings && (
        <SettingsDialog
          onLoad={loadSession}
          onClose={() => setShowSettings(false)}
          onApply={applySettings}
          notifyOnComplete={notifyOnComplete}
          onNotifyChange={changeNotify}
          uiFontSize={uiFontSize}
          onUiFontSizeChange={changeUiFontSize}
          statusFields={statusFields}
          onStatusFieldsChange={changeStatusFields}
          hiddenRefresh={hiddenRefresh}
          onHiddenRefreshChange={changeHiddenRefresh}
          minimizeToTray={minimizeToTray}
          onMinimizeToTrayChange={changeMinimizeToTray}
          pathMap={pathMap}
          onPathMapChange={changePathMap}
          onExportSettings={exportSettings}
          onImportSettings={importSettings}
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

      {showColumns && (
        <ColumnsDialog
          columns={columns}
          onClose={() => setShowColumns(false)}
          onApply={applyColumns}
        />
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
