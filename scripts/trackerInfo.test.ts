/**
 * Assertions for src/trackerInfo.ts — what the lazy swarm columns read.
 *
 * The distinction being pinned here is "unknown" (-1, a tracker that has not
 * announced) versus "zero peers": showing 0 for an unknown swarm claims
 * knowledge the daemon did not give, and the columns are meant to be trusted.
 *
 * Run with `pnpm test`.
 */
import { bestSwarm, priorityKey } from "../src/trackerInfo.ts";

let passed = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

const stat = (over) => ({
  id: 0,
  host: "tracker.example:80",
  announce: "http://tracker.example/announce",
  announceState: 2,
  lastAnnounceResult: "Success",
  seederCount: 10,
  leecherCount: 3,
  lastAnnounceSucceeded: true,
  lastAnnounceTime: 0,
  ...over,
});
const row = (trackerStats) => ({ trackerStats });

// --- no trackers at all ------------------------------------------------------
eq(bestSwarm(row(undefined)), { seeds: -1, leechers: -1, host: "", status: "" }, "no stats means unknown");
eq(bestSwarm(row([])), { seeds: -1, leechers: -1, host: "", status: "" }, "an empty list is unknown");

// --- one tracker ------------------------------------------------------------
eq(
  bestSwarm(row([stat({})])),
  { seeds: 10, leechers: 3, host: "tracker.example:80", status: "Success" },
  "the single tracker is reported as-is",
);
eq(
  bestSwarm(row([stat({ seederCount: 0, leecherCount: 0 })])),
  { seeds: 0, leechers: 0, host: "tracker.example:80", status: "Success" },
  "a reported zero stays zero, it is not unknown",
);
eq(
  bestSwarm(row([stat({ seederCount: -1, leecherCount: -1 })])),
  { seeds: -1, leechers: -1, host: "tracker.example:80", status: "Success" },
  "an unannounced tracker stays unknown",
);

// --- several trackers -------------------------------------------------------
const many = row([
  stat({ host: "first.example:80", seederCount: 4, leecherCount: 1 }),
  stat({ host: "second.example:80", seederCount: 25, leecherCount: 9 }),
  stat({ host: "third.example:80", seederCount: -1, leecherCount: -1 }),
]);
eq(bestSwarm(many).seeds, 25, "the largest seeder count wins (a quiet tracker must not understate the swarm)");
eq(bestSwarm(many).leechers, 9, "the largest leecher count wins");
eq(bestSwarm(many).host, "first.example:80", "the host is the first tracker's");
eq(bestSwarm(many).status, "Success", "the status is the first tracker's");

// --- priority ---------------------------------------------------------------
eq(priorityKey(1), "High priority", "1 is high");
eq(priorityKey(-1), "Low priority", "-1 is low");
eq(priorityKey(0), "Normal priority", "0 is normal");
eq(priorityKey(7), "Normal priority", "anything unexpected reads as normal");

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`trackerInfo: ${passed} assertions passed`);
