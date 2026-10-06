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
