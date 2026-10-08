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
eq(resolveShortcut(key("F3", { ctrlKey: true }), list), null, "Ctrl+F3 is not F3");
eq(resolveShortcut(key("F8", { altKey: true }), list), null, "Alt+F8 is not F8");
eq(resolveShortcut(key("h", { ctrlKey: true, shiftKey: true }), list), null, "Ctrl+Shift+H is not ours");
eq(resolveShortcut(key("a", { ctrlKey: true, shiftKey: true }), list), null, "Ctrl+Shift+A is not select-all");
eq(resolveShortcut(key("a", { ctrlKey: true, altKey: true }), list), null, "Ctrl+Alt+A is not select-all");

// Keys we do not claim are left to the browser.
eq(resolveShortcut(key("F5"), list), null, "F5 is not a shortcut here");
eq(resolveShortcut(key("x"), list), null, "a bare letter is not a shortcut");
eq(resolveShortcut(key("Backspace"), list), null, "Backspace is not Delete");
eq(resolveShortcut(key("r", { ctrlKey: true, shiftKey: true }), list), null, "Ctrl+Shift+R is not reannounce");

console.log(`shortcuts: ${passed} assertions passed`);
if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
