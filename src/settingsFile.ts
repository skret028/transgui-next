/**
 * Export/import of the client-side settings.
 *
 * Only what this app owns: the connection form, saved servers, locale, visible
 * columns, the completion-notice preference and the path mapping. Passwords are
 * deliberately never written — an exported file is something you mail to
 * yourself or commit next to your dotfiles, and a connection password has no
 * business travelling with it.
 */
import { normalizeColumns, type ColumnId } from "./columns";
import { normalizePathMap, type PathMapping } from "./paths";
import type { ConnForm } from "./types";

/** Bumped when the on-disk shape changes in a way importers must know about. */
export const SETTINGS_FILE_VERSION = 1;
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
}

export interface SettingsFile extends SafeSettings {
  app: string;
  version: number;
  exportedAt: string;
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
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
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
  };
}

export type ImportResult =
  | { ok: true; settings: Partial<SafeSettings>; warnings: string[] }
  | { ok: false; error: string };

/**
 * Parse a settings file. Unknown keys are ignored, so a file written by a newer
 * build still imports the parts this one understands. Missing keys are left out
 * of the result rather than defaulted, so an import merges instead of wiping.
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
  const obj = data as Record<string, unknown>;
  if (obj.app !== SETTINGS_FILE_APP) {
    return { ok: false, error: "That is not a transgui-next settings file" };
  }
  const version = typeof obj.version === "number" ? obj.version : NaN;
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

  if (obj.form && typeof obj.form === "object") {
    settings.form = stripForm(obj.form as ConnForm, {
      host: "",
      port: "",
      path: "",
      username: "",
      https: false,
      acceptInvalid: false,
    });
  }
  if (Array.isArray(obj.servers)) {
    settings.servers = (obj.servers as unknown[])
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
        }),
      }));
  }
  if (typeof obj.locale === "string" && obj.locale) settings.locale = obj.locale;
  if (Array.isArray(obj.columns)) {
    settings.columns = normalizeColumns(obj.columns);
  }
  if (typeof obj.notifyOnComplete === "boolean") {
    settings.notifyOnComplete = obj.notifyOnComplete;
  }
  if (Array.isArray(obj.pathMap)) {
    settings.pathMap = normalizePathMap(obj.pathMap);
  }

  // A file that carries a password was probably hand-edited; say so rather than
  // silently dropping it, because the user may expect it to be applied.
  const raw = JSON.stringify(obj);
  if (/"password"\s*:/.test(raw)) {
    warnings.push("Passwords in the file were ignored");
  }
  if (Object.keys(settings).length === 0) {
    warnings.push("No settings found in that file");
  }
  return { ok: true, settings, warnings };
}
