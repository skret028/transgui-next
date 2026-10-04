// Connection settings persistence via tauri-plugin-store.
import { load, type Store } from "@tauri-apps/plugin-store";
import type { ConnForm, ServerBookmark } from "./types";

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
