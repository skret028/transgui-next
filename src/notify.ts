// Desktop notifications.
//
// The plugin is only pulled in when the app is running inside Tauri, so the
// module degrades to a no-op under a plain browser dev server instead of
// throwing on import.
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

/** Ask once, then remember the answer for the session. */
let granted: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (granted !== null) return granted;
  try {
    granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
  } catch {
    granted = false;
  }
  return granted;
}

/**
 * Post a completion notification. Returns false when notifications are
 * unavailable, so callers can decide whether to fall back to something else.
 */
export async function notify(title: string, body: string): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  try {
    sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}
