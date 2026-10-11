// Run with: node --experimental-strip-types scripts/shortcuts.test.ts
import { resolveShortcut, type KeyLike, type ShortcutContext } from "../src/shortcuts.ts";

let passed = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed++;
  } else {
    failures.push(`${what}: expected ${b}, got ${a}`);
  }
}

function key(k: string, mods: Partial<KeyLike> = {}): KeyLike {
  return { key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods };
}

/** A physical digit press, the way a browser reports it: Shift+1 is key "!". */
function digitPress(n: number, mods: Partial<KeyLike> = {}): KeyLike {
  const shifted = !!mods.shiftKey;
  return key(shifted ? "!@"[n - 1] : String(n), { code: `Digit${n}`, ...mods });
}

const list: ShortcutContext = {
  typing: false,
  connected: true,
  hasVisible: true,
  hasSelection: true,
};
const ctx = (over: Partial<ShortcutContext> = {}): ShortcutContext => ({ ...list, ...over });

// The original's bindings, key by key.
eq(resolveShortcut(key("F3"), list), { kind: "action", value: "start" }, "F3 starts");
eq(resolveShortcut(key("F4"), list), { kind: "action", value: "stop" }, "F4 stops");
eq(resolveShortcut(key("F8"), list), { kind: "alt-speed" }, "F8 toggles alt speeds");
eq(resolveShortcut(key("Insert"), list), { kind: "add-torrent" }, "Insert adds a torrent");
eq(resolveShortcut(key("Delete"), list), { kind: "remove", withData: false }, "Delete removes");
eq(
  resolveShortcut(key("Delete", { altKey: true }), list),
  { kind: "remove", withData: true },
  "Alt+Delete removes with data",
);
eq(
  resolveShortcut(key("Delete", { metaKey: true }), list),
  { kind: "remove", withData: true },
  "Cmd+Delete removes with data (macOS)",
);
eq(resolveShortcut(key("F9"), list), { kind: "settings" }, "F9 opens settings");
eq(resolveShortcut(key("F9", { ctrlKey: true }), list), { kind: "settings" }, "Ctrl+F9 too");
eq(
  resolveShortcut(key("F12", { metaKey: true }), list),
  { kind: "big-toolbar" },
  "Cmd+F12 toggles the big toolbar",
);
eq(resolveShortcut(key("a", { ctrlKey: true }), list), { kind: "select-all" }, "Ctrl+A selects all");
eq(
  resolveShortcut(key("a", { metaKey: true }), list),
  { kind: "select-all" },
  "Cmd+A selects all",
);

// Priorities, on ctrl and cmd alike.
eq(resolveShortcut(key("h", { ctrlKey: true }), list), { kind: "priority", value: 1 }, "Ctrl+H high");
eq(
  resolveShortcut(key("n", { ctrlKey: true }), list),
  { kind: "priority", value: 0 },
  "Ctrl+N normal",
);
eq(
  resolveShortcut(key("l", { ctrlKey: true }), list),
  { kind: "priority", value: -1 },
  "Ctrl+L low",
);
eq(
  resolveShortcut(key("H", { metaKey: true }), list),
  { kind: "priority", value: 1 },
  "uppercase works too",
);
eq(
  resolveShortcut(key("r", { ctrlKey: true }), list),
  { kind: "action", value: "reannounce" },
  "Ctrl+R reannounces",
);

// Typing: a bare key belongs to the field, the two window-level ones do not.
eq(resolveShortcut(key("Delete"), ctx({ typing: true })), null, "Delete in a field is the field's");
eq(resolveShortcut(key("F3"), ctx({ typing: true })), null, "F3 in a field is not ours");
eq(resolveShortcut(key("a", { ctrlKey: true }), ctx({ typing: true })), null, "Ctrl+A in a field selects text");
eq(resolveShortcut(key("F9"), ctx({ typing: true })), { kind: "settings" }, "F9 works while typing");
eq(
  resolveShortcut(key("F12", { ctrlKey: true }), ctx({ typing: true })),
  { kind: "big-toolbar" },
  "Ctrl+F12 works while typing",
);

// Nothing selected: the list actions have nothing to act on.
eq(resolveShortcut(key("Delete"), ctx({ hasSelection: false })), null, "Delete needs a selection");
eq(resolveShortcut(key("F3"), ctx({ hasSelection: false })), null, "F3 needs a selection");
eq(resolveShortcut(key("h", { ctrlKey: true }), ctx({ hasSelection: false })), null, "priority needs a selection");
eq(resolveShortcut(key("F9"), ctx({ hasSelection: false })), { kind: "settings" }, "settings does not");
eq(resolveShortcut(key("Insert"), ctx({ hasSelection: false })), null, "Insert needs a selection");

// Disconnected.
eq(resolveShortcut(key("F3"), ctx({ connected: false })), null, "F3 needs a connection");
eq(resolveShortcut(key("a", { ctrlKey: true }), ctx({ connected: false })), null, "select-all needs a connection");
eq(
  resolveShortcut(key("a", { ctrlKey: true }), ctx({ hasVisible: false })),
  null,
  "select-all needs something visible",
);

// Modifiers that mean something else must not fire the plain binding.
// Ctrl+F3 / Ctrl+F4 are the "all torrents" pair now, asserted below; a bare F3
// stays a start of the selection.
eq(
  resolveShortcut(key("F1"), list),
  null,
  "an unbound function key does nothing",
);
eq(resolveShortcut(key("F8", { altKey: true }), list), null, "Alt+F8 is not F8");
eq(resolveShortcut(key("h", { ctrlKey: true, shiftKey: true }), list), null, "Ctrl+Shift+H is not ours");
eq(resolveShortcut(key("a", { ctrlKey: true, shiftKey: true }), list), null, "Ctrl+Shift+A is not select-all");
eq(resolveShortcut(key("a", { ctrlKey: true, altKey: true }), list), null, "Ctrl+Alt+A is not select-all");

// Keys we do not claim are left to the browser.
eq(resolveShortcut(key("F5"), list), null, "F5 is not a shortcut here");
eq(resolveShortcut(key("x"), list), null, "a bare letter is not a shortcut");
eq(resolveShortcut(key("Backspace"), list), null, "Backspace is not Delete");
eq(resolveShortcut(key("r", { ctrlKey: true, shiftKey: true }), list), null, "Ctrl+Shift+R is not reannounce");

// --- the added bindings, from the original's own table -----------------------
eq(
  resolveShortcut(key("F3", { shiftKey: true }), list),
  { kind: "action", value: "start_now" },
  "Shift+F3 is force start",
);
eq(resolveShortcut(key("F7"), list), { kind: "labels" }, "F7 opens the labels editor");
eq(
  resolveShortcut(key("F3", { ctrlKey: true }), list),
  { kind: "action", value: "start_all" },
  "Ctrl+F3 starts everything",
);
eq(
  resolveShortcut(key("F4", { ctrlKey: true }), list),
  { kind: "action", value: "stop_all" },
  "Ctrl+F4 stops everything",
);
eq(
  resolveShortcut(key("F3", { ctrlKey: true }), ctx({ hasSelection: false })),
  { kind: "action", value: "start_all" },
  "start-all needs no selection",
);
eq(
  resolveShortcut(key("F3", { ctrlKey: true }), ctx({ typing: true })),
  { kind: "action", value: "start_all" },
  "start-all works while a field has focus",
);
eq(
  resolveShortcut(key("F3", { metaKey: true }), list),
  null,
  "Cmd+F3 is not claimed - macOS reserves it",
);
eq(
  resolveShortcut(key("F4", { metaKey: true }), list),
  null,
  "Cmd+F4 is not claimed either",
);
eq(
  resolveShortcut(key("PageUp", { ctrlKey: true }), list),
  { kind: "action", value: "queue_up" },
  "Ctrl+PgUp moves up the queue",
);
eq(
  resolveShortcut(key("PageDown", { metaKey: true }), list),
  { kind: "action", value: "queue_down" },
  "Cmd+PgDn moves down the queue",
);
eq(
  resolveShortcut(key("PageUp", { ctrlKey: true, shiftKey: true }), list),
  { kind: "action", value: "queue_top" },
  "Ctrl+Shift+PgUp moves to the top",
);
eq(
  resolveShortcut(key("PageDown", { ctrlKey: true, shiftKey: true }), list),
  { kind: "action", value: "queue_bottom" },
  "Ctrl+Shift+PgDn moves to the bottom",
);
eq(
  resolveShortcut(key("PageUp", { ctrlKey: true }), ctx({ hasSelection: false })),
  null,
  "a queue move needs a selection",
);
// Properties is Cmd+Enter in the original - that action carries scMeta - and
// the reveal is Ctrl+Enter. Two separate keys, not two ways to reach one.
eq(
  resolveShortcut(key("Enter", { metaKey: true }), list),
  { kind: "properties" },
  "Cmd+Enter opens properties",
);
eq(
  resolveShortcut(key("Enter", { ctrlKey: true }), list),
  { kind: "reveal" },
  "Ctrl+Enter shows the download folder",
);
eq(resolveShortcut(key("Enter", { altKey: true }), list), null, "Alt+Enter is not a binding");
eq(
  resolveShortcut(key("Enter", { ctrlKey: true, shiftKey: true }), list),
  null,
  "Ctrl+Shift+Enter is not a binding",
);

// The queue moves the original binds: Ctrl+1 / Ctrl+2, and Ctrl+Shift+1 /
// Ctrl+Shift+2 for the ends of the queue. Cmd+1 / Cmd+2 stay with the system.
// These use the shape a browser really sends, where Shift+1 is key "!" - the
// first version of this binding matched on the character and silently did
// nothing for the two shifted ones.
eq(
  resolveShortcut(digitPress(1, { ctrlKey: true }), list),
  { kind: "action", value: "queue_up" },
  "Ctrl+1 moves up the queue",
);
eq(
  resolveShortcut(digitPress(2, { ctrlKey: true }), list),
  { kind: "action", value: "queue_down" },
  "Ctrl+2 moves down the queue",
);
eq(
  resolveShortcut(digitPress(1, { ctrlKey: true, shiftKey: true }), list),
  { kind: "action", value: "queue_top" },
  "Ctrl+Shift+1 moves to the top",
);
eq(
  resolveShortcut(digitPress(2, { ctrlKey: true, shiftKey: true }), list),
  { kind: "action", value: "queue_bottom" },
  "Ctrl+Shift+2 moves to the bottom",
);
eq(resolveShortcut(digitPress(1, { metaKey: true }), list), null, "Cmd+1 is left to the system");
eq(
  resolveShortcut(key("i", { ctrlKey: true }), list),
  { kind: "set-not-download" },
  "Ctrl+I marks the selection as don't download",
);
eq(
  resolveShortcut(key("Delete", { shiftKey: true }), list),
  { kind: "remove", withData: true },
  "Shift+Delete removes with data, as the original binds it",
);
eq(
  resolveShortcut(key("Enter", { metaKey: true }), ctx({ hasSelection: false })),
  null,
  "properties needs a selection",
);

// F2 renames and F6 moves the data, as the original binds them. The original
// edits the name in place; this asks in a dialog instead, which is what the
// rest of the rewrite does for renames.
eq(resolveShortcut(key("F2"), list), { kind: "rename" }, "F2 renames the torrent");
eq(resolveShortcut(key("F6"), list), { kind: "move-data" }, "F6 moves the data");
eq(
  resolveShortcut(key("F2"), ctx({ hasSelection: false })),
  null,
  "F2 needs a selection",
);
eq(
  resolveShortcut(key("F6"), ctx({ hasSelection: false })),
  null,
  "F6 needs a selection",
);
eq(
  resolveShortcut(key("F2"), ctx({ connected: false })),
  null,
  "F2 needs a connection",
);
eq(resolveShortcut(key("F2", { metaKey: true }), list), null, "Cmd+F2 is not F2");
eq(resolveShortcut(key("F6", { altKey: true }), list), null, "Alt+F6 is not F6");

console.log(`shortcuts: ${passed} assertions passed`);

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
