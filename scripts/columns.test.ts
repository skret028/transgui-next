// The column list's validation: what survives a round trip through the settings
// file, and in what order. The order matters - it is what the up/down buttons in
// the column dialog set, and the table draws the columns in it.
import { ALL_COLUMNS, DEFAULT_COLUMNS, normalizeColumns } from "../src/columns.ts";

let n = 0;
function check(what: string, ok: boolean, detail = "") {
  n++;
  if (!ok) {
    console.error(`FAIL ${what} ${detail}`);
    process.exit(1);
  }
}

// The user's order is the answer, not the registry's.
const reordered = normalizeColumns(["status", "name", "size"]);
check(
  "a chosen order survives",
  JSON.stringify(reordered) === JSON.stringify(["status", "name", "size"]),
  JSON.stringify(reordered),
);

// Unknown ids go, and the rest keep their places.
const withJunk = normalizeColumns(["status", "nope", "name", 42, null]);
check(
  "unknown ids drop out and the order stays",
  JSON.stringify(withJunk) === JSON.stringify(["status", "name"]),
  JSON.stringify(withJunk),
);

// A duplicate would draw the same column twice.
const dupes = normalizeColumns(["name", "name", "status"]);
check(
  "duplicates collapse on first sighting",
  JSON.stringify(dupes) === JSON.stringify(["name", "status"]),
  JSON.stringify(dupes),
);

// Nothing usable left: the defaults stand in, or the table would be empty.
check("no usable ids falls back", normalizeColumns(["nope"]) === DEFAULT_COLUMNS);
check("a non-array falls back", normalizeColumns("name") === DEFAULT_COLUMNS);
check("an empty array falls back", normalizeColumns([]) === DEFAULT_COLUMNS);

// Every default is a real column, so a fallback can always be drawn.
check(
  "the defaults are all known",
  DEFAULT_COLUMNS.every((id) => ALL_COLUMNS.some((c) => c.id === id)),
  DEFAULT_COLUMNS.join(","),
);

console.log(`columns: ${n} assertions passed`);
