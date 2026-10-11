/**
 * Assertions for src/trackers.ts - the properties dialog's tracker box diffed
 * against the trackers a torrent already has.
 *
 * The algorithm is the original's, and the failure mode it guards is quiet: a
 * tracker that is rewritten when it did not need to be (an unnecessary
 * trackerReplace) resets its scrape history, and a tracker that is dropped
 * because the pairing went wrong takes the torrent's announce list with it.
 *
 * Run with `pnpm test`.
 */
import { trackerPatch } from "../src/trackers.ts";

let passed = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

const tr = (id: number, announce: string) => ({ id, announce });

// --- an untouched list asks for nothing ------------------------------------
eq(trackerPatch([tr(1, "http://a")], "http://a"), {}, "an untouched list sends nothing");
eq(
  trackerPatch([tr(1, "http://a"), tr(2, "http://b")], "http://a\n\n   http://b  \n"),
  {},
  "blank lines and stray spaces are not changes",
);
eq(
  trackerPatch([tr(1, "http://a"), tr(2, "http://b")], "http://b\nhttp://a"),
  {},
  "reordering alone changes nothing - trackers are matched by URL, not position",
);

// --- additions -------------------------------------------------------------
eq(
  trackerPatch([tr(1, "http://a")], "http://a\nhttp://b"),
  { trackerAdd: ["http://b"] },
  "a new line is added",
);
eq(
  trackerPatch([], "http://a\nhttp://b"),
  { trackerAdd: ["http://a", "http://b"] },
  "with no trackers yet, every line is an addition",
);

// --- replacements ----------------------------------------------------------
eq(
  trackerPatch([tr(1, "http://a")], "http://edited"),
  { trackerReplace: [1, "http://edited"] },
  "a changed line replaces that tracker in place",
);
eq(
  trackerPatch([tr(1, "http://a"), tr(2, "http://b")], "http://a\nhttp://edited"),
  { trackerReplace: [2, "http://edited"] },
  "only the tracker that changed is replaced",
);

// --- removals --------------------------------------------------------------
eq(
  trackerPatch([tr(1, "http://a"), tr(2, "http://b")], "http://a"),
  { trackerRemove: [2] },
  "a dropped line removes that tracker",
);
eq(trackerPatch([tr(1, "http://a")], ""), { trackerRemove: [1] }, "clearing the box removes them all");

// --- a mixture: what is left over on each side -----------------------------
eq(
  trackerPatch([tr(1, "http://a"), tr(2, "http://b")], "http://edited"),
  { trackerReplace: [1, "http://edited"], trackerRemove: [2] },
  "a replacement and a removal in one request",
);

// --- trackers the daemon gave no id for are not touched --------------------
eq(trackerPatch([{ announce: "http://anon" }], "http://anon"), {}, "an id-less tracker is left alone");
eq(
  trackerPatch([{ announce: "http://anon" }, tr(1, "http://a")], "http://a\nhttp://new"),
  { trackerAdd: ["http://new"] },
  "an id-less tracker does not consume a line",
);
eq(
  trackerPatch([{ announce: "http://anon" }], "http://edited"),
  { trackerAdd: ["http://edited"] },
  "a line that cannot be matched to an id is added rather than pretending to replace it",
);

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`trackers: ${passed} assertions passed`);
