// Connection settings persistence via tauri-plugin-store.
import { load, type Store } from "@tauri-apps/plugin-store";
import type { ConnForm, ServerBookmark } from "./types";
import { normalizePathMap, type PathMapping } from "./paths";

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
}

export const DEFAULT_STATUS_FIELDS: StatusBarFields = {
  total: true,
  shown: true,
  selected: true,
  updated: true,
  hint: true,
  doubleClick: true,
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
