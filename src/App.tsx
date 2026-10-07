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
  loadClipboardAutoAdd,
  loadColumns,
  loadConnForm,
  loadAutoReconnect,
  loadHiddenRefresh,
  loadLocale,
  loadMinimizeToTray,
  loadNotifyOnComplete,
  loadPathMap,
  loadServers,
  loadSmoothSpeeds,
  loadStatusBarFields,
  loadTrayAlwaysVisible,
  loadUiFontSize,
  loadViewOptions,
  saveColumns,
  saveConnForm,
  saveAutoReconnect,
  saveHiddenRefresh,
  saveLocale,
  saveMinimizeToTray,
  saveNotifyOnComplete,
  savePathMap,
  saveServers,
  saveSmoothSpeeds,
  saveStatusBarFields,
  saveTrayAlwaysVisible,
  saveUiFontSize,
  saveViewOptions,
  saveClipboardAutoAdd,
  type HiddenRefresh,
  type StatusBarFields,
  type UiFontSize,
  type ViewOptions,
} from "./settings";
import { revealPathFor, type PathMapping } from "./paths";
import { buildSettingsFile, parseSettingsFile } from "./settingsFile";
import { SPEED_WINDOW, averagedSpeeds, sampleSpeeds, type SpeedHistory } from "./speedAverage";
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
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { DEFAULT_COLUMNS, normalizeColumns, type ColumnId } from "./columns";
import { notify } from "./notify";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { extractTorrentLink, magnetLink } from "./torrentLink";
import { copyText } from "./clipboard";

const REFRESH_MS = 2000;
/** How often the opt-in clipboard watcher looks for a new torrent link. */
const CLIPBOARD_MS = 2000;

function AppInner() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const [form, setForm] = useState<ConnForm>(DEFAULT_FORM);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");
  /** Transient green confirmation (e.g. "Copied"); cleared on a timer. */
  const [notice, setNotice] = useState("");
  /** Where the torrent list's context menu is open, if it is. */
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number } | null>(null);
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
  /** Opt-in: pre-fill the Add dialog when a torrent link is copied. */
  const [clipboardAuto, setClipboardAuto] = useState(false);
  /** Link found on the clipboard, handed to the Add dialog for confirmation. */
  const [clipboardLink, setClipboardLink] = useState("");
  /** Opt-in: show a moving average of the list's transfer speeds. */
  const [smoothSpeeds, setSmoothSpeeds] = useState(false);
  /** Rolling per-torrent rate samples, folded in on every refresh. */
  const [speedHistory, setSpeedHistory] = useState<SpeedHistory>({});
  /** Tray icon stays visible even while the window is shown. */
  const [trayAlwaysVisible, setTrayAlwaysVisible] = useState(true);
  /** Retry a dropped connection instead of waiting for a manual click. */
  const [autoReconnect, setAutoReconnect] = useState(true);
  /** Where the reconnect loop currently is, for the status line. */
  const [reconnecting, setReconnecting] = useState(false);

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
  /** Clipboard links already offered, so the same one is not re-prompted. */
  const clipboardSeenRef = useRef<Set<string>>(new Set());
  /** Mirrors `showAdd` for the clipboard watcher, which must not consume a
   * link while the Add dialog is already open. */
  const addOpenRef = useRef(false);

  const visible = useMemo(
    () =>
      sortTorrents(
        filterTorrents(torrents, { text: filterText, selection: filterSel }),
        sortKey,
        sortDir,
      ),
    [torrents, filterText, filterSel, sortKey, sortDir],
  );

  // Smoothed rates for the list, or null to show the daemon's raw values.
  const displaySpeeds = useMemo(
    () => (smoothSpeeds ? averagedSpeeds(speedHistory) : null),
    [smoothSpeeds, speedHistory],
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
      const list = await rpc.torrents();
      setTorrents(list);
      // Feed the smoothing history on every poll, so toggling the setting on
      // shows a value immediately instead of building up from nothing.
      setSpeedHistory((prev) =>
        sampleSpeeds(
          prev,
          list.map((x) => ({ id: x.id, down: x.rateDownload, up: x.rateUpload })),
          SPEED_WINDOW,
        ),
      );
      setLastUpdate(new Date());
      setError("");
    } catch (e) {
      setError(String(e));
      // A failing poll means the daemon is no longer answering. Treat the
      // connection as down so the reconnect loop below can take over; leaving
      // `connected` true would just repeat this error every two seconds.
      setConnected(false);
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
      const savedClipboardAuto = await loadClipboardAutoAdd();
      const savedSmoothSpeeds = await loadSmoothSpeeds();
      const savedTrayAlwaysVisible = await loadTrayAlwaysVisible();
      const savedAutoReconnect = await loadAutoReconnect();
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
      setClipboardAuto(savedClipboardAuto);
      setSmoothSpeeds(savedSmoothSpeeds);
      setTrayAlwaysVisible(savedTrayAlwaysVisible);
      void rpc.setTrayAlwaysVisible(savedTrayAlwaysVisible);
      setAutoReconnect(savedAutoReconnect);
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

  // Auto-reconnect. Only after a connection has succeeded once: a first-run
  // dialog that was never filled in should not spin against a host that is
  // simply not configured yet.
  const everConnected = useRef(false);
  useEffect(() => {
    if (connected) everConnected.current = true;
  }, [connected]);

  useEffect(() => {
    if (!autoReconnect || connected || !everConnected.current) return;
    let cancelled = false;
    let delay = 1000;
    let timer = 0;
    const attempt = () => {
      if (cancelled) return;
      setReconnecting(true);
      void connect().finally(() => {
        if (cancelled) return;
        // Success flips `connected`, which tears this effect down before the
        // next attempt is scheduled.
        delay = Math.min(delay * 2, 30000);
        timer = window.setTimeout(attempt, delay);
      });
    };
    timer = window.setTimeout(attempt, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [autoReconnect, connected, connect]);

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

  const selectAll = useCallback(() => {
    setSelection(new Set(visible.map((x) => x.id)));
  }, [visible]);

  const selectNone = useCallback(() => setSelection(new Set()), []);

  // Cmd/Ctrl+A selects every visible torrent, mirroring the header checkbox.
  // It is skipped while typing in a field so the browser's own select-all still
  // works inside the filter box, dialog inputs, etc.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "a") return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (!connected || visible.length === 0) return;
      e.preventDefault();
      selectAll();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connected, visible, selectAll]);

  const openDetails = useCallback(
    (id: number) => {
      detailIdRef.current = id;
      void refreshDetail();
    },
    [refreshDetail],
  );

  // Confirmation messages clear themselves; nothing else resets them.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(id);
  }, [notice]);

  /** Copy one magnet URI per selected torrent, newline separated. */
  const copyMagnet = useCallback(async () => {
    const links = torrents
      .filter((x) => selection.has(x.id))
      .map((x) => magnetLink(x.hashString, x.name))
      .filter(Boolean);
    if (links.length === 0) {
      setError(t("Select a torrent in the list first"));
      return;
    }
    setError("");
    if (await copyText(links.join("\n"))) setNotice(t("Copied"));
    else setError(t("Could not copy to the clipboard"));
  }, [torrents, selection, t]);

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

  // A right-click on a row that is not already selected makes it the selection,
  // so the menu acts on the torrent that was pointed at rather than on whatever
  // happened to be selected before.
  const openRowMenu = useCallback((id: number, x: number, y: number) => {
    setSelection((prev) => (prev.has(id) ? prev : new Set([id])));
    setRowMenu({ x, y });
  }, []);

  const menuItems: MenuItem[] = [
    { id: "start", labelKey: "Start" },
    { id: "stop", labelKey: "Stop" },
    { id: "verify", labelKey: "Verify" },
    { id: "reannounce", labelKey: "Reannounce" },
    { id: null, labelKey: "" },
    {
      id: "priority",
      labelKey: "Priority",
      children: [
        { id: "prio_high", labelKey: "High priority" },
        { id: "prio_normal", labelKey: "Normal priority" },
        { id: "prio_low", labelKey: "Low priority" },
      ],
    },
    {
      id: "queue",
      labelKey: "Queue",
      children: [
        { id: "queue_top", labelKey: "Move top" },
        { id: "queue_up", labelKey: "Move up" },
        { id: "queue_down", labelKey: "Move down" },
        { id: "queue_bottom", labelKey: "Move bottom" },
      ],
    },
    { id: null, labelKey: "" },
    { id: "copy_magnet", labelKey: "Copy Magnet Link(s)" },
    { id: "copy_hash", labelKey: "Copy" },
    { id: null, labelKey: "" },
    { id: "labels", labelKey: "Labels" },
    { id: "props", labelKey: "Properties" },
    { id: null, labelKey: "" },
    { id: "remove", labelKey: "Remove" },
    { id: "remove_with_data", labelKey: "Remove and delete data", danger: true },
  ];

  const pickRowMenu = useCallback(
    async (act: string) => {
      setRowMenu(null);
      // Priority is not a torrent action in the RPC spec: it is a field on
      // torrent-set, the same one the properties dialog writes.
      if (act === "prio_high" || act === "prio_normal" || act === "prio_low") {
        const value = act === "prio_high" ? 1 : act === "prio_low" ? -1 : 0;
        try {
          await rpc.setTorrent([...selection], { bandwidthPriority: value });
          await refresh();
        } catch (e) {
          setError(String(e));
        }
        return;
      }
      if (act === "copy_magnet") {
        await copyMagnet();
        return;
      }
      if (act === "copy_hash") {
        const hashes = torrents.filter((x) => selection.has(x.id)).map((x) => x.hashString);
        if (hashes.length > 0 && (await copyText(hashes.join("\n")))) setNotice(t("Copied"));
        return;
      }
      if (act === "labels") {
        setShowLabels(true);
        return;
      }
      if (act === "props") {
        setShowProps(true);
        return;
      }
      await action(act);
    },
    [selection, torrents, action, copyMagnet, refresh, t],
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
        setClipboardLink("");
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

  const changeClipboardAuto = useCallback((on: boolean) => {
    setClipboardAuto(on);
    void saveClipboardAutoAdd(on);
  }, []);

  const changeSmoothSpeeds = useCallback((on: boolean) => {
    setSmoothSpeeds(on);
    void saveSmoothSpeeds(on);
  }, []);

  const changeTrayAlwaysVisible = useCallback((on: boolean) => {
    setTrayAlwaysVisible(on);
    void rpc.setTrayAlwaysVisible(on);
    void saveTrayAlwaysVisible(on);
  }, []);

  const changeAutoReconnect = useCallback((on: boolean) => {
    setAutoReconnect(on);
    void saveAutoReconnect(on);
  }, []);

  // Opt-in clipboard watcher. Every couple of seconds, only while enabled and
  // connected, look for a torrent link the user has newly copied. A new link
  // opens the Add dialog pre-filled for review — it is never added silently.
  useEffect(() => {
    addOpenRef.current = showAdd;
  }, [showAdd]);

  useEffect(() => {
    if (!clipboardAuto || !connected) return;
    const id = window.setInterval(() => {
      void (async () => {
        // Leave the link for later rather than hijacking the open dialog.
        if (addOpenRef.current) return;
        let text = "";
        try {
          text = await readText();
        } catch {
          // Permission denied or no clipboard: skip this tick.
          return;
        }
        const link = extractTorrentLink(text);
        if (!link || clipboardSeenRef.current.has(link)) return;
        clipboardSeenRef.current.add(link);
        setClipboardLink(link);
        setShowAdd(true);
      })();
    }, CLIPBOARD_MS);
    return () => window.clearInterval(id);
  }, [clipboardAuto, connected]);

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
      uiFontSize,
      statusBarFields: statusFields,
      hiddenRefresh,
      minimizeToTray,
      viewOptions,
      clipboardAutoAdd: clipboardAuto,
      smoothSpeeds,
      trayAlwaysVisible,
      autoReconnect,
    });
    const target = await save({
      defaultPath: "transgui-next-settings.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!target) return "";
    await rpc.writeTextFile(target, JSON.stringify(payload, null, 2) + "\n");
    return `${t("Exported to")} ${target}`;
  }, [
    form,
    servers,
    locale,
    columns,
    notifyOnComplete,
    pathMap,
    uiFontSize,
    statusFields,
    hiddenRefresh,
    minimizeToTray,
    viewOptions,
    clipboardAuto,
    smoothSpeeds,
    trayAlwaysVisible,
    autoReconnect,
    t,
  ]);

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
      // The file carries no secrets: keep ours when it is the same server (and
      // the same proxy), otherwise the imported entry has to be filled in by
      // hand.
      const merged: ConnForm = {
        ...s.form,
        password: s.form.host === form.host ? form.password : "",
        proxyPassword: s.form.proxyHost === form.proxyHost ? form.proxyPassword : "",
      };
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
          form: {
            ...sv.form,
            password: known?.form.password ?? "",
            proxyPassword:
              known && known.form.proxyHost === sv.form.proxyHost ? known.form.proxyPassword : "",
          },
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
    // Always present (defaulted when the file predates them), so apply as-is.
    if (s.uiFontSize !== undefined) changeUiFontSize(s.uiFontSize);
    if (s.statusBarFields !== undefined) changeStatusFields(s.statusBarFields);
    if (s.hiddenRefresh !== undefined) changeHiddenRefresh(s.hiddenRefresh);
    if (s.autoReconnect !== undefined) changeAutoReconnect(s.autoReconnect);
    if (s.minimizeToTray !== undefined) changeMinimizeToTray(s.minimizeToTray);
    if (s.viewOptions !== undefined) changeViewOptions(s.viewOptions);
    if (s.clipboardAutoAdd !== undefined) changeClipboardAuto(s.clipboardAutoAdd);
    if (s.smoothSpeeds !== undefined) changeSmoothSpeeds(s.smoothSpeeds);
    if (s.trayAlwaysVisible !== undefined) changeTrayAlwaysVisible(s.trayAlwaysVisible);

    const base = t("Imported");
    return parsed.warnings.length
      ? `${base} · ${parsed.warnings.map((w) => t(w)).join("; ")}`
      : base;
  }, [
    form,
    servers,
    connect,
    changeUiFontSize,
    changeStatusFields,
    changeHiddenRefresh,
    changeMinimizeToTray,
    changeViewOptions,
    changeClipboardAuto,
    changeSmoothSpeeds,
    changeTrayAlwaysVisible,
    t,
  ]);

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
      {notice && <div className="notice">{notice}</div>}
      {reconnecting && !connected && (
        <div className="notice">{t("Connecting to daemon")}…</div>
      )}
      {rowMenu && (
        <ContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={menuItems}
          onPick={(id) => void pickRowMenu(id)}
          onClose={() => setRowMenu(null)}
        />
      )}

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
          onSelectAll={selectAll}
          onSelectNone={selectNone}
          onCopyMagnet={() => void copyMagnet()}
          onGlobalAction={globalAction}
          onOpenAdd={() => {
            setClipboardLink("");
            setShowAdd(true);
          }}
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
            speedAvg={displaySpeeds}
            onSort={onSort}
            onRowClick={onRowClick}
            onRowContextMenu={openRowMenu}
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
        <AddTorrentDialog
          initialSource={clipboardLink}
          onClose={() => {
            setShowAdd(false);
            setClipboardLink("");
          }}
          onSubmit={submitAdd}
        />
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
          clipboardAuto={clipboardAuto}
          onClipboardAutoChange={changeClipboardAuto}
          smoothSpeeds={smoothSpeeds}
          onSmoothSpeedsChange={changeSmoothSpeeds}
          trayAlwaysVisible={trayAlwaysVisible}
          onTrayAlwaysVisibleChange={changeTrayAlwaysVisible}
          autoReconnect={autoReconnect}
          onAutoReconnectChange={changeAutoReconnect}
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
