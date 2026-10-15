// The messages the newest work shows, checked against the real locale file.
//
// The keys are English source strings, taken from transgui's own translations,
// so a key that is not in the file silently falls back to English - and a key
// whose placeholders were typed rather than carried over renders with the
// placeholder still in it. Both are visible here.
// Run with: node --experimental-strip-types scripts/parityMessages.test.ts
import { readFileSync } from "node:fs";
import { formatMessage } from "../src/msgFormat.ts";

const zh: Record<string, string> = JSON.parse(
  readFileSync(new URL("../src/locales/zh-CN.json", import.meta.url), "utf8"),
);

let passed = 0;
const failures: string[] = [];

function check(what: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
  } else {
    failures.push(`${what}${detail ? " - " + detail : ""}`);
  }
}

/** The message is present and is translated, not left as the English key. */
function translated(key: string) {
  const value = zh[key];
  check(`translated: ${key}`, typeof value === "string" && value !== key && value !== "", value ?? "(missing)");
  return value ?? "";
}

/** Filling the placeholders leaves none behind. */
function fills(key: string, vars: Record<string, string | number>) {
  const out = formatMessage(zh[key] ?? key, vars);
  check(
    `placeholders filled: ${key}`,
    !/%[sd]/.test(out) && !/\{[a-z]+\}/i.test(out),
    out,
  );
  return out;
}

// --- the add dialog's two new preferences -----------------------------------
translated("Prompt for download options when adding a new torrent");
translated(
  "Off, a torrent goes in as it arrives with every file wanted, and the dialog never asks about files, the name or the peer limit.",
);

// --- the speed-limit menu items ---------------------------------------------
translated("Speed limit menu items");
translated("Download speeds (KB/s):");
translated("Upload speeds (KB/s):");
translated("Comma separated. 0 is a limit of zero; Unlimited turns the limit off entirely.");

// --- the confirmations --------------------------------------------------------
// Both halves of the original's pair: one torrent by name, several by count. The
// `~` in the key is the original's own line break and must survive as one.
const one = fills("Torrent verification may take a long time.~Are you sure to start verification of torrent '%s'?", { 1: "Ubuntu 26.04" });
check("the verification prompt names the torrent", one.includes("Ubuntu 26.04"), one);
check("the verification prompt keeps its two lines", one.split("\n").length === 2, JSON.stringify(one));
const many = fills("Torrents verification may take a long time.~Are you sure to start verification of %d torrents?", { 1: 4 });
check("the plural verification prompt counts them", many.includes("4"), many);
check("and it too keeps its two lines", many.split("\n").length === 2, JSON.stringify(many));

const tracker = fills("Are you sure to remove tracker '%s'?", { 1: "http://tracker.example/announce" });
check("the tracker prompt names the tracker", tracker.includes("tracker.example"), tracker);
translated("Remove tracker");
translated("Verify");

// --- the info pane's two new rows --------------------------------------------
translated("Created on");
translated("Wasted");
fills("%s (%d hashfails)", { 1: "1.2 MB", 2: 3 });

// --- the row menu's new entries ----------------------------------------------
translated("Open");
translated("Open containing folder");
translated("Force start");
translated("Setup columns");

// --- the filter rows' vocabulary ---------------------------------------------
// The original's eight, all of which have to read as Chinese and not as English.
for (const key of ["All", "Downloading", "Finished", "Active", "Inactive", "Stopped", "Error", "Waiting"]) {
  translated(key);
}

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`parityMessages: ${passed} passed`);
