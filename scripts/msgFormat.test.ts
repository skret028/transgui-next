// Filling in a looked-up message: transgui writes a line break as `~` and uses
// printf placeholders, and both have to survive into the rendered string because
// the locale files are its own translations, carried over as they stand.
// Run with: node --experimental-strip-types scripts/msgFormat.test.ts
import { formatMessage } from "../src/msgFormat.ts";

let passed = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, what: string) {
  if (actual === expected) {
    passed++;
  } else {
    failures.push(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// A message with no placeholders comes back as it is.
eq(formatMessage("Downloading"), "Downloading", "a plain message is untouched");

// Named placeholders, this app's own convention.
eq(
  formatMessage("Delete {n} torrent(s) and their downloaded data?", { n: 3 }),
  "Delete 3 torrent(s) and their downloaded data?",
  "a named placeholder is filled",
);
eq(
  formatMessage("{size} of {total}", { size: "1 GB", total: "4 GB" }),
  "1 GB of 4 GB",
  "several named placeholders are filled",
);

// printf placeholders, the original's convention. Values are taken in the order
// they were given, which is what lets its own translations be used as they are.
eq(
  formatMessage("Are you sure to remove tracker '%s'?", { 1: "http://x/announce" }),
  "Are you sure to remove tracker 'http://x/announce'?",
  "one %s is filled",
);
eq(
  formatMessage("%s (%d hashfails)", { 1: "1.2 MB", 2: 3 }),
  "1.2 MB (3 hashfails)",
  "an %s and a %d are filled in order",
);
eq(
  formatMessage("Are you sure to start verification of %d torrents?", { 1: 4 }),
  "Are you sure to start verification of 4 torrents?",
  "a %d takes a number",
);
// With nothing to fill in, a placeholder is left alone rather than blanked -
// there is no value to lose, and seeing the placeholder beats seeing nothing.
eq(formatMessage("%s items", {}), "%s items", "no values leaves the placeholder");

// `~` is a line break, in the English key and in the translations alike.
eq(
  formatMessage("Torrent verification may take a long time.~Are you sure?", undefined),
  "Torrent verification may take a long time.\nAre you sure?",
  "a tilde becomes a newline",
);
eq(
  formatMessage("First~second~third", undefined),
  "First\nsecond\nthird",
  "every tilde becomes a newline",
);
// Both conventions in one message: the number is filled and the break happens.
eq(
  formatMessage("of torrent '%s'?~Really?", { 1: "x" }),
  "of torrent 'x'?\nReally?",
  "a placeholder and a break together",
);

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`msgFormat: ${passed} passed`);
