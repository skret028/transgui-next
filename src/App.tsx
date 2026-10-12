import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  clampPane,
  detailsCeiling,
  DEFAULT_DETAILS_HEIGHT,
  DEFAULT_FILTER_WIDTH,
  DETAILS_PANE,
  FILTER_PANE,
} from "./splitSizes";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
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
  loadDeleteTorrentFile,
  loadDirHistory,
  loadHiddenRefresh,
  loadLocale,
  loadMinimizeToTray,
  loadNotifyOnComplete,
  loadPathMap,
  loadRefreshSeconds,
  loadServers,
  loadSmoothSpeeds,
  loadStatusBarFields,
  loadTrayAlwaysVisible,
  loadUiFontSize,
  loadUpdateCheck,
  loadViewOptions,
  saveColumns,
  saveConnForm,
  saveAutoReconnect,
  saveDeleteTorrentFile,
  saveDirHistory,
  saveHiddenRefresh,
  saveLocale,
  saveMinimizeToTray,
  saveNotifyOnComplete,
  savePathMap,
  saveRefreshSeconds,
  saveServers,
  saveSmoothSpeeds,
  saveStatusBarFields,
  saveTrayAlwaysVisible,
  saveUiFontSize,
  saveUpdateCheck,
  saveViewOptions,
  saveClipboardAutoAdd,
  type HiddenRefresh,
  type StatusBarFields,
  type UiFontSize,
  type ViewOptions,
  loadWatchSettings,
  saveWatchSettings,
  loadPaneSizes,
  savePaneSizes,
  DEFAULT_WATCH,
  type WatchSettings,
} from "./settings";
import { revealPathFor, type PathMapping } from "./paths";
import { buildSettingsFile, parseSettingsFile } from "./settingsFile";
import { SPEED_WINDOW, averagedSpeeds, sampleSpeeds, type SpeedHistory } from "./speedAverage";
import { updateCheckDue } from "./updateCheck";
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
  HandlerState,
  ServerBookmark,
  SessionInfo,
  Torrent,
  TorrentDetail,
  PreparedAdd,
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
import { SPEED_PRESETS, Toolbar } from "./components/Toolbar";
import { TorrentTable } from "./components/TorrentTable";
import { DetailsPanel } from "./components/DetailsPanel";
import { pushDirHistory } from "./dirHistory";
import { filePatchAll } from "./filePriority";
import { formatBytes } from "./format";
import { resolveShortcut } from "./shortcuts";
import { AddTorrentDialog, type AddChoices } from "./components/AddTorrentDialog";
import { PromptDialog } from "./components/PromptDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { LabelsDialog } from "./components/LabelsDialog";
import { TorrentPropsDialog } from "./components/TorrentPropsDialog";
import { MoveLocationDialog } from "./components/MoveLocationDialog";
import { LicenseDialog } from "./components/LicenseDialog";
import { StatsDialog } from "./components/StatsDialog";
import { ColumnsDialog } from "./components/ColumnsDialog";
import { FilterPane } from "./components/FilterPane";
import { ViewMenu } from "./components/ViewMenu";
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { DEFAULT_COLUMNS, normalizeColumns, type ColumnId } from "./columns";
import { notify } from "./notify";
import { listen } from "@tauri-apps/api/event";
import { enqueue, take } from "./watchQueue";
import { invoke } from "@tauri-apps/api/core";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { extractTorrentLink, magnetLink, trackersFromMagnet } from "./torrentLink";
import { copyText } from "./clipboard";

/** How often the opt-in clipboard watcher looks for a new torrent link. */
const CLIPBOARD_MS = 2000;

/**
 * Whether a failure from the daemon was an authentication one.
 *
 * The daemon answers 401 and the backend turns that into one sentence; there is
 * no error code carried across, so the message is what there is to go on. Kept
 * in one place so there is one thing to change if that ever becomes a code.
 */
const isAuthError = (e: unknown) => /401|unauthor|未授权/i.test(String(e));

function AppInner() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const [form, setForm] = useState<ConnForm>(DEFAULT_FORM);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");
  /** Set when the daemon refused the credentials, to ask for a new password. */
  const [authPrompt, setAuthPrompt] = useState(false);
  /** Transient green confirmation (e.g. "Copied"); cleared on a timer. */
  const [notice, setNotice] = useState("");
  /** Where the torrent list's context menu is open, if it is. */
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number } | null>(null);
  /** The rename dialog, reached by F2 or the row menu. */
  const [renameOpen, setRenameOpen] = useState(false);
  /** The move-data dialog, reached by F6 or the row menu. */
  const [moveOpen, setMoveOpen] = useState(false);
  /** The licence notice, from the Help menu. */
  const [licenseOpen, setLicenseOpen] = useState(false);
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
  /** How often the list is reloaded while the window is visible, in seconds. */
  const [refreshSeconds, setRefreshSeconds] = useState(2);
  /** Delete the local `.torrent` once the daemon has accepted it. */
  const [deleteTorrentFile, setDeleteTorrentFile] = useState(false);
  /** Days between version checks; 0 leaves the check to the button. */
  const [updateCheckDays, setUpdateCheckDays] = useState(0);
  /** Who the system opens magnet links and .torrent files with. */
  const [handler, setHandler] = useState<HandlerState>({
    supported: false,
    torrent: false,
    magnet: false,
  });
  /** When the last version check ran, as it was read at startup. */
  const updateCheckLast = useRef("");
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  /** Opt-in: pre-fill the Add dialog when a torrent link is copied. */
  const [clipboardAuto, setClipboardAuto] = useState(false);
  /** Link found on the clipboard, handed to the Add dialog for confirmation. */
  /** A magnet link or .torrent path the Add dialog should open with filled in.
   *  The clipboard watcher sets it, and so does the OS handing us a link. */
  const [prefillSource, setPrefillSource] = useState("");

  /**
   * The watched folder, the file from it currently on offer, and the ones still
   * waiting their turn. What the folder holds is what gets offered; see
   * watchQueue.ts.
   */
  const [watch, setWatch] = useState<WatchSettings>(DEFAULT_WATCH);
  const [watchOffer, setWatchOffer] = useState<string | null>(null);
  const watchWaiting = useRef<string[]>([]);

  /**
   * The two pane sizes. The original remembers both splitter positions; the way
   * a size is held inside its bounds is in splitSizes.ts.
   */
  const [filterWidth, setFilterWidth] = useState(DEFAULT_FILTER_WIDTH);
  const [detailsHeight, setDetailsHeight] = useState(DEFAULT_DETAILS_HEIGHT);
  /** Read when a drag ends, without making the drag callbacks depend on them. */
  const panesRef = useRef({ filterWidth, detailsHeight });
  useEffect(() => {
    panesRef.current = { filterWidth, detailsHeight };
  }, [filterWidth, detailsHeight]);
  /** Read by the timer without making it depend on the dialog's state. */
  const showAddRef = useRef(false);
  /** Opt-in: show a moving average of the list's transfer speeds. */
  const [smoothSpeeds, setSmoothSpeeds] = useState(false);
  /** Rolling per-torrent rate samples, folded in on every refresh. */
  const [speedHistory, setSpeedHistory] = useState<SpeedHistory>({});
  /** Tray icon stays visible even while the window is shown. */
  const [trayAlwaysVisible, setTrayAlwaysVisible] = useState(true);
  /** Retry a dropped connection instead of waiting for a manual click. */
  const [autoReconnect, setAutoReconnect] = useState(true);
  /** Recent download directories, newest first, for the Add dialog. */
  const [dirHistory, setDirHistory] = useState<string[]>([]);
  /** Guards the save effect so the initial empty state is never persisted. */
  const dirHistoryLoaded = useRef(false);
  /** Where the reconnect loop currently is, for the status line. */
  const [reconnecting, setReconnecting] = useState(false);

  const [detail, setDetail] = useState<TorrentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  // Mirrored into a ref: the watch timer asks whether a dialog is up without
  // being rebuilt every time one opens.
  useEffect(() => {
    showAddRef.current = showAdd;
  }, [showAdd]);
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

  /** The same mapping for an arbitrary path (the per-file copy/open buttons). */
  const mapLocalPath = useCallback(
    (path: string) => revealPathFor(path, form.host, pathMap),
    [form.host, pathMap],
  );

  /**
   * Sizes for the status bar's sizes line: over the selection, or over what is
   * shown when nothing is selected - the scope the original uses. Summed from
   * the size fields rather than from percentages, so downloaded + remaining
   * adds up to size to download exactly.
   */
  const sizeSummary = useMemo(() => {
    const scope = selection.size > 0 ? torrents.filter((x) => selection.has(x.id)) : visible;
    let total = 0;
    let toDownload = 0;
    let left = 0;
    for (const x of scope) {
      total += x.totalSize ?? 0;
      toDownload += x.sizeWhenDone ?? 0;
      left += x.leftUntilDone ?? 0;
    }
    return { total, toDownload, downloaded: toDownload - left, left };
  }, [selection, torrents, visible]);

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
    async (override?: ConnForm): Promise<boolean> => {
      const cfg = override ?? form;
      setConnecting(true);
      setError("");
      try {
        const res = await rpc.connect(cfg);
        setConnected(true);
        setVersion(`${res.version} (rpc v${res.rpcVersion})`);
        void saveConnForm(cfg);
        await refresh();
        return true;
      } catch (e) {
        setConnected(false);
        setError(String(e));
        // A 401 means the daemon is there and the credentials are not. Ask
        // rather than retrying the same password, which is what the reconnect
        // below would otherwise do - slowly, and for ever.
        if (isAuthError(e)) setAuthPrompt(true);
        return false;
      } finally {
        setConnecting(false);
      }
    },
    [form, refresh],
  );

  const disconnect = useCallback(async () => {
    userDisconnected.current = true;
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
      const savedRefreshSeconds = await loadRefreshSeconds();
      const savedDeleteTorrentFile = await loadDeleteTorrentFile();
      const savedUpdateCheck = await loadUpdateCheck();
      const savedMinimizeToTray = await loadMinimizeToTray();
      const savedViewOptions = await loadViewOptions();
      const savedClipboardAuto = await loadClipboardAutoAdd();
      const savedSmoothSpeeds = await loadSmoothSpeeds();
      const savedTrayAlwaysVisible = await loadTrayAlwaysVisible();
      const savedAutoReconnect = await loadAutoReconnect();
      const savedDirHistory = await loadDirHistory();
      if (cancelled) return;
      setForm(saved);
      setServers(savedServers);
      setColumns(normalizeColumns(savedColumns));
      setNotifyOnComplete(notifyPref);
      setWatch(await loadWatchSettings());
      const panes = await loadPaneSizes();
      setFilterWidth(panes.filterWidth);
      setDetailsHeight(panes.detailsHeight);
      setPathMap(savedPathMap);
      setUiFontSize(savedFont);
      setStatusFields(savedStatusFields);
      setHiddenRefresh(savedHiddenRefresh);
      setRefreshSeconds(savedRefreshSeconds);
      setDeleteTorrentFile(savedDeleteTorrentFile);
      setUpdateCheckDays(savedUpdateCheck.days);
      // Not a stored preference: the system's own answer, read at startup so a
      // change made in Finder is shown as it is.
      try {
        setHandler(await rpc.handlerState());
      } catch {
        /* not available on this platform */
      }
      updateCheckLast.current = savedUpdateCheck.last;
      setMinimizeToTray(savedMinimizeToTray);
      minimizeToTrayRef.current = savedMinimizeToTray;
      void rpc.setCloseToTray(savedMinimizeToTray);
      setViewOptions(savedViewOptions);
      setClipboardAuto(savedClipboardAuto);
      setSmoothSpeeds(savedSmoothSpeeds);
      setTrayAlwaysVisible(savedTrayAlwaysVisible);
      void rpc.setTrayAlwaysVisible(savedTrayAlwaysVisible);
      setAutoReconnect(savedAutoReconnect);
      setDirHistory(savedDirHistory);
      dirHistoryLoaded.current = true;
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
        : Math.max(1, refreshSeconds) * 1000;
    timer.current = window.setInterval(() => {
      void refresh();
      void refreshDetail();
    }, interval);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [connected, autoRefresh, documentHidden, hiddenRefresh, refreshSeconds, refresh, refreshDetail]);

  // Auto-reconnect. Only after a connection has succeeded once: a first-run
  // dialog that was never filled in should not spin against a host that is
  // simply not configured yet.
  const everConnected = useRef(false);
  /** Set when the user presses Disconnect, cleared when they connect again.
   *
   * The original stops its refresh timers on an explicit disconnect, so it
   * stays disconnected; the auto-reconnect is for a connection that dropped on
   * its own. Without this the retry loop here would undo the button at once. */
  const userDisconnected = useRef(false);
  useEffect(() => {
    if (connected) everConnected.current = true;
  }, [connected]);

  useEffect(() => {
    // The password prompt stands in for the reconnect while it is open: the
    // retry it offers is the same one this loop would make, only with a
    // password that might work.
    if (!autoReconnect || connected || authPrompt || !everConnected.current) return;
    if (userDisconnected.current) return;
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
  }, [autoReconnect, connected, connect, authPrompt]);

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

  /**
   * Set the bandwidth priority of the selection. Priority is not a torrent
   * action in the RPC spec - it is a field on torrent-set, the same one the
   * properties dialog writes - so it gets a helper the menu and the shortcuts
   * both call.
   */
  const setPriority = useCallback(
    async (value: number) => {
      if (selection.size === 0) return;
      try {
        await rpc.setTorrent([...selection], { bandwidthPriority: value });
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [selection, refresh],
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
    { id: "move_location", labelKey: "Set data location…" },
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
    { id: "rename", labelKey: "Rename" },
    { id: "props", labelKey: "Properties" },
    { id: "trackers", labelKey: "Modify trackers…" },
    { id: null, labelKey: "" },
    { id: "remove", labelKey: "Remove" },
    { id: "remove_with_data", labelKey: "Remove and delete data", danger: true },
  ];

  const pickRowMenu = useCallback(
    async (act: string) => {
      setRowMenu(null);
      if (act === "prio_high" || act === "prio_normal" || act === "prio_low") {
        await setPriority(act === "prio_high" ? 1 : act === "prio_low" ? -1 : 0);
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
      if (act === "props" || act === "trackers") {
        // The original's "Modify trackers…" is this dialog: the tracker box
        // lives in it, and it acts on the torrent that was pointed at.
        setShowProps(true);
        return;
      }
      if (act === "rename") {
        setRenameOpen(true);
        return;
      }
      if (act === "move_location") {
        setMoveOpen(true);
        return;
      }
      await action(act);
    },
    [selection, torrents, action, copyMagnet, refresh, setPriority, t],
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

  /** The first selected torrent, in list order: what F2 renames, and what F6's
   *  dialog is about. The original edits the focused row, which is the same
   *  notion - one row in the list is the current one. */
  const firstSelected = useMemo(
    () => torrents.find((x) => selection.has(x.id)) ?? null,
    [torrents, selection],
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

  /** Remember where a torrent was put, for the Add dialog's next use. */
  const rememberDir = useCallback((dir: string) => {
    setDirHistory((prev) => pushDirHistory(prev, dir));
  }, []);

  // Persist the history whenever it changes. Guarded by the load flag so the
  // empty initial state cannot overwrite a stored list before it is read.
  useEffect(() => {
    if (!dirHistoryLoaded.current) return;
    void saveDirHistory(dirHistory);
  }, [dirHistory]);

  /**
   * The id the daemon reported for a repeat add, if the torrent was already
   * there. torrent-add answers with torrent-duplicate - still result: success -
   * instead of torrent-added in that case.
   */
  const duplicateIdOf = useCallback((res: unknown): number | null => {
    const d = (res as { "torrent-duplicate"?: { id?: unknown } } | null)?.["torrent-duplicate"];
    return typeof d?.id === "number" ? d.id : null;
  }, []);

  /**
   * A repeat add is not a failure, but it is not nothing either: the user asked
   * for a torrent to be added and no new one appeared. The original always
   * opens a dialog in this spot, and so does this - a repeat add that only
   * flashed a notice for two seconds read as "nothing happened".
   *
   * The torrent that was already there is selected, so it is clear which entry
   * collided. When the add named trackers the torrent does not have yet - from
   * the magnet's tr= fields, or from a local .torrent file's announce list,
   * which only ever exists on this side - it asks before merging them.
   */
  const announceDuplicate = useCallback(
    async (id: number | null, link = "", localPath = "") => {
      if (id == null) return;
      setSelection(new Set([id]));
      setNotice(t("Torrent already exists in the list"));
      const name = torrents.find((x) => x.id === id)?.name ?? "";
      const text = `${t("Torrent already exists in the list")}${name ? `: ${name}` : ""}.`;

      let wanted = trackersFromMagnet(link);
      if (wanted.length === 0 && localPath.trim()) {
        try {
          wanted = await rpc.torrentFileTrackers(localPath.trim());
        } catch {
          // Unreadable file: fall through to just saying it already exists.
        }
      }

      // Only ask about trackers that would really be added: a question with
      // nothing behind it is worse than no question.
      let fresh: string[] = [];
      if (wanted.length > 0) {
        try {
          const [detail] = await rpc.details([id]);
          const have = new Set((detail?.trackers ?? []).map((x) => x.announce));
          fresh = wanted.filter((x) => !have.has(x));
        } catch (e) {
          setError(String(e));
        }
      }

      if (fresh.length === 0) {
        await message(text);
        return;
      }
      const ok = await ask(`${text}\n\n${t("Update trackers for the existing torrent?")}`, {
        kind: "info",
      });
      if (!ok) return;
      try {
        await rpc.setTorrent([id], { trackerAdd: fresh });
      } catch (e) {
        setError(String(e));
      }
    },
    [t, torrents],
  );

  /**
   * Hand a torrent to the daemon, paused, and report back what it made of it.
   *
   * The original's Add dialog works this way round: the torrent goes over
   * first, the daemon answers with its own name and file list, and only then
   * does the dialog ask which files to take. Keeping the hand-over here means a
   * repeat add still goes through the same announcement as any other add.
   */
  const prepareAdd = useCallback(
    async (options: AddTorrentOptions): Promise<PreparedAdd | null> => {
      try {
        const res = await rpc.add({ ...options, paused: true });
        if (options.download_dir) rememberDir(options.download_dir);
        const duplicate = duplicateIdOf(res);
        if (duplicate != null) {
          setShowAdd(false);
          setPrefillSource("");
          await refresh();
          await announceDuplicate(
            duplicate,
            options.filename ?? "",
            options.local_torrent_path ?? "",
          );
          return null;
        }
        const added = (res as { "torrent-added"?: { id?: unknown } } | null)?.["torrent-added"];
        const id = typeof added?.id === "number" ? added.id : null;
        if (id == null) throw new Error(t("The daemon did not accept the torrent"));
        const [detail] = await rpc.details([id]);
        if (!detail) throw new Error(t("The daemon did not accept the torrent"));
        const files = detail.files ?? [];
        return {
          id,
          name: detail.name,
          peerLimit: Number(detail["peer-limit"] ?? 0),
          files,
          // A magnet arrives without its metadata: no files yet, and the
          // percentage says so. The original hides the contents group in
          // exactly that case rather than showing an empty grid.
          hasMetadata: files.length > 0 || detail.metadataPercentComplete === 1,
          downloadDir: String(detail.downloadDir ?? ""),
          localPath: options.local_torrent_path ?? undefined,
        };
      } catch (e) {
        setError(String(e));
        return null;
      }
    },
    [refresh, rememberDir, announceDuplicate, duplicateIdOf, t],
  );

  /** Apply the Add dialog's choices to the torrent it just handed over. */
  const applyPreparedAdd = useCallback(
    async (prepared: PreparedAdd, choices: AddChoices) => {
      try {
        const patch: Record<string, unknown> = { "peer-limit": choices.peerLimit };
        if (choices.wanted.length > 0) patch["files-wanted"] = choices.wanted;
        if (choices.unwanted.length > 0) patch["files-unwanted"] = choices.unwanted;
        await rpc.setTorrent([prepared.id], patch);
        // Renaming the torrent itself is a rename of its root path on the
        // daemon, which is how the original's "Save as" does it.
        if (choices.name && choices.name !== prepared.name) {
          await rpc.renamePath(prepared.id, prepared.name, choices.name);
        }
        if (choices.start) await rpc.action("start", [prepared.id]);
        setSelection(new Set([prepared.id]));
        setShowAdd(false);
        setPrefillSource("");
        // The original's client-side option, for adds that came from a file.
        // The daemon never sees that file, so its own trash-original setting
        // cannot do this. A failure here is not worth an error: the torrent is
        // in, and the file simply stays.
        if (deleteTorrentFile && prepared.localPath) {
          try {
            await rpc.removeFile(prepared.localPath);
          } catch (e) {
            // The torrent is in, so this is not an error; but the user asked
            // for the file to go, and a file still sitting there afterwards
            // should be said out loud rather than left to be discovered.
            setNotice(
              t("Could not delete the .torrent file: {error}", { error: String(e) }),
            );
          }
        }
        await refresh();
        await refreshDetail();
      } catch (e) {
        setError(String(e));
      }
    },
    [deleteTorrentFile, refresh, refreshDetail],
  );

  /** Drop a torrent whose Add dialog was backed out of, as the original does. */
  const discardPreparedAdd = useCallback(
    async (id: number) => {
      try {
        await rpc.action("remove", [id]);
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
              let dup: number | null = null;
              let dupPath = "";
              for (const path of torrents) {
                try {
                  const id = duplicateIdOf(await rpc.add({ local_torrent_path: path }));
                  if (id != null) {
                    dup = id;
                    dupPath = path;
                  }
                } catch (e) {
                  setError(String(e));
                }
              }
              await refresh();
              await announceDuplicate(dup, "", dupPath);
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

  const changeRefreshSeconds = useCallback((seconds: number) => {
    setRefreshSeconds(seconds);
    void saveRefreshSeconds(seconds);
  }, []);

  const changeDeleteTorrentFile = useCallback((on: boolean) => {
    setDeleteTorrentFile(on);
    void saveDeleteTorrentFile(on);
  }, []);

  const changeUpdateCheckDays = useCallback((days: number) => {
    setUpdateCheckDays(days);
    void saveUpdateCheck(days, updateCheckLast.current);
  }, []);

  /** Hand a scheme or file type to this app, or say why that cannot be done. */
  const changeHandler = useCallback(async (kind: "magnet" | "torrent", on: boolean) => {
    try {
      await rpc.setHandler(kind, on);
      // Deliberately not the state the command returns: reading a handler back
      // goes through the same LaunchServices query, and its answer can still be
      // the previous one for a moment after a write that worked. The box would
      // then look untouched right after a change that took, which reads as a
      // click that missed. The write returning Ok is the answer.
      setHandler((prev) => ({ ...prev, [kind]: on }));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Opening the settings re-reads it. This is the system's setting and not
  // something this app stores, so anything done to it elsewhere since the app
  // started would otherwise be shown wrongly until the next start.
  useEffect(() => {
    if (!showSettings) return;
    let live = true;
    void rpc
      .handlerState()
      .then((s) => {
        if (live) setHandler(s);
      })
      .catch(() => {
        /* not available on this platform */
      });
    return () => {
      live = false;
    };
  }, [showSettings]);

  /**
   * Drag a pane divider.
   *
   * The pointer is followed on the window rather than on the 5px strip, because
   * a drag leaves the strip straight away and the pane has to keep moving.
   */
  const dragPane = useCallback(
    (
      e: ReactPointerEvent,
      axis: "x" | "y",
      from: number,
      apply: (value: number) => void,
      done: () => void,
    ) => {
      e.preventDefault();
      const start = axis === "x" ? e.clientX : e.clientY;
      const move = (ev: PointerEvent) =>
        apply(from + (axis === "x" ? ev.clientX : ev.clientY) - start);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        done();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [],
  );

  /** Where the dividers were left is saved when a drag ends, not on every pixel. */
  const savePanes = useCallback(() => void savePaneSizes(panesRef.current), []);

  const beginFilterDrag = (e: ReactPointerEvent) =>
    dragPane(e, "x", filterWidth, (v) => setFilterWidth(clampPane(v, FILTER_PANE)), savePanes);

  const beginDetailsDrag = (e: ReactPointerEvent) =>
    dragPane(
      e,
      "y",
      detailsHeight,
      // Stopped short of the window's own height so the list keeps room.
      (v) => setDetailsHeight(clampPane(Math.min(v, detailsCeiling(window.innerHeight, 200)), DETAILS_PANE)),
      savePanes,
    );

  /** Offer the next watched file, if there is one and the dialog is free. */
  const offerNextWatch = useCallback(() => {
    if (showAddRef.current) return;
    const step = take(watchWaiting.current);
    watchWaiting.current = step.waiting;
    if (!step.path) return;
    setWatchOffer(step.path);
    setPrefillSource(step.path);
    setShowAdd(true);
  }, []);

  /**
   * Look in the watched folder and queue what is there.
   *
   * Same rules as the original's timer: it only looks while nothing else is
   * pending, and a file that is still in the folder gets offered again on the
   * next scan - which is what makes "delete the .torrent after a successful
   * addition" the thing that settles a watch folder down.
   */
  const watchTick = useCallback(async () => {
    if (!watch.folder || showAddRef.current) return;
    try {
      const scan = await rpc.watchScan(watch.folder);
      if (!scan.exists || !scan.writable) return;
      watchWaiting.current = enqueue(watchWaiting.current, scan.files);
    } catch {
      /* a folder that cannot be read is not worth a banner every interval */
    }
    offerNextWatch();
  }, [watch.folder, offerNextWatch]);

  useEffect(() => {
    if (!watch.folder) return;
    const ms = Math.max(1, watch.intervalMinutes) * 60_000;
    const id = window.setInterval(() => void watchTick(), ms);
    return () => window.clearInterval(id);
  }, [watch.folder, watch.intervalMinutes, watchTick]);

  // A dialog closing lets the next watched file take its turn.
  useEffect(() => {
    if (!showAdd) offerNextWatch();
  }, [showAdd, offerNextWatch]);

  const changeWatch = useCallback(
    (next: WatchSettings) => {
      setWatch(next);
      void saveWatchSettings(next);
      if (!next.folder) return;
      // Said once, when it is set, rather than on every look: a folder that is
      // not there or cannot be written to would otherwise fail silently for as
      // long as the setting is wrong.
      void rpc
        .watchScan(next.folder)
        .then((scan) => {
          if (!scan.exists) setNotice(t("That folder is not there."));
          else if (!scan.writable) setNotice(t("That folder cannot be written to."));
        })
        .catch(() => {
          /* the scan itself failed to run; the timer will try again */
        });
    },
    [t],
  );

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

  /**
   * Show the selection's download folders. The original's "Open containing
   * folder" acts on the focused row; here the whole selection goes, capped so a
   * select-all cannot open one window per torrent.
   */
  const revealSelection = useCallback(async () => {
    const dirs = new Set<string>();
    for (const x of torrents) {
      if (!selection.has(x.id)) continue;
      const local = mapLocalPath(x.downloadDir ?? "");
      if (local) dirs.add(local);
    }
    if (dirs.size === 0) {
      setNotice(t("Set a path mapping to open the daemon's folders from this machine"));
      return;
    }
    for (const dir of [...dirs].slice(0, 5)) {
      try {
        await rpc.revealPath(dir);
      } catch (e) {
        setError(String(e));
      }
    }
  }, [mapLocalPath, selection, t, torrents]);

  /**
   * The original's "Don't download" for a torrent: every file in it is marked
   * unwanted - the same patch the files tab sends for a single row.
   */
  const setNotDownload = useCallback(async () => {
    const ids = [...selection];
    if (ids.length === 0) return;
    try {
      const details = await rpc.details(ids);
      for (const d of details) {
        const count = d.files?.length ?? 0;
        if (count === 0) continue;
        await rpc.setTorrent([d.id], filePatchAll("skip", count));
      }
      setNotice(t("Don't download"));
    } catch (e) {
      setError(String(e));
    }
  }, [selection, t]);

  // Keyboard shortcuts. The table itself lives in shortcuts.ts, where it can be
  // tested without a browser; this only dispatches what it returns.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable === true;
      const hit = resolveShortcut(e, {
        typing,
        connected,
        hasVisible: visible.length > 0,
        hasSelection: selection.size > 0,
      });
      if (!hit) return;
      e.preventDefault();
      switch (hit.kind) {
        case "select-all":
          selectAll();
          break;
        case "settings":
          setShowSettings(true);
          break;
        case "big-toolbar":
          changeViewOptions({ ...viewOptions, bigToolbar: !viewOptions.bigToolbar });
          break;
        case "remove":
          void action(hit.withData ? "remove_with_data" : "remove");
          break;
        case "action":
          void action(hit.value);
          break;
        case "priority":
          void setPriority(hit.value);
          break;
        case "alt-speed":
          void toggleAltSpeed();
          break;
        case "add-torrent":
          setShowAdd(true);
          break;
        case "properties":
          setShowProps(true);
          break;
        case "labels":
          setShowLabels(true);
          break;
        case "reveal":
          void revealSelection();
          break;
        case "set-not-download":
          void setNotDownload();
          break;
        case "rename":
          setRenameOpen(true);
          break;
        case "move-data":
          setMoveOpen(true);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    action,
    changeViewOptions,
    connected,
    revealSelection,
    selectAll,
    selection,
    setNotDownload,
    setPriority,
    toggleAltSpeed,
    viewOptions,
    visible,
  ]);

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
        setPrefillSource(link);
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
      refreshSeconds,
      deleteTorrentFileAfterAdd: deleteTorrentFile,
      updateCheckDays,
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
    if (s.refreshSeconds !== undefined) changeRefreshSeconds(s.refreshSeconds);
    if (s.deleteTorrentFileAfterAdd !== undefined)
      changeDeleteTorrentFile(s.deleteTorrentFileAfterAdd);
    if (s.updateCheckDays !== undefined) changeUpdateCheckDays(s.updateCheckDays);
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

  // A .torrent or magnet the OS asked us to open.
  //
  // The original builds its Add dialog around it rather than adding it unseen
  // (TAddTorrentForm, from DoAddTorrent), and that is what happens here: the
  // dialog comes up with the link or the path filled in, and nothing is added
  // until it is confirmed.
  const openFromOs = useCallback((target: string) => {
    setPrefillSource(target);
    setShowAdd(true);
  }, []);

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
          openFromOs(e.payload);
        });
        for (const target of await invoke<string[]>("take_pending_opens")) {
          openFromOs(target);
        }
      } catch {
        // not running under Tauri
      }
    })();
    return () => unlisten?.();
  }, [connected, openFromOs]);

  // Help -> Check for new version. The settings dialog runs its own check and
  // shows the result inline; from the menu the result has to land somewhere
  // visible, so it goes to the notice line.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen("menu://check-updates", () => {
          void (async () => {
            try {
              const info = await rpc.checkForUpdates();
              setNotice(
                info.newer
                  ? t("A newer version is available: {version}", { version: info.latest })
                  : `${t("You are up to date")} · ${info.current}`,
              );
            } catch (e) {
              setError(String(e));
            }
          })();
        });
      } catch {
        // not running under Tauri
      }
    })();
    return () => unlisten?.();
  }, [t]);

  // The Help menu's licence item, beside the update check.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen("menu://license", () => setLicenseOpen(true));
      } catch {
        // not running under Tauri
      }
    })();
    return () => unlisten?.();
  }, []);

  // The original's "check for a new version every N days". Runs at startup and
  // then on a slow tick; updateCheckDue decides whether anything is owed, so a
  // machine that was asleep for a week picks the check up when it wakes rather
  // than skipping it. A check that cannot reach GitHub says nothing - the button
  // in the settings is where a failure belongs.
  useEffect(() => {
    if (updateCheckDays <= 0) return;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      if (!updateCheckDue(updateCheckLast.current, updateCheckDays, new Date())) return;
      try {
        const info = await rpc.checkForUpdates();
        if (cancelled) return;
        updateCheckLast.current = new Date().toISOString();
        void saveUpdateCheck(updateCheckDays, updateCheckLast.current);
        if (info.newer) {
          setNotice(t("A newer version is available: {version}", { version: info.latest }));
        }
      } catch {
        /* offline, or GitHub is unreachable: the button reports that */
      }
    };
    void run();
    const id = window.setInterval(() => void run(), 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [updateCheckDays, t]);

  // The tray offers what the original's does: start and stop everything, pick a
  // speed limit per direction, flip the alternative speeds. All of it acts on
  // the daemon, which the window owns, so the tray only asks for the very
  // helper the toolbar button calls and the two cannot drift apart.
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let cancelled = false;
    const on = async <T,>(name: string, handler: (event: { payload: T }) => void) => {
      try {
        const un = await listen<T>(name, handler);
        if (cancelled) un();
        else unlisteners.push(un);
      } catch {
        // not running under Tauri
      }
    };
    void (async () => {
      await on("tray://start-all", () => void globalAction("start_all"));
      await on("tray://stop-all", () => void globalAction("stop_all"));
      await on("tray://alt-speed", () => void toggleAltSpeed());
      await on<[string, number]>("tray://set-speed", (event) => {
        const [which, kbps] = event.payload;
        void setSpeedLimit(which === "up" ? "up" : "down", kbps < 0 ? null : kbps);
      });
    })();
    return () => {
      cancelled = true;
      for (const un of unlisteners) un();
    };
  }, [globalAction, toggleAltSpeed, setSpeedLimit]);

  // Keep the tray's labels and check marks level with the daemon. Only these
  // few values are dependencies, and the backend skips an unchanged payload, so
  // the menu is rebuilt when a limit really moved rather than on every poll.
  const trayAltSpeed = !!session?.["alt-speed-enabled"];
  const trayDownEnabled = !!session?.["speed-limit-down-enabled"];
  const trayDownKbps = Number(session?.["speed-limit-down"] ?? 0);
  const trayUpEnabled = !!session?.["speed-limit-up-enabled"];
  const trayUpKbps = Number(session?.["speed-limit-up"] ?? 0);
  const traySpeeds = useMemo(() => {
    const speeds = [...SPEED_PRESETS];
    // The original lists whatever limit is in force even when it is not one of
    // the presets, so a custom speed still gets a check mark of its own.
    if (trayDownEnabled && trayDownKbps > 0) speeds.push(trayDownKbps);
    if (trayUpEnabled && trayUpKbps > 0) speeds.push(trayUpKbps);
    return Array.from(new Set(speeds)).sort((a, b) => a - b);
  }, [trayDownEnabled, trayDownKbps, trayUpEnabled, trayUpKbps]);

  useEffect(() => {
    void rpc
      .setTrayState({
        connected,
        alt_speed: trayAltSpeed,
        down_enabled: trayDownEnabled,
        down_kbps: trayDownKbps,
        up_enabled: trayUpEnabled,
        up_kbps: trayUpKbps,
        speeds: traySpeeds,
      })
      .catch(() => {
        // not running under Tauri
      });
  }, [
    connected,
    trayAltSpeed,
    trayDownEnabled,
    trayDownKbps,
    trayUpEnabled,
    trayUpKbps,
    traySpeeds,
  ]);

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

  /**
   * Give a saved connection another name.
   *
   * The name is the key the list is matched on, so this is a rename and not a
   * save: a name another entry already has is refused rather than silently
   * swallowing it, which would leave two entries claiming one name.
   */
  const renameServer = useCallback(
    (id: string, name: string) => {
      if (!id) return;
      const wanted = name.trim();
      if (!wanted) return;
      const entry = servers.find((s) => s.id === id);
      if (!entry || entry.name === wanted) return;
      if (servers.some((s) => s.id !== id && s.name === wanted)) {
        setError(t("A connection with that name already exists"));
        return;
      }
      void persistServers(servers.map((s) => (s.id === id ? { ...s, name: wanted } : s)));
    },
    [servers, persistServers, t],
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
        onConnect={() => {
          // An explicit connect is the user changing their mind about the
          // disconnect above, so the retry loop is theirs again.
          userDisconnected.current = false;
          void connect();
        }}
        onDisconnect={disconnect}
        onSelectServer={selectServer}
        onSaveServer={saveServer}
        onDeleteServer={deleteServer}
        onRenameServer={renameServer}
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
          refreshMs={refreshSeconds * 1000}
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
            setPrefillSource("");
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
          <>
            <FilterPane
              torrents={torrents}
              selection={filterSel}
              onSelect={setFilterSel}
              width={filterWidth}
            />
            <div className="splitter splitter-v" onPointerDown={beginFilterDrag} />
          </>
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
            <>
              <div className="splitter splitter-h" onPointerDown={beginDetailsDrag} />
              <DetailsPanel
              detail={detail}
              loading={detailLoading}
              revealTarget={revealTarget}
              mapPath={mapLocalPath}
              height={detailsHeight}
              dirHistory={dirHistory}
              onMoved={rememberDir}
              onClose={() => {
                detailIdRef.current = null;
                setDetail(null);
              }}
              onRefresh={refreshDetail}
            />
            </>
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
          {statusFields.sizes && (
            <span>
              {t("Total size")}: {formatBytes(sizeSummary.total)} · {t("Size to download")}:{" "}
              {formatBytes(sizeSummary.toDownload)} · {t("Downloaded")}:{" "}
              {formatBytes(sizeSummary.downloaded)} · {t("Remaining")}:{" "}
              {formatBytes(sizeSummary.left)}
            </span>
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
          initialSource={prefillSource}
          initialDownloadDir={watchOffer ? watch.destination : ""}
          onClose={() => {
            setShowAdd(false);
            setPrefillSource("");
            setWatchOffer(null);
          }}
          onPrepare={prepareAdd}
          onApply={applyPreparedAdd}
          onDiscard={discardPreparedAdd}
          dirHistory={dirHistory}
        />
      )}

      {authPrompt && (
        <PromptDialog
          title={t("Connect to {host}", { host: form.host })}
          label={t("Please enter a password to connect to {host}:", { host: form.host })}
          secret
          placeholder={t("Password")}
          submitLabel={t("Connect")}
          onClose={() => setAuthPrompt(false)}
          onSubmit={async (password) => {
            const next = { ...form, password };
            setForm(next);
            // Retrying by hand counts as asking to be connected, so the
            // auto-reconnect loop may look after it again.
            userDisconnected.current = false;
            const ok = await connect(next);
            // Stay open until the password actually works: a refusal is
            // something to correct, not to retype from a closed dialog. The
            // prompt's own onClose would otherwise clear the flag the failed
            // connect just set.
            if (!ok) throw new Error(t("Still not authorised - check the password"));
          }}
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
          watch={watch}
          onWatchChange={changeWatch}
          autoReconnect={autoReconnect}
          onAutoReconnectChange={changeAutoReconnect}
          refreshSeconds={refreshSeconds}
          onRefreshSecondsChange={changeRefreshSeconds}
          deleteTorrentFile={deleteTorrentFile}
          onDeleteTorrentFileChange={changeDeleteTorrentFile}
          updateCheckDays={updateCheckDays}
          onUpdateCheckDaysChange={changeUpdateCheckDays}
          handler={handler}
          onHandlerChange={changeHandler}
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

      {renameOpen && firstSelected && (
        <PromptDialog
          title={t("Rename")}
          label={t("New name")}
          context={`${firstSelected.downloadDir}/${firstSelected.name}`}
          initial={firstSelected.name}
          submitLabel={t("Rename")}
          onClose={() => setRenameOpen(false)}
          onSubmit={async (name) => {
            const next = name.trim();
            // Renaming the torrent means renaming its folder on disk, so the
            // path to send is the one the name forms: the root of the torrent.
            if (!next || next === firstSelected.name) return;
            await rpc.renamePath(firstSelected.id, firstSelected.name, next);
            await refresh();
            await refreshDetail();
          }}
        />
      )}

      {moveOpen && firstSelected && (
        <MoveLocationDialog
          count={selection.size}
          current={firstSelected.downloadDir}
          name={firstSelected.name}
          dirHistory={dirHistory}
          onClose={() => setMoveOpen(false)}
          onSubmit={async (location, moveData) => {
            await rpc.setLocation([...selection], location, moveData);
            // The destination joins the recent directories, as the original's
            // LastMoveDir does.
            rememberDir(location);
            await refresh();
            await refreshDetail();
          }}
        />
      )}

      {licenseOpen && <LicenseDialog onClose={() => setLicenseOpen(false)} />}

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
