// The watch folder's waiting list: order, duplicates, and what comes next.
import { enqueue, take } from "../src/watchQueue.ts";

let n = 0;
function check(what: string, ok: boolean, detail = "") {
  n++;
  if (!ok) {
    console.error(`FAIL ${what} ${detail}`);
    process.exit(1);
  }
}

const a = "/watch/a.torrent";
const b = "/watch/b.torrent";
const c = "/watch/c.torrent";

// A scan adds what the folder holds, in the order it was listed.
check("a scan fills an empty list", JSON.stringify(enqueue([], [a, b])) === JSON.stringify([a, b]));

// A second scan does not queue the same file twice: the folder still holds them
// until they are dealt with, and the scan runs again every interval.
check(
  "the same file is not queued twice",
  JSON.stringify(enqueue([a, b], [a, b])) === JSON.stringify([a, b]),
  JSON.stringify(enqueue([a, b], [a, b])),
);

// Something new found while others wait goes to the back, so the files the user
// has been shown first keep their turn.
check(
  "a newly found file goes to the back",
  JSON.stringify(enqueue([a, b], [c])) === JSON.stringify([a, b, c]),
  JSON.stringify(enqueue([a, b], [c])),
);

// Taking hands over the oldest and leaves the rest waiting.
const one = take([a, b]);
check("take returns the head", one.path === a);
check("take leaves the rest", JSON.stringify(one.waiting) === JSON.stringify([b]));

// Nothing waiting means nothing to offer - the dialog must not open on an empty
// list, which is what a scan of a folder with no .torrent files produces.
const none = take([]);
check("take on an empty list offers nothing", none.path === null);
check("take on an empty list stays empty", none.waiting.length === 0);

// Draining one at a time reaches the end and stops rather than looping.
let waiting = enqueue([], [a, b]);
const seen: string[] = [];
for (;;) {
  const step = take(waiting);
  if (step.path === null) break;
  seen.push(step.path);
  waiting = step.waiting;
}
check("draining yields each file once", JSON.stringify(seen) === JSON.stringify([a, b]), JSON.stringify(seen));

console.log(`watchQueue: ${n} assertions passed`);
