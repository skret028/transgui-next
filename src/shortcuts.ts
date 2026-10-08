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
  /** An RPC action on the selection: start, stop, reannounce. */
  | { kind: "action"; value: string }
  /** Bandwidth priority of the selection. */
  | { kind: "priority"; value: number }
  /** Toggle the alternative speed limits. */
  | { kind: "alt-speed" }
  /** Open the Add torrent dialog. */
  | { kind: "add-torrent" };

export interface KeyLike {
  key: string;
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

  if (key === "F9") return { kind: "settings" };
  if (mod && key === "F12") return { kind: "big-toolbar" };

  if (ctx.typing) return null;

  // Select all: outside a text field only, so the browser's own select-all
  // keeps working inside the filter box and dialog inputs.
  if (mod && !e.shiftKey && !e.altKey && key.toLowerCase() === "a") {
    if (!ctx.connected || !ctx.hasVisible) return null;
    return { kind: "select-all" };
  }

  if (!ctx.connected) return null;

  // Delete removes; Delete with Alt (Cmd on macOS) also destroys the data. It
  // is the one irreversible shortcut, so it is not the unmodified one.
  if (key === "Delete") {
    if (!ctx.hasSelection) return null;
    return { kind: "remove", withData: e.altKey || e.metaKey };
  }

  // The rest all act on the selection.
  if (!ctx.hasSelection) return null;

  // Bare function keys: a modifier makes them something else (Ctrl+F9 is
  // handled above; Cmd+F4 is not ours to claim).
  if (!mod && !e.altKey) {
    switch (key) {
      case "F3":
        return { kind: "action", value: "start" };
      case "F4":
        return { kind: "action", value: "stop" };
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
    }
  }

  return null;
}
