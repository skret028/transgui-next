// The speed-limit menu items: the original builds its menus from one
// comma-separated string per direction, and the rebuilding rules (drop what is
// not a whole number, sort, de-duplicate, fold in the limit in force) are what
// make an edited list behave. Run with:
// node --experimental-strip-types scripts/speedPresets.test.ts
import { DEFAULT_SPEEDS, parseSpeeds, speedMenuItems } from "../src/speedPresets.ts";

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

// The original's own default, which is not the short list that used to be here.
eq(
  parseSpeeds(DEFAULT_SPEEDS),
  [0, 10, 25, 50, 100, 250, 500, 750, 1000, 2500, 5000, 7000],
  "the original's default list",
);

// Typed in any order, read back ascending.
eq(parseSpeeds("500,10,100"), [10, 100, 500], "the list is sorted");
// Duplicates collapse.
eq(parseSpeeds("10,10,20"), [10, 20], "duplicates are dropped");
// Spaces around entries are the user's, not part of the number.
eq(parseSpeeds(" 50 , 25 "), [25, 50], "whitespace is trimmed");
// Entries that are not whole numbers are skipped rather than becoming NaN or 0.
eq(parseSpeeds("10,abc,20,-5,30.7"), [10, 20, 31], "junk is dropped, decimals round");
// A trailing or doubled comma means an empty entry, which is not a speed.
eq(parseSpeeds("10,,20,"), [10, 20], "empty entries are dropped");
// A list that is nothing but junk still yields nothing, so the menu falls back
// to "Unlimited" alone instead of showing a broken entry.
eq(parseSpeeds("abc,"), [], "an all-junk list is empty");
eq(parseSpeeds(""), [], "an empty list is empty");

// The limit in force is always one of the choices, even when the list no longer
// contains it: otherwise a custom speed could never be picked back.
eq(speedMenuItems("10,20", 15), [10, 15, 20], "the current limit joins the list in order");
eq(speedMenuItems("10,20", 20), [10, 20], "an already-listed limit is not repeated");
eq(speedMenuItems("10,20", null), [10, 20], "no limit adds nothing");
// 0 is a real entry in the original ("0 KB/s" beside "Unlimited"), and the
// daemon reads 0 as no limit, so it is kept.
eq(speedMenuItems("0,10", null), [0, 10], "zero survives");
// And "unlimited" is not a number, so it never gets folded in as one.
eq(speedMenuItems("10", null), [10], "unlimited is not injected as a number");

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`speedPresets: ${passed} passed`);
