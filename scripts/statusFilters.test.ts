// The filter rows: the original's eight, in the original's order and with the
// original's tests, which is what makes its Alt+1..Alt+8 shortcuts mean the same
// thing here. Run with: node --experimental-strip-types scripts/statusFilters.test.ts
import { STATUS_FILTERS, filterTorrents, statusIdOf } from "../src/torrentList.ts";

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

/** A torrent with just the fields the filters look at. */
function tor(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: "t",
    status: 0,
    percentDone: 0,
    rateDownload: 0,
    rateUpload: 0,
    error: 0,
    ...over,
  } as never;
}

// Transmission's status codes.
const STOPPED = 0;
const CHECK_WAIT = 1;
const CHECK = 2;
const DOWNLOAD_WAIT = 3;
const DOWNLOAD = 4;
const SEED = 6;

const ids = STATUS_FILTERS.map((f) => f.id);
eq(
  ids,
  ["all", "downloading", "finished", "active", "inactive", "stopped", "error", "waiting"],
  "the rows are the original's eight, in its order",
);

const row = (id: string) => STATUS_FILTERS.find((f) => f.id === id)!.test;

// All matches everything, including a stopped torrent with an error.
eq(row("all")(tor()), true, "all matches everything");

// Downloading is status 4 exactly - not "has some progress".
eq(row("downloading")(tor({ status: DOWNLOAD })), true, "status 4 is downloading");
eq(row("downloading")(tor({ status: SEED })), false, "seeding is not downloading");

// Finished is done or seeding, which is how the original folds seeding in.
eq(row("finished")(tor({ status: SEED })), true, "seeding is finished");
eq(row("finished")(tor({ status: STOPPED, percentDone: 1 })), true, "a complete stopped torrent is finished");
eq(row("finished")(tor({ status: DOWNLOAD, percentDone: 0.5 })), false, "half a torrent is not finished");

// Active is moving in either direction.
eq(row("active")(tor({ rateDownload: 1 })), true, "a download is active");
eq(row("active")(tor({ rateUpload: 1 })), true, "an upload is active");
eq(row("active")(tor()), false, "a still torrent is not active");

// Inactive is the rest of the running ones: not moving and not stopped.
eq(row("inactive")(tor({ status: DOWNLOAD })), true, "a stalled download is inactive");
eq(row("inactive")(tor({ status: DOWNLOAD_WAIT })), true, "a torrent waiting its turn is inactive");
eq(row("inactive")(tor({ status: DOWNLOAD, rateDownload: 5 })), false, "a moving torrent is not inactive");
eq(row("inactive")(tor({ status: STOPPED })), false, "a stopped torrent is not inactive");

// Stopped is the daemon's own stopped state.
eq(row("stopped")(tor({ status: STOPPED })), true, "status 0 is stopped");
eq(row("stopped")(tor({ status: DOWNLOAD })), false, "a download is not stopped");

// Error is any recorded error, whatever the state.
eq(row("error")(tor({ status: DOWNLOAD, error: 3 })), true, "an error is an error");
eq(row("error")(tor({ error: 0 })), false, "no error is no error");

// Waiting is the original's trio: queued to check, checking, queued to download.
// Checking used to be a row of its own; the original files it here.
eq(row("waiting")(tor({ status: CHECK_WAIT })), true, "queued to check is waiting");
eq(row("waiting")(tor({ status: CHECK })), true, "checking is waiting");
eq(row("waiting")(tor({ status: DOWNLOAD_WAIT })), true, "queued to download is waiting");
eq(row("waiting")(tor({ status: DOWNLOAD })), false, "an actual download is not waiting");

// Filtering a list keeps the order and only drops what does not match.
const list = [
  tor({ id: 1, status: DOWNLOAD }),
  tor({ id: 2, status: SEED }),
  tor({ id: 3, status: STOPPED }),
];
const downloading = STATUS_FILTERS.find((f) => f.id === "downloading")!;
const rowOf = (f: (typeof STATUS_FILTERS)[number]) => ({ selection: { kind: "status" as const, value: f.id }, text: "" });
eq(
  filterTorrents(list, rowOf(downloading)).map((t: { id: number }) => t.id),
  [1],
  "the downloading row keeps only the download",
);
// Every row is reachable through the selection, which is what the details and
// toolbar dropdowns pass in.
eq(
  filterTorrents(list, { selection: { kind: "status", value: "finished" }, text: "" }).map(
    (t: { id: number }) => t.id,
  ),
  [2],
  "the finished row keeps the seeding torrent",
);
// A text query still applies on top of the row.
eq(
  filterTorrents(list, { selection: { kind: "all", value: "" }, text: "t" }).length,
  3,
  "the text filter matches every name here",
);
// And an unknown row id matches everything rather than nothing, so a stored
// selection from an older build cannot blank the list.
eq(
  filterTorrents(list, { selection: { kind: "status", value: "gone" }, text: "" }).length,
  3,
  "an unknown row falls back to everything",
);

// The top-bar dropdown reads the selection back as a row id, and anything that
// is not a status reads as "all".
eq(statusIdOf({ kind: "status", value: "waiting" }), "waiting", "a status selection reads back");
eq(statusIdOf({ kind: "label", value: "linux" }), "all", "a non-status selection reads as all");

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`statusFilters: ${passed} passed`);
