// Run with: node --experimental-strip-types scripts/dirHistory.test.ts
import { DIR_HISTORY_MAX, pushDirHistory } from "../src/dirHistory.ts";

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

console.log(`dirHistory: ${passed} assertions passed`);
if (failed > 0) {
  console.error(`dirHistory: ${failed} FAILED`);
  process.exit(1);
}
