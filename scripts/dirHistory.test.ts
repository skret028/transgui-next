// Run with: node --experimental-strip-types scripts/dirHistory.test.ts
import {
  DIR_HISTORY_MAX,
  HISTORY_LIMIT_MAX,
  HISTORY_LIMIT_MIN,
  clampHistoryLimit,
  pushDirHistory,
} from "../src/dirHistory.ts";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${what}\n  expected ${b}\n  actual   ${a}`);
  }
}

// Newest first.
eq(pushDirHistory(["/a", "/b"], "/c"), ["/c", "/a", "/b"], "prepends");
eq(pushDirHistory([], "/a"), ["/a"], "starts a list");

// A repeat moves up instead of being duplicated.
eq(pushDirHistory(["/a", "/b"], "/b"), ["/b", "/a"], "re-moves to front");
eq(pushDirHistory(["/a"], "/a"), ["/a"], "same value once");

// Blank is "server default", not a destination.
eq(pushDirHistory(["/a"], ""), ["/a"], "ignores blank");
eq(pushDirHistory(["/a"], "   "), ["/a"], "ignores whitespace");

// Trimmed on the way in.
eq(pushDirHistory([], "  /a  "), ["/a"], "trims");

// Bounded.
const many = Array.from({ length: DIR_HISTORY_MAX }, (_, i) => `/d${i}`);
eq(pushDirHistory(many, "/new").length, DIR_HISTORY_MAX, "stays bounded");
eq(pushDirHistory(many, "/new")[0], "/new", "bounded keeps the newest");
eq(
  pushDirHistory(many, "/new").includes(`/d${DIR_HISTORY_MAX - 1}`),
  false,
  "bounded drops the oldest",
);

// A re-move of an existing entry must not shorten the list.
eq(
  pushDirHistory(many, "/d0").length,
  DIR_HISTORY_MAX,
  "re-move keeps the length",
);

// The input list is not mutated.
const original = ["/a", "/b"];
pushDirHistory(original, "/c");
eq(original, ["/a", "/b"], "does not mutate the input");

// The size is the original's, and it can be set: 50 by default, held inside the
// range its FolderHistory unit allows.
eq(DIR_HISTORY_MAX, 50, "the original's default is kept");
eq(clampHistoryLimit(20), 20, "a legal size is kept");
eq(clampHistoryLimit(1), HISTORY_LIMIT_MIN, "below the range stops at the minimum");
eq(clampHistoryLimit(1000), HISTORY_LIMIT_MAX, "above the range stops at the maximum");
eq(clampHistoryLimit(NaN), DIR_HISTORY_MAX, "an unusable value falls back to the default");
eq(clampHistoryLimit(12.7), 12, "a fraction is a whole number of entries");

// And the list follows the configured size, not just the default.
const short = Array.from({ length: 12 }, (_, i) => `/x${i}`);
eq(pushDirHistory(short, "/new", 10).length, 10, "a smaller configured size is honoured");
eq(pushDirHistory(short, "/new", 999).length, 13, "and a larger one grows the list");
eq(pushDirHistory(short, "/new", 1).length, HISTORY_LIMIT_MIN, "an out-of-range size is clamped first");

console.log(`dirHistory: ${passed} assertions passed`);
if (failed > 0) {
  console.error(`dirHistory: ${failed} FAILED`);
  process.exit(1);
}