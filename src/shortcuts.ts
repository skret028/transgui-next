// Keyboard shortcuts, as a pure mapping from a key event to an intent.
//
// The table follows the original's bindings. Keeping it free of the DOM means
// the parts that are easy to get wrong - which keys are swallowed while a text
// field has focus, and which need a selection - are testable without a browser.

export type Shortcut =
  /** Cmd/Ctrl+A over the visible list. */
  | { kind: "select-all" }
  /** Open the settings dialog. */
  | { kind: "settings" }
  /** Toggle the large toolbar. */
  | { kind: "big-toolbar" }
  /** Remove the selection, optionally destroying the data with it. */
  | { kind: "remove"; withData: boolean }
  /** An RPC action on the selection: start, stop, reannounce, queue moves, the
   *  "all torrents" pair, force start. */
  | { kind: "action"; value: string }
  /** Bandwidth priority of the selection. */
  | { kind: "priority"; value: number }
  /** Toggle the alternative speed limits. */
  | { kind: "alt-speed" }
  /** Open the Add torrent dialog. */
  | { kind: "add-torrent" }
  /** Open the properties dialog for the selection. */
  | { kind: "properties" }
  /** Open the labels editor for the selection. */
  | { kind: "labels" }
  /** Show the selection's download folder in the file manager. */
  | { kind: "reveal" }
  /** Mark every file of the selection as "don't download". */
  | { kind: "set-not-download" }
  /** Rename the selected torrent, as F2 does. */
  | { kind: "rename" }
  /** Move the selection's data to another location, as F6 does. */
  | { kind: "move-data" };

export interface KeyLike {
  key: string;
  /** The physical key, when the event carries it. Shift+1 reports key "!", so
   *  a binding on a digit has to look at this rather than at the character. */
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface ShortcutContext {
  /** The event came from a text field or other editable element. */
  typing: boolean;
  connected: boolean;
  /** The filtered list is non-empty. */
  hasVisible: boolean;
  /** At least one torrent is selected. */
  hasSelection: boolean;
}

/**
 * The intent for a key event, or null for "leave it alone".
 *
 * Two shortcuts are deliberately handled even while typing, because they are
 * window-level rather than list-level: the settings shortcut and the toolbar
 * one. Everything else is a list action, and a bare key in a text field belongs
 * to the field - Delete in the filter box means "delete a character".
 */
export function resolveShortcut(e: KeyLike, ctx: ShortcutContext): Shortcut | null {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key;
  // Shift+1 is "!" in `key`; bindings on a digit check the physical key. Tests
  // pass it explicitly; real events carry it.
  const digit = e.code?.startsWith("Digit") ? e.code.slice(5) : key;

  if (key === "F9") return { kind: "settings" };
  if (mod && key === "F12") return { kind: "big-toolbar" };

  // The "all torrents" pair is window-level like the two above - it needs no
  // selection - and the original binds it to Ctrl+F3 / Ctrl+F4. Only Ctrl is
  // claimed: macOS reserves Cmd+F3 and Cmd+F4.
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    if (key === "F3") return { kind: "action", value: "start_all" };
    if (key === "F4") return { kind: "action", value: "stop_all" };
  }

  if (ctx.typing) return null;

  // Select all: outside a text field only, so the browser's own select-all
  // keeps working inside the filter box and dialog inputs.
  if (mod && !e.shiftKey && !e.altKey && key.toLowerCase() === "a") {
    if (!ctx.connected || !ctx.hasVisible) return null;
    return { kind: "select-all" };
  }

  if (!ctx.connected) return null;

  // Delete removes; Delete with Alt (Cmd on macOS) or Shift also destroys the
  // data. It is the one irreversible shortcut, so it is not the unmodified one.
  if (key === "Delete") {
    if (!ctx.hasSelection) return null;
    return { kind: "remove", withData: e.altKey || e.metaKey || e.shiftKey };
  }

  // The rest all act on the selection.
  if (!ctx.hasSelection) return null;

  // Cmd+Enter is the original's Properties binding: its action carries scMeta -
  // the Command key - not Alt. Ctrl+Enter is the reveal, which is what the
  // original binds to "Open containing folder". The two are told apart by which
  // modifier is held, so neither key can be mistaken for the other.
  if (!e.altKey && !e.shiftKey && key === "Enter") {
    if (e.metaKey && !e.ctrlKey) return { kind: "properties" };
    if (e.ctrlKey && !e.metaKey) return { kind: "reveal" };
  }

  // Ctrl+1 / Ctrl+2 move within the queue and Ctrl+Shift+1 / Ctrl+Shift+2 take
  // it to the ends: the four keys the original's queue actions carry. Only Ctrl
  // is claimed, so Cmd+1 / Cmd+2 stay with the system.
  if (e.ctrlKey && !e.metaKey && !e.altKey && (digit === "1" || digit === "2")) {
    const up = digit === "1";
    const far = e.shiftKey;
    const value = up ? (far ? "queue_top" : "queue_up") : far ? "queue_bottom" : "queue_down";
    return { kind: "action", value };
  }

  // PgUp/PgDn do the same thing as an extra. They are not the original's keys,
  // but they are the ones a list this long invites, and they take nothing away.
  if (mod && !e.altKey && (key === "PageUp" || key === "PageDown")) {
    const up = key === "PageUp";
    const far = e.shiftKey;
    const value = up ? (far ? "queue_top" : "queue_up") : far ? "queue_bottom" : "queue_down";
    return { kind: "action", value };
  }

  // Function keys with no modifier, plus Shift+F3: the original's force start
  // (start now, ignoring the queue). The Ctrl+F3/F4 "all torrents" pair is
  // claimed further up; Cmd+F3/F4 are left alone.
  if (!mod && !e.altKey) {
    switch (key) {
      case "F2":
        return { kind: "rename" };
      case "F3":
        return { kind: "action", value: e.shiftKey ? "start_now" : "start" };
      case "F4":
        return { kind: "action", value: "stop" };
      case "F6":
        return { kind: "move-data" };
      case "F7":
        return { kind: "labels" };
      case "F8":
        return { kind: "alt-speed" };
      case "Insert":
        return { kind: "add-torrent" };
    }
  }

  if (mod && !e.shiftKey && !e.altKey) {
    switch (key.toLowerCase()) {
      case "h":
        return { kind: "priority", value: 1 };
      case "n":
        return { kind: "priority", value: 0 };
      case "l":
        return { kind: "priority", value: -1 };
      case "r":
        return { kind: "action", value: "reannounce" };
      case "i":
        // The original's Ctrl+I: the keyboard form of the files tab's "Don't
        // download", applied to every file of the selection.
        return { kind: "set-not-download" };
    }
  }

  return null;
}
