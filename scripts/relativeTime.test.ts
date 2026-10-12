// How long ago a date was, in the original's shape: the two most significant
// units, abbreviated ("2d 3h"), from the calendar rather than from arithmetic
// on seconds.
import { agoParts, agoText, agoUnits } from "../src/relativeTime.ts";

let n = 0;
function check(what: string, ok: boolean, detail = "") {
  n++;
  if (!ok) {
    console.error(`FAIL ${what} ${detail}`);
    process.exit(1);
  }
}

// Moments built in local time, so the expectations hold in any timezone.
const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).getTime() / 1000;

// The seconds the original breaks on.
check("seconds alone", agoText(at(2026, 5, 1, 12, 0, 10), at(2026, 5, 1, 12, 0, 12)) === "2s");
check("nothing at all is zero seconds", agoText(at(2026, 5, 1, 12), at(2026, 5, 1, 12)) === "0s");
check("minutes and seconds", agoText(at(2026, 5, 1, 12), at(2026, 5, 1, 12, 1, 30)) === "1m 30s");
check("hours and minutes", agoText(at(2026, 5, 1, 12), at(2026, 5, 1, 14, 3)) === "2h 3m");
check("days and hours", agoText(at(2026, 5, 1, 12), at(2026, 5, 3, 15)) === "2d 3h");

// Calendar months: a day past a month is a month and a day, so the month length
// never leaks into the answer.
check("months and days", agoText(at(2026, 5, 1, 12), at(2026, 6, 3, 12)) === "1mo 2d");
check("years and months", agoText(at(2024, 3, 1, 12), at(2026, 8, 1, 12)) === "2y 5mo");

// 31 January to 1 March: one month (to 28 February) and one day. Dividing the
// seconds would have said "0mo 29d".
check("a short month does not become days", agoText(at(2026, 1, 31, 12), at(2026, 3, 1, 12)) === "1mo 1d");
// February in a leap year has 29 days: 28 February to 1 March is two days, not
// one.
check("the leap day counts", agoText(at(2024, 2, 28, 12), at(2024, 3, 1, 12)) === "2d 0h");
// Across a year boundary: 15 December to 14 January is under a month.
check("a year boundary is not a year", agoText(at(2025, 12, 15, 12), at(2026, 1, 14, 12)) === "30d 0h");
check("a full year across the boundary is a year", agoText(at(2025, 12, 15, 12), at(2026, 12, 15, 12)) === "1y 0mo");

// A moment in the future reads the same as one the same distance in the past:
// what is being shown is the distance, not a signed span.
check("a future moment reads the same", agoText(at(2026, 5, 2, 12), at(2026, 5, 1, 12)) === "1d 0h");

// The parts themselves still carry everything, so a caller that wants more than
// two units can have them.
const p = agoParts(at(2024, 1, 1, 0), at(2026, 3, 5, 7, 9, 11));
check(
  "the parts are all there",
  p.years === 2 && p.months === 2 && p.days === 4 && p.hours === 7 && p.minutes === 9 && p.seconds === 11,
  JSON.stringify(p),
);

// Two units, never more: that is the whole shape of the original's output.
check("two units at most", agoUnits(agoParts(at(2024, 1, 1), at(2026, 3, 5))).length === 2);
check("one unit when only one is non-zero", agoUnits(agoParts(at(2026, 5, 1), at(2026, 5, 1, 0, 0, 5))).length === 1);

console.log(`relativeTime: ${n} assertions passed`);
