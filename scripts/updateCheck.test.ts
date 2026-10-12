// Run with: node --experimental-strip-types scripts/updateCheck.test.ts
import { updateCheckDue } from "../src/updateCheck.ts";

let passed = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) passed++;
  else failures.push(`${what}: expected ${b}, got ${a}`);
}

const now = new Date("2026-10-12T12:00:00Z");

// Off means off, however long it has been.
eq(updateCheckDue("2020-01-01T00:00:00Z", 0, now), false, "0 days never checks");
eq(updateCheckDue("", 0, now), false, "0 days never checks, even with no record");

// A stored time that cannot be read is treated as "never checked".
eq(updateCheckDue("not a date", 1, now), true, "unreadable time checks now");
eq(updateCheckDue("", 1, now), true, "no record checks now");

// Straightforward elapsed time, either side of the boundary.
eq(updateCheckDue("2026-10-11T12:00:00Z", 1, now), true, "exactly one day is due");
eq(updateCheckDue("2026-10-11T12:00:01Z", 1, now), false, "one day less a second is not");
eq(updateCheckDue("2026-10-10T12:00:00Z", 3, now), false, "two days is not three");
eq(updateCheckDue("2026-10-09T12:00:00Z", 3, now), true, "three days is three");

// A clock that went backwards must not queue a check on every tick.
eq(updateCheckDue("2026-10-13T12:00:00Z", 1, now), false, "a future timestamp waits");

// A fractional interval (the setting is a number, not an integer).
eq(updateCheckDue("2026-10-12T00:00:00Z", 0.5, now), true, "half a day is due after twelve hours");
eq(updateCheckDue("2026-10-12T06:00:00Z", 0.5, now), false, "six hours is not half a day");
eq(updateCheckDue("2026-10-12T00:00:00Z", NaN, now), false, "a NaN interval is off");

console.log(`updateCheck: ${passed} assertions passed`);

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
