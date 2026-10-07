// Copy text to the clipboard.
//
// The Tauri clipboard plugin comes first. In a WKWebView the browser's own
// `navigator.clipboard.writeText` can be refused for a call that did not start
// from a real user gesture, and — worse — the promise it returns can simply
// never settle, so a caller awaiting it shows neither a confirmation nor an
// error and the copy silently does nothing. The plugin goes through the host
// process and always resolves.
import { writeText as writeTextNative } from "@tauri-apps/plugin-clipboard-manager";

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await writeTextNative(text);
    return true;
  } catch {
    // fall through to the browser APIs (e.g. when running outside Tauri)
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
