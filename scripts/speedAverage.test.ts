/**
 * Assertions for the pure speed sampling/averaging logic in
 * src/speedAverage.ts.
 *
 * Run with `pnpm test` (Node 22 strips the types itself, no build step and no
 * extra dependency). These cases exist because the failure modes are quiet: a
 * window that keeps one sample too many, a history that carries a stale torrent
 * forever, or a down/up mix-up would all show plausible-but-wrong numbers.
 */
import {
  SPEED_WINDOW,
  average,
  averagedSpeeds,
  pushSample,
  sampleSpeeds,
  type SpeedHistory,
} from "../src/speedAverage.ts";

let passed = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

// --- pushSample keeps a bounded, most-recent window --------------------------
eq(pushSample([], 10), [10], "first sample");
eq(pushSample([10], 20), [10, 20], "appends below the window");
eq(SPEED_WINDOW, 5, "default window is 5 samples");
eq(pushSample([1, 2, 3, 4, 5], 6), [2, 3, 4, 5, 6], "drops the oldest at the window");
eq(pushSample([1, 2], 3, 2), [2, 3], "honours an explicit window");
eq(pushSample([5], 9, 0), [9], "a zero window clamps to one sample");
eq(pushSample([5], 9, 2.9), [5, 9], "fractional window floors");
const untouched = [1, 2, 3];
pushSample(untouched, 4);
eq(untouched, [1, 2, 3], "pushSample copies rather than mutating its input");

// --- average ----------------------------------------------------------------
eq(average([]), 0, "empty average is 0, not NaN");
eq(average([4]), 4, "single sample");
eq(average([1, 2, 3, 4]), 2.5, "mean of four");
eq(average([0, 0, 0]), 0, "all zero");

// --- sampleSpeeds builds per-id history, independent down/up -----------------
const first: SpeedHistory = sampleSpeeds({}, [
  { id: 1, down: 100, up: 10 },
  { id: 2, down: 0, up: 0 },
]);
eq(first, { 1: { down: [100], up: [10] }, 2: { down: [0], up: [0] } }, "first snapshot seeds history");

const second = sampleSpeeds(first, [
  { id: 1, down: 200, up: 20 },
  { id: 2, down: 0, up: 5 },
]);
eq(second[1], { down: [100, 200], up: [10, 20] }, "second snapshot appends, down/up separate");
eq(first[1], { down: [100], up: [10] }, "previous history was not mutated");

// --- stale ids are dropped rather than remembered ----------------------------
const survived = sampleSpeeds(second, [{ id: 2, down: 7, up: 8 }]);
eq(Object.keys(survived).sort(), ["2"], "torrents absent from the snapshot are dropped");

// --- windowing through sampleSpeeds -----------------------------------------
let rolling: SpeedHistory = {};
for (const v of [1, 2, 3, 4, 5, 6]) rolling = sampleSpeeds(rolling, [{ id: 9, down: v, up: 0 }]);
eq(rolling[9].down, [2, 3, 4, 5, 6], "rolling window keeps the latest five");
eq(average(rolling[9].down), 4, "average of the rolling window");

// --- averagedSpeeds turns the history into display values --------------------
const avg = averagedSpeeds({ 1: { down: [100, 200], up: [10] }, 2: { down: [], up: [] } });
eq(avg.get(1), { down: 150, up: 10 }, "per-id averages");
eq(avg.get(2), { down: 0, up: 0 }, "empty samples read as 0");
eq(avg.size, 2, "every id is present");

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`speedAverage: ${passed} assertions passed`);
