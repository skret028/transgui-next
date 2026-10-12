// Connection settings persistence via tauri-plugin-store.
import { load, type Store } from "@tauri-apps/plugin-store";
import type { ConnForm, ServerBookmark } from "./types";
import { normalizePathMap, type PathMapping } from "./paths";
import { clampHistoryLimit, DIR_HISTORY_MAX } from "./dirHistory";
import { clampConnectTimeout, clampHttpTimeout, CONNECT_TIMEOUT_DEFAULT, HTTP_TIMEOUT_DEFAULT } from "./netTimeouts";
import {
  clampPane,
  DEFAULT_DETAILS_HEIGHT,
  DEFAULT_FILTER_WIDTH,
  DETAILS_PANE,
  FILTER_PANE,
} from "./splitSizes";

const FILE = "settings.json";
const KEY = "connection";
const SERVERS_KEY = "servers";

export const DEFAULT_FORM: ConnForm = {
  host: "localhost",
  port: "9091",
  path: "/transmission/rpc",
  username: "",
  password: "",
  https: false,
  acceptInvalid: false,
  clientCert: "",
  clientKey: "",
  proxyEnabled: false,
  proxyHost: "",
  proxyPort: "",
  proxyUsername: "",
  proxyPassword: "",
  socks5: false,
};

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(FILE, { autoSave: false });
  }
  return storePromise;
}

export async function loadConnForm(): Promise<{ form: ConnForm; saved: boolean }> {
  try {
    const store = await getStore();
    const value = await store.get<Partial<ConnForm>>(KEY);
    if (value && typeof value === "object") {
      return { form: { ...DEFAULT_FORM, ...value }, saved: true };
    }
  } catch {
    // fall through to defaults
  }
  return { form: DEFAULT_FORM, saved: false };
}

export async function saveConnForm(form: ConnForm): Promise<void> {
  const store = await getStore();
  await store.set(KEY, form);
  await store.save();
}

export async function loadServers(): Promise<ServerBookmark[]> {
  try {
    const store = await getStore();
    const list = await store.get<ServerBookmark[]>(SERVERS_KEY);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveServers(list: ServerBookmark[]): Promise<void> {
  const store = await getStore();
  await store.set(SERVERS_KEY, list);
  await store.save();
}

const LOCALE_KEY = "locale";

export async function loadLocale(): Promise<string | undefined> {
  try {
    const store = await getStore();
    return (await store.get<string>(LOCALE_KEY)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function saveLocale(code: string): Promise<void> {
  const store = await getStore();
  await store.set(LOCALE_KEY, code);
  await store.save();
}

const COLUMNS_KEY = "columns";

export async function loadColumns(): Promise<unknown> {
  try {
    const store = await getStore();
    return await store.get<unknown>(COLUMNS_KEY);
  } catch {
    return undefined;
  }
}

export async function saveColumns(columns: string[]): Promise<void> {
  const store = await getStore();
  await store.set(COLUMNS_KEY, columns);
  await store.save();
}

const NOTIFY_KEY = "notifyOnComplete";

/** Notify when a torrent finishes downloading. Defaults to on. */
export async function loadNotifyOnComplete(): Promise<boolean> {
  try {
    const store = await getStore();
    return (await store.get<boolean>(NOTIFY_KEY)) ?? true;
  } catch {
    return true;
  }
}

export async function saveNotifyOnComplete(on: boolean): Promise<void> {
  const store = await getStore();
  await store.set(NOTIFY_KEY, on);
  await store.save();
}

const PATH_MAP_KEY = "pathMap";

/** Maps daemon-side path prefixes onto this machine's view. */
export async function loadPathMap(): Promise<PathMapping[]> {
  try {
    const store = await getStore();
    return normalizePathMap(await store.get<unknown>(PATH_MAP_KEY));
  } catch {
    return [];
  }
}

export async function savePathMap(list: PathMapping[]): Promise<void> {
  const store = await getStore();
  await store.set(PATH_MAP_KEY, list);
  await store.save();
}

/** Interface text scale, applied to the root element as a data attribute. */
export type UiFontSize = "small" | "medium" | "large";

const UI_FONT_KEY = "uiFontSize";

export async function loadUiFontSize(): Promise<UiFontSize> {
  try {
    const store = await getStore();
    const value = await store.get<UiFontSize>(UI_FONT_KEY);
    return value === "small" || value === "large" ? value : "medium";
  } catch {
    return "medium";
  }
}

export async function saveUiFontSize(size: UiFontSize): Promise<void> {
  const store = await getStore();
  await store.set(UI_FONT_KEY, size);
  await store.save();
}

/** Which fields the bottom status bar renders. */
export interface StatusBarFields {
  total: boolean;
  shown: boolean;
  selected: boolean;
  updated: boolean;
  hint: boolean;
  doubleClick: boolean;
  /** Sizes of the selected (or shown) torrents, as the original's sizes mode. */
  sizes: boolean;
}

export const DEFAULT_STATUS_FIELDS: StatusBarFields = {
  total: true,
  shown: true,
  selected: true,
  updated: true,
  hint: true,
  doubleClick: true,
  sizes: false,
};

const STATUS_FIELDS_KEY = "statusBarFields";

export async function loadStatusBarFields(): Promise<StatusBarFields> {
  try {
    const store = await getStore();
    const value = await store.get<Partial<StatusBarFields>>(STATUS_FIELDS_KEY);
    if (value && typeof value === "object") return { ...DEFAULT_STATUS_FIELDS, ...value };
  } catch {
    // fall through to defaults
  }
  return DEFAULT_STATUS_FIELDS;
}

export async function saveStatusBarFields(fields: StatusBarFields): Promise<void> {
  const store = await getStore();
  await store.set(STATUS_FIELDS_KEY, fields);
  await store.save();
}

/** A longer polling interval to use while the window is hidden. */
export interface HiddenRefresh {
  enabled: boolean;
  seconds: number;
}

export const DEFAULT_HIDDEN_REFRESH: HiddenRefresh = { enabled: false, seconds: 10 };

const HIDDEN_REFRESH_KEY = "hiddenRefresh";

export async function loadHiddenRefresh(): Promise<HiddenRefresh> {
  try {
    const store = await getStore();
    const value = await store.get<Partial<HiddenRefresh>>(HIDDEN_REFRESH_KEY);
    if (value && typeof value === "object") return { ...DEFAULT_HIDDEN_REFRESH, ...value };
  } catch {
    // fall through to defaults
  }
  return DEFAULT_HIDDEN_REFRESH;
}

export async function saveHiddenRefresh(value: HiddenRefresh): Promise<void> {
  const store = await getStore();
  await store.set(HIDDEN_REFRESH_KEY, value);
  await store.save();
}

const MINIMIZE_TRAY_KEY = "minimizeToTray";

/** Hide to the tray on close instead of quitting. Defaults to on (current behavior). */
export async function loadMinimizeToTray(): Promise<boolean> {
  try {
    const store = await getStore();
    return (await store.get<boolean>(MINIMIZE_TRAY_KEY)) ?? true;
  } catch {
    return true;
  }
}

export async function saveMinimizeToTray(on: boolean): Promise<void> {
  const store = await getStore();
  await store.set(MINIMIZE_TRAY_KEY, on);
  await store.save();
}

/** Which chrome regions are visible. */
export interface ViewOptions {
  toolbar: boolean;
  filterPane: boolean;
  details: boolean;
  statusBar: boolean;
  bigToolbar: boolean;
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  toolbar: true,
  filterPane: true,
  details: true,
  statusBar: true,
  bigToolbar: false,
};

const VIEW_OPTIONS_KEY = "viewOptions";

export async function loadViewOptions(): Promise<ViewOptions> {
  try {
    const store = await getStore();
    const value = await store.get<Partial<ViewOptions>>(VIEW_OPTIONS_KEY);
    if (value && typeof value === "object") return { ...DEFAULT_VIEW_OPTIONS, ...value };
  } catch {
    // fall through to defaults
  }
  return DEFAULT_VIEW_OPTIONS;
}

export async function saveViewOptions(value: ViewOptions): Promise<void> {
  const store = await getStore();
  await store.set(VIEW_OPTIONS_KEY, value);
  await store.save();
}

const CLIPBOARD_AUTO_KEY = "clipboardAutoAdd";

/**
 * Watch the system clipboard for magnet / .torrent links and pre-fill the Add
 * dialog. Off by default: reading the clipboard is a privacy-relevant action,
 * so it only happens when the user turns it on.
 */
export async function loadClipboardAutoAdd(): Promise<boolean> {
  try {
    const store = await getStore();
    return (await store.get<boolean>(CLIPBOARD_AUTO_KEY)) ?? false;
  } catch {
    return false;
  }
}

export async function saveClipboardAutoAdd(on: boolean): Promise<void> {
  const store = await getStore();
  await store.set(CLIPBOARD_AUTO_KEY, on);
  await store.save();
}

const SMOOTH_SPEEDS_KEY = "smoothSpeeds";

/**
 * Show a moving average of each torrent's transfer rate in the list, to smooth
 * out the poll-to-poll jumps. Off by default: the raw daemon numbers are more
 * immediate, and the average lags a genuine change by a few samples.
 */
export async function loadSmoothSpeeds(): Promise<boolean> {
  try {
    const store = await getStore();
    return (await store.get<boolean>(SMOOTH_SPEEDS_KEY)) ?? false;
  } catch {
    return false;
  }
}

export async function saveSmoothSpeeds(on: boolean): Promise<void> {
  const store = await getStore();
  await store.set(SMOOTH_SPEEDS_KEY, on);
  await store.save();
}

const TRAY_ALWAYS_KEY = "trayAlwaysVisible";

/**
 * Keep the tray icon visible even while the main window is shown. On by default
 * (the previous always-visible behavior); turning it off hides the icon while
 * the window is up and restores it once the window is hidden.
 */
export async function loadTrayAlwaysVisible(): Promise<boolean> {
  try {
    const store = await getStore();
    return (await store.get<boolean>(TRAY_ALWAYS_KEY)) ?? true;
  } catch {
    return true;
  }
}

export async function saveTrayAlwaysVisible(on: boolean): Promise<void> {
  const store = await getStore();
  await store.set(TRAY_ALWAYS_KEY, on);
  await store.save();
}

const AUTO_RECONNECT_KEY = "autoReconnect";

/**
 * Keep trying to re-establish a dropped connection.
 *
 * On by default: a daemon restart should heal on its own rather than leaving a
 * dead window until someone notices and clicks Connect.
 */
export async function loadAutoReconnect(): Promise<boolean> {
  try {
    const store = await getStore();
    return (await store.get<boolean>(AUTO_RECONNECT_KEY)) ?? true;
  } catch {
    return true;
  }
}

export async function saveAutoReconnect(on: boolean): Promise<void> {
  const store = await getStore();
  await store.set(AUTO_RECONNECT_KEY, on);
  await store.save();
}

const DIR_HISTORY_KEY = "dirHistory";

/** Recently used download directories, newest first. */
export async function loadDirHistory(): Promise<string[]> {
  try {
    const store = await getStore();
    return (await store.get<string[]>(DIR_HISTORY_KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function saveDirHistory(list: string[]): Promise<void> {
  const store = await getStore();
  await store.set(DIR_HISTORY_KEY, list);
  await store.save();
}

const REFRESH_SECONDS_KEY = "refreshSeconds";

/** How often to poll the daemon while the window is visible, in seconds. */
export async function loadRefreshSeconds(): Promise<number> {
  try {
    const store = await getStore();
    return (await store.get<number>(REFRESH_SECONDS_KEY)) ?? 2;
  } catch {
    return 2;
  }
}

export async function saveRefreshSeconds(seconds: number): Promise<void> {
  const store = await getStore();
  await store.set(REFRESH_SECONDS_KEY, seconds);
  await store.save();
}

const DELETE_TORRENT_FILE_KEY = "deleteTorrentFileAfterAdd";

/**
 * Delete the local `.torrent` file once the daemon has accepted it.
 *
 * This is the client's own option, not the daemon's `trash-original-torrent-files`:
 * the daemon never sees the file, because what goes to it is the metainfo. Off by
 * default, as the original has it.
 */
export async function loadDeleteTorrentFile(): Promise<boolean> {
  try {
    const store = await getStore();
    return (await store.get<boolean>(DELETE_TORRENT_FILE_KEY)) ?? false;
  } catch {
    return false;
  }
}

export async function saveDeleteTorrentFile(on: boolean): Promise<void> {
  const store = await getStore();
  await store.set(DELETE_TORRENT_FILE_KEY, on);
  await store.save();
}

const UPDATE_CHECK_DAYS_KEY = "updateCheckDays";
const UPDATE_CHECK_LAST_KEY = "updateCheckLast";

/** How often to check for a new version. 0 turns the check off. */
export async function loadUpdateCheck(): Promise<{ days: number; last: string }> {
  try {
    const store = await getStore();
    return {
      days: (await store.get<number>(UPDATE_CHECK_DAYS_KEY)) ?? 0,
      last: (await store.get<string>(UPDATE_CHECK_LAST_KEY)) ?? "",
    };
  } catch {
    return { days: 0, last: "" };
  }
}

export async function saveUpdateCheck(days: number, last: string): Promise<void> {
  const store = await getStore();
  await store.set(UPDATE_CHECK_DAYS_KEY, days);
  await store.set(UPDATE_CHECK_LAST_KEY, last);
  await store.save();
}

/**
 * The watched folder: a place to drop `.torrent` files that get added for you.
 *
 * The original keeps this in its INI alone, so it is only reachable by editing a
 * file by hand; the meaning is kept and the way in is not.
 */
export interface WatchSettings {
  /** Empty turns the watch off, which is the original's default too. */
  folder: string;
  /** Minutes between scans. The original defaults to one. */
  intervalMinutes: number;
  /** Download directory for what is found; empty keeps the dialog's own default. */
  destination: string;
}

/** Whether every date the app prints is shown as how long ago it was. */
const FROM_NOW_KEY = "fromNow";

/** How many recent download directories the Add dialog offers. */
const HISTORY_LIMIT_KEY = "folderHistoryLimit";

export async function loadHistoryLimit(): Promise<number> {
  try {
    const store = await getStore();
    return clampHistoryLimit((await store.get<number>(HISTORY_LIMIT_KEY)) ?? DIR_HISTORY_MAX);
  } catch {
    return DIR_HISTORY_MAX;
  }
}

export async function saveHistoryLimit(limit: number): Promise<void> {
  const store = await getStore();
  await store.set(HISTORY_LIMIT_KEY, clampHistoryLimit(limit));
  await store.save();
}

/**
 * How long the daemon may take to answer, and to be reached.
 *
 * Both are this app's own [NetWork] settings in the original and belong to no
 * particular server, so they are not part of a saved connection.
 */
export interface NetTimeouts {
  httpTimeout: number;
  connectTimeout: number;
}

const HTTP_TIMEOUT_KEY = "httpTimeout";
const CONNECT_TIMEOUT_KEY = "connectTimeout";

export async function loadNetTimeouts(): Promise<NetTimeouts> {
  try {
    const store = await getStore();
    return {
      httpTimeout: clampHttpTimeout((await store.get<number>(HTTP_TIMEOUT_KEY)) ?? HTTP_TIMEOUT_DEFAULT),
      connectTimeout: clampConnectTimeout(
        (await store.get<number>(CONNECT_TIMEOUT_KEY)) ?? CONNECT_TIMEOUT_DEFAULT,
      ),
    };
  } catch {
    return { httpTimeout: HTTP_TIMEOUT_DEFAULT, connectTimeout: CONNECT_TIMEOUT_DEFAULT };
  }
}

export async function saveNetTimeouts(net: NetTimeouts): Promise<void> {
  const store = await getStore();
  await store.set(HTTP_TIMEOUT_KEY, clampHttpTimeout(net.httpTimeout));
  await store.set(CONNECT_TIMEOUT_KEY, clampConnectTimeout(net.connectTimeout));
  await store.save();
}

/** The add dialog's size, remembered between runs as the original does. */
export interface AddDialogSize {
  width: number;
  height: number;
}

const ADD_WIDTH_KEY = "addDialogWidth";
const ADD_HEIGHT_KEY = "addDialogHeight";

export async function loadAddDialogSize(): Promise<Partial<AddDialogSize>> {
  try {
    const store = await getStore();
    const width = await store.get<number>(ADD_WIDTH_KEY);
    const height = await store.get<number>(ADD_HEIGHT_KEY);
    return { ...(width ? { width } : {}), ...(height ? { height } : {}) };
  } catch {
    return {};
  }
}

export async function saveAddDialogSize(size: AddDialogSize): Promise<void> {
  const store = await getStore();
  await store.set(ADD_WIDTH_KEY, Math.round(size.width));
  await store.set(ADD_HEIGHT_KEY, Math.round(size.height));
  await store.save();
}

export async function loadFromNow(): Promise<boolean> {
  try {
    const store = await getStore();
    return (await store.get<boolean>(FROM_NOW_KEY)) ?? false;
  } catch {
    return false;
  }
}

export async function saveFromNow(on: boolean): Promise<void> {
  const store = await getStore();
  await store.set(FROM_NOW_KEY, on);
  await store.save();
}

const WATCH_FOLDER_KEY = "watchFolder";
const WATCH_INTERVAL_KEY = "watchIntervalMinutes";
const WATCH_DESTINATION_KEY = "watchDestination";

export const DEFAULT_WATCH: WatchSettings = { folder: "", intervalMinutes: 1, destination: "" };

export async function loadWatchSettings(): Promise<WatchSettings> {
  try {
    const store = await getStore();
    return {
      folder: (await store.get<string>(WATCH_FOLDER_KEY)) ?? "",
      intervalMinutes: (await store.get<number>(WATCH_INTERVAL_KEY)) ?? 1,
      destination: (await store.get<string>(WATCH_DESTINATION_KEY)) ?? "",
    };
  } catch {
    return { ...DEFAULT_WATCH };
  }
}

/**
 * Where the two pane dividers were left.
 *
 * Clamped on the way in and on the way out: a size saved on a large screen must
 * not come back on a small one as a pane that has swallowed the window.
 */
export interface PaneSizes {
  filterWidth: number;
  detailsHeight: number;
}

const FILTER_WIDTH_KEY = "filterWidth";
const DETAILS_HEIGHT_KEY = "detailsHeight";

export async function loadPaneSizes(): Promise<PaneSizes> {
  try {
    const store = await getStore();
    return {
      filterWidth: clampPane((await store.get<number>(FILTER_WIDTH_KEY)) ?? DEFAULT_FILTER_WIDTH, FILTER_PANE),
      detailsHeight: clampPane(
        (await store.get<number>(DETAILS_HEIGHT_KEY)) ?? DEFAULT_DETAILS_HEIGHT,
        DETAILS_PANE,
      ),
    };
  } catch {
    return { filterWidth: DEFAULT_FILTER_WIDTH, detailsHeight: DEFAULT_DETAILS_HEIGHT };
  }
}

export async function savePaneSizes(sizes: PaneSizes): Promise<void> {
  const store = await getStore();
  await store.set(FILTER_WIDTH_KEY, clampPane(sizes.filterWidth, FILTER_PANE));
  await store.set(DETAILS_HEIGHT_KEY, clampPane(sizes.detailsHeight, DETAILS_PANE));
  await store.save();
}

export async function saveWatchSettings(watch: WatchSettings): Promise<void> {
  const store = await getStore();
  await store.set(WATCH_FOLDER_KEY, watch.folder);
  await store.set(WATCH_INTERVAL_KEY, watch.intervalMinutes);
  await store.set(WATCH_DESTINATION_KEY, watch.destination);
  await store.save();
}
