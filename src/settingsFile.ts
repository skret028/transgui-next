/**
 * Export/import of the client-side settings.
 *
 * Only what this app owns: the connection form, saved servers, locale, visible
 * columns, the completion-notice preference, the path mapping and every other
 * local preference (font size, status-bar fields, hidden-window refresh,
 * close-to-tray, view options, clipboard watching, smoothed speeds, the
 * always-visible tray icon). Passwords are deliberately
 * never written — an exported file is something you mail to yourself or commit
 * next to your dotfiles, and a connection password has no business travelling
 * with it.
 *
 * The default values below mirror src/settings.ts on purpose: this module must
 * stay loadable under plain Node (scripts/verify-settings-file.ts imports it
 * directly), and src/settings.ts pulls in tauri-plugin-store at load time.
 */
import { normalizeColumns, type ColumnId } from "./columns";
import { normalizePathMap, type PathMapping } from "./paths";
import type { ConnForm } from "./types";
import type {
  HiddenRefresh,
  StatusBarFields,
  UiFontSize,
  ViewOptions,
} from "./settings";

/** Bumped when the on-disk shape changes in a way importers must know about. */
export const SETTINGS_FILE_VERSION = 2;
export const SETTINGS_FILE_APP = "transgui-next";

/** The connection details we are willing to write out. */
export type SafeForm = Omit<ConnForm, "password">;

export interface SafeServer {
  id: string;
  name: string;
  form: SafeForm;
}

/** Everything the app stores locally, minus secrets. */
export interface SafeSettings {
  form: SafeForm;
  servers: SafeServer[];
  locale?: string;
  columns: ColumnId[];
  notifyOnComplete: boolean;
  pathMap: PathMapping[];
  uiFontSize: UiFontSize;
  statusBarFields: StatusBarFields;
  hiddenRefresh: HiddenRefresh;
  minimizeToTray: boolean;
  viewOptions: ViewOptions;
  clipboardAutoAdd: boolean;
  smoothSpeeds: boolean;
  trayAlwaysVisible: boolean;
}

export interface SettingsFile extends SafeSettings {
  app: string;
  version: number;
  exportedAt: string;
}

// --- defaults / validation --------------------------------------------------
// These match the defaults in src/settings.ts. Exported so the importer can
// say what a missing value falls back to.

export const DEFAULT_UI_FONT_SIZE: UiFontSize = "medium";
export const DEFAULT_STATUS_BAR_FIELDS: StatusBarFields = {
  total: true,
  shown: true,
  selected: true,
  updated: true,
  hint: true,
  doubleClick: true,
};
export const DEFAULT_HIDDEN_REFRESH: HiddenRefresh = { enabled: false, seconds: 10 };
export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  toolbar: true,
  filterPane: true,
  details: true,
  statusBar: true,
  bigToolbar: false,
};
export const DEFAULT_SMOOTH_SPEEDS = false;
export const DEFAULT_TRAY_ALWAYS_VISIBLE = true;

const FONT_SIZES = ["small", "medium", "large"];

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A plain object, or an empty one for arrays/nulls/primitives. */
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Only the three known sizes survive; anything else falls back to medium. */
function sanitizeFont(value: unknown): UiFontSize {
  return typeof value === "string" && FONT_SIZES.includes(value)
    ? (value as UiFontSize)
    : DEFAULT_UI_FONT_SIZE;
}

function sanitizeStatusBarFields(value: unknown): StatusBarFields {
  const v = obj(value);
  const d = DEFAULT_STATUS_BAR_FIELDS;
  return {
    total: bool(v.total, d.total),
    shown: bool(v.shown, d.shown),
    selected: bool(v.selected, d.selected),
    updated: bool(v.updated, d.updated),
    hint: bool(v.hint, d.hint),
    doubleClick: bool(v.doubleClick, d.doubleClick),
  };
}

/** `seconds` must be a positive number; dirty values fall back to the default. */
function sanitizeHiddenRefresh(value: unknown): HiddenRefresh {
  const v = obj(value);
  const n = Number(v.seconds);
  const valid = Number.isFinite(n) && n >= 1;
  return {
    enabled: bool(v.enabled, DEFAULT_HIDDEN_REFRESH.enabled),
    seconds: valid ? Math.floor(n) : DEFAULT_HIDDEN_REFRESH.seconds,
  };
}

function sanitizeViewOptions(value: unknown): ViewOptions {
  const v = obj(value);
  const d = DEFAULT_VIEW_OPTIONS;
  return {
    toolbar: bool(v.toolbar, d.toolbar),
    filterPane: bool(v.filterPane, d.filterPane),
    details: bool(v.details, d.details),
    statusBar: bool(v.statusBar, d.statusBar),
    bigToolbar: bool(v.bigToolbar, d.bigToolbar),
  };
}

function stripForm(form: Partial<ConnForm> | undefined, fallback: Partial<ConnForm>): SafeForm {
  const f: Partial<ConnForm> = form ?? fallback;
  return {
    host: str(f.host),
    port: str(f.port),
    path: str(f.path),
    username: str(f.username),
    https: !!f.https,
    acceptInvalid: !!f.acceptInvalid,
    clientCert: String(f.clientCert ?? ""),
    clientKey: String(f.clientKey ?? ""),
  };
}

export function buildSettingsFile(
  settings: SafeSettings,
  now: Date = new Date(),
): SettingsFile {
  const fallback = settings.form;
  return {
    app: SETTINGS_FILE_APP,
    version: SETTINGS_FILE_VERSION,
    exportedAt: now.toISOString(),
    form: stripForm(settings.form, fallback),
    servers: (settings.servers ?? []).map((s) => ({
      id: str(s.id),
      name: str(s.name),
      form: stripForm(s.form, fallback),
    })),
    ...(settings.locale ? { locale: settings.locale } : {}),
    columns: [...(settings.columns ?? [])],
    notifyOnComplete: !!settings.notifyOnComplete,
    pathMap: (settings.pathMap ?? []).map((m) => ({ remote: m.remote, local: m.local })),
    uiFontSize: sanitizeFont(settings.uiFontSize),
    statusBarFields: sanitizeStatusBarFields(settings.statusBarFields),
    hiddenRefresh: sanitizeHiddenRefresh(settings.hiddenRefresh),
    minimizeToTray: !!settings.minimizeToTray,
    viewOptions: sanitizeViewOptions(settings.viewOptions),
    clipboardAutoAdd: !!settings.clipboardAutoAdd,
    smoothSpeeds: !!settings.smoothSpeeds,
    trayAlwaysVisible: settings.trayAlwaysVisible ?? DEFAULT_TRAY_ALWAYS_VISIBLE,
  };
}

export type ImportResult =
  | { ok: true; settings: Partial<SafeSettings>; warnings: string[] }
  | { ok: false; error: string };

/**
 * Parse a settings file. Unknown keys are ignored, so a file written by a newer
 * build still imports the parts this one understands. The older keys (form,
 * servers, locale, columns, notifyOnComplete, pathMap) are left out of the
 * result when absent so an import merges instead of wiping; the newer local
 * preferences always come back, defaulted when the file predates them.
 */
export function parseSettingsFile(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "That file does not contain settings" };
  }
  const objData = data as Record<string, unknown>;
  if (objData.app !== SETTINGS_FILE_APP) {
    return { ok: false, error: "That is not a transgui-next settings file" };
  }
  const version = typeof objData.version === "number" ? objData.version : NaN;
  if (!Number.isFinite(version)) {
    return { ok: false, error: "That settings file has no version" };
  }
  if (version > SETTINGS_FILE_VERSION) {
    return {
      ok: false,
      error: "That settings file was written by a newer version of transgui-next",
    };
  }

  const warnings: string[] = [];
  const settings: Partial<SafeSettings> = {};

  if (objData.form && typeof objData.form === "object") {
    settings.form = stripForm(objData.form as ConnForm, {
      host: "",
      port: "",
      path: "",
      username: "",
      https: false,
      acceptInvalid: false,
      clientCert: "",
      clientKey: "",
    });
  }
  if (Array.isArray(objData.servers)) {
    settings.servers = (objData.servers as unknown[])
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => ({
        id: str(s.id),
        name: str(s.name),
        form: stripForm(s.form as ConnForm, settings.form ?? {
          host: "",
          port: "",
          path: "",
          username: "",
          https: false,
          acceptInvalid: false,
          clientCert: "",
          clientKey: "",
        }),
      }));
  }
  if (typeof objData.locale === "string" && objData.locale) settings.locale = objData.locale;
  if (Array.isArray(objData.columns)) {
    settings.columns = normalizeColumns(objData.columns);
  }
  if (typeof objData.notifyOnComplete === "boolean") {
    settings.notifyOnComplete = objData.notifyOnComplete;
  }
  if (Array.isArray(objData.pathMap)) {
    settings.pathMap = normalizePathMap(objData.pathMap);
  }

  // Newer local preferences: always returned, dirty values coerced to defaults.
  settings.uiFontSize = sanitizeFont(objData.uiFontSize);
  settings.statusBarFields = sanitizeStatusBarFields(objData.statusBarFields);
  settings.hiddenRefresh = sanitizeHiddenRefresh(objData.hiddenRefresh);
  settings.minimizeToTray = bool(objData.minimizeToTray, true);
  settings.viewOptions = sanitizeViewOptions(objData.viewOptions);
  settings.clipboardAutoAdd = bool(objData.clipboardAutoAdd, false);
  settings.smoothSpeeds = bool(objData.smoothSpeeds, DEFAULT_SMOOTH_SPEEDS);
  settings.trayAlwaysVisible = bool(objData.trayAlwaysVisible, DEFAULT_TRAY_ALWAYS_VISIBLE);

  // A file that carries a password was probably hand-edited; say so rather than
  // silently dropping it, because the user may expect it to be applied.
  const raw = JSON.stringify(objData);
  if (/\"password\"\s*:/.test(raw)) {
    warnings.push("Passwords in the file were ignored");
  }
  if (Object.keys(settings).length === 0) {
    warnings.push("No settings found in that file");
  }
  return { ok: true, settings, warnings };
}
