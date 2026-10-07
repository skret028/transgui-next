/**
 * Assertions for src/filePriority.ts — the files tab's four-way picker mapped
 * onto Transmission's torrent-set fields.
 *
 * These field names and the wanted/priority pairing were checked against a live
 * daemon (the wish/mode round-trips exactly); this file keeps that from silently
 * regressing. The failure mode being guarded is quiet and expensive: a file that
 * is re-prioritised without being re-wanted stays skipped, so a torrent
 * downloads the wrong set of files without ever looking broken.
 *
 * Run with `pnpm test`.
 */
import { fileMode, filePatch, filePatchAll } from "../src/filePriority.ts";

let passed = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

const stat = (wanted: boolean, priority: number) => ({ wanted, priority });

// --- fileMode: the daemon's pair, read back ---------------------------------
eq(fileMode(stat(true, 0)), "normal", "wanted with priority 0 is normal");
eq(fileMode(stat(true, 1)), "high", "wanted with priority 1 is high");
eq(fileMode(stat(true, -1)), "low", "wanted with priority -1 is low");
eq(fileMode(stat(false, 0)), "skip", "unwanted is skipped whatever the priority");
eq(fileMode(stat(false, 1)), "skip", "unwanted high-priority is still skipped");
eq(fileMode(undefined), "skip", "an unknown file reads as skipped");

// --- filePatch: one file ----------------------------------------------------
eq(filePatch("skip", 3), { "files-unwanted": [3] }, "skip unwants exactly that file");
eq(
  Object.keys(filePatch("skip", 3)),
  ["files-unwanted"],
  "skip sends no priority field at all",
);
eq(
  filePatch("normal", 0),
  { "files-wanted": [0], "priority-normal": [0] },
  "normal re-wants and sets priority-normal",
);
eq(
  filePatch("low", 1),
  { "files-wanted": [1], "priority-low": [1] },
  "low re-wants and sets priority-low",
);
eq(
  filePatch("high", 2),
  { "files-wanted": [2], "priority-high": [2] },
  "high re-wants and sets priority-high",
);

// Choosing any priority must also re-want the file. Skipping writes wanted=false
// and leaves the priority alone, so a bare priority change would leave a file
// that was skipped — or one whose priority was set long ago — in the wrong
// state.
for (const mode of ["normal", "low", "high"] as const) {
  eq(
    "files-wanted" in filePatch(mode, 9),
    true,
    `${mode} re-wants the file, so a skipped file comes back`,
  );
}

// --- filePatchAll: every file ----------------------------------------------
eq(
  filePatchAll("skip", 3),
  { "files-unwanted": [0, 1, 2] },
  "select-none unwants every index",
);
eq(
  filePatchAll("normal", 2),
  { "files-wanted": [0, 1], "priority-normal": [0, 1] },
  "select-all re-wants every index at normal",
);
eq(filePatchAll("skip", 0), { "files-unwanted": [] }, "an empty torrent sends an empty list");
eq(
  filePatchAll("high", 0),
  { "files-wanted": [], "priority-high": [] },
  "an empty torrent sends empty lists at any mode",
);
eq(
  filePatchAll("skip", 4)["files-unwanted"],
  Array.from({ length: 4 }, (_, i) => i),
  "the indices are ordered and complete",
);

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`filePriority: ${passed} assertions passed`);
