// The list's grouping: which switch wins, what a torrent is grouped by, and how
// the headings come out. Run with:
//   node --experimental-strip-types scripts/grouping.test.ts
import { activeGrouping, groupKeyOf, groupRows } from "../src/grouping.ts";

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

/** A torrent with just the fields grouping looks at. */
function tor(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "x",
    downloadDir: "/downloads",
    ...over,
  } as any;
}

const on = { folderGrouping: true, labelGrouping: true, trackerGrouping: true };
const off = { folderGrouping: false, labelGrouping: false, trackerGrouping: false };

// --- which switch wins -------------------------------------------------------
eq(activeGrouping(on), "folder", "all three on groups by folder, as the menu order says");
eq(activeGrouping({ ...on, folderGrouping: false }), "label", "folder off leaves label");
eq(activeGrouping({ ...on, folderGrouping: false, labelGrouping: false }), "tracker", "only tracker left");
eq(activeGrouping(off), null, "all three off is no grouping at all");

// --- what a torrent is grouped by -------------------------------------------
eq(groupKeyOf(tor({ downloadDir: "/data/a" }), "folder"), { key: "/data/a", label: "/data/a" }, "folder key is the directory");
eq(groupKeyOf(tor({ downloadDir: "" }), "folder"), { key: "", label: "—" }, "an empty directory is shown as a dash");

eq(
  groupKeyOf(tor({ trackerStats: [{ host: "tracker.one" }] }), "tracker"),
  { key: "tracker.one", label: "tracker.one" },
  "tracker key is the first tracker's host",
);
eq(groupKeyOf(tor({}), "tracker"), { key: "", label: "—" }, "no tracker is shown as a dash");

eq(groupKeyOf(tor({ labels: ["movies", "4k"] }), "label"), { key: "movies, 4k", label: "movies, 4k" }, "labels are joined as the column shows them");
eq(groupKeyOf(tor({ labels: ["  "] }), "label"), { key: "", label: "—" }, "blank labels count as none");
eq(groupKeyOf(tor({}), "label"), { key: "", label: "—" }, "no labels is a dash");

// --- the rows ----------------------------------------------------------------
const a = tor({ id: 1, downloadDir: "/data/b" });
const b = tor({ id: 2, downloadDir: "/data/a" });
const c = tor({ id: 3, downloadDir: "/data/b" });

eq(
  groupRows([a], null).map((r) => r.kind),
  ["torrent"],
  "no grouping leaves the rows alone",
);
eq(
  groupRows([a, b, c], null).map((r) => (r.kind === "torrent" ? r.torrent.id : r.key)),
  [1, 2, 3],
  "and keeps their order",
);

const rows = groupRows([a, b, c], "folder");
eq(
  rows.map((r) => (r.kind === "group" ? `g:${r.label}(${r.count})` : `t:${r.torrent.id}`)),
  ["g:/data/a(1)", "t:2", "g:/data/b(2)", "t:1", "t:3"],
  "groups are ordered by value, torrents keep their own order inside them",
);

// The empty group sorts first, before any real value.
const grouped = groupRows([tor({ id: 9, downloadDir: "" }), a], "folder");
eq(
  grouped.map((r) => (r.kind === "group" ? `g:${r.label}` : `t:${r.torrent.id}`)),
  ["g:—", "t:9", "g:/data/b", "t:1"],
  "the empty group comes first",
);

// A label group holds everything that shares that set of labels, and nothing else.
eq(
  groupRows([tor({ id: 1, labels: ["tv"] }), tor({ id: 2, labels: ["tv"] }), tor({ id: 3 })], "label")
    .map((r) => (r.kind === "group" ? `g:${r.label}(${r.count})` : `t:${r.torrent.id}`)),
  ["g:—(1)", "t:3", "g:tv(2)", "t:1", "t:2"],
  "labels group by the label column's value",
);

// Grouping is presentation only: every torrent comes back exactly once.
const many = Array.from({ length: 20 }, (_, i) =>
  tor({ id: i + 1, downloadDir: i % 3 === 0 ? "/d/one" : "/d/two" }),
);
const flatten = groupRows(many, "folder")
  .filter((r) => r.kind === "torrent")
  .map((r) => (r as { torrent: { id: number } }).torrent.id);
eq([...flatten].sort((x, y) => x - y), many.map((m) => m.id), "every torrent appears exactly once, in order");

console.log(`grouping: ${passed} passed`);
if (failures.length) {
  for (const f of failures) console.log("  FAIL " + f);
  process.exit(1);
}
