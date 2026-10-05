/**
 * Assertions for the pure path-mapping logic in src/paths.ts.
 *
 * Run with `pnpm test` (Node 22 strips the types itself, no build step and no
 * extra dependency). These cases exist because the failure modes are silent:
 * a mapping that matches "/downloads2" when it meant "/downloads", or a lost
 * longest-prefix tie, opens the wrong folder without any error.
 */
import {
  mapPath,
  normalizePathMap,
  revealPathFor,
  trimTrailing,
} from "../src/paths.ts";

let passed = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

// --- a daemon on this machine keeps its own paths ---------------------------
eq(revealPathFor("/downloads/tv", "localhost", []), "/downloads/tv", "local host keeps path");
eq(revealPathFor("/downloads/", "127.0.0.1", []), "/downloads", "trailing slash stripped");
eq(revealPathFor("/downloads", "LOCALHOST", []), "/downloads", "host case-insensitive");
eq(revealPathFor("/downloads", "::1", []), "/downloads", "ipv6 loopback");
eq(revealPathFor("/downloads", "[::1]", []), "/downloads", "bracketed ipv6 loopback");

// --- but an explicit mapping outranks the local-host shortcut ---------------
// A containerised daemon on localhost still sees its own mount points, so the
// mapping has to be honoured there too.
eq(
  revealPathFor("/downloads/tv", "localhost", [{ remote: "/downloads", local: "/Volumes/media" }]),
  "/Volumes/media/tv",
  "mapping applies on localhost too (container case)",
);
eq(
  revealPathFor("/srv/dl", "localhost", [{ remote: "/downloads", local: "/Volumes/media" }]),
  "/srv/dl",
  "unmatched mapping falls back to the local path",
);

// --- a remote daemon we cannot reach without a mapping ----------------------
eq(revealPathFor("/downloads/tv", "nas.local", []), null, "remote with no mapping");
eq(revealPathFor("/downloads/tv", "192.168.88.91", [{ remote: "", local: "" }]), null, "blank row ignored");
eq(revealPathFor("", "nas.local", [{ remote: "/a", local: "/b" }]), null, "empty path");

// --- translation ------------------------------------------------------------
const ONE = [{ remote: "/downloads", local: "/Volumes/media" }];
eq(revealPathFor("/downloads", "nas.local", ONE), "/Volumes/media", "exact prefix");
eq(revealPathFor("/downloads/tv/x.mkv", "nas.local", ONE), "/Volumes/media/tv/x.mkv", "subpath joined");
eq(revealPathFor("/downloads/tv/", "nas.local", ONE), "/Volumes/media/tv", "trailing slash stripped");
eq(mapPath("/downloadsX/tv", ONE), null, "boundary: /downloadsX is a different dir");
eq(mapPath("/downloads-old/tv", ONE), null, "boundary: a hyphen is not a separator");

// --- the deepest matching prefix wins ---------------------------------------
const DEEP = [
  { remote: "/downloads", local: "/Volumes/media" },
  { remote: "/downloads/tv", local: "/Volumes/tv" },
];
eq(mapPath("/downloads/tv/show/ep1.mkv", DEEP), "/Volumes/tv/show/ep1.mkv", "deeper prefix wins");
eq(mapPath("/downloads/movies/a.mkv", DEEP), "/Volumes/media/movies/a.mkv", "shallower for the rest");
eq(mapPath("/downloads-tv/x", DEEP), null, "no false positive on /downloads-tv");

// --- sloppy input -----------------------------------------------------------
eq(mapPath("/dl/a", [{ remote: "/dl/", local: "/mnt/" }]), "/mnt/a", "trailing slashes both sides");
eq(mapPath("/dl", [{ remote: "/dl", local: "/mnt/" }]), "/mnt", "local trailing slash");
eq(mapPath("/dl/x", [{ remote: "  /dl ", local: " /mnt " }]), "/mnt/x", "whitespace trimmed");
eq(mapPath("/", [{ remote: "/", local: "/srv" }]), "/srv", "root mapping");
eq(mapPath("/a/b", [{ remote: "/a", local: "C:\\Media" }]), "C:\\Media\\b", "windows local root keeps backslash");

// --- helpers ----------------------------------------------------------------
eq(trimTrailing("/a/b///"), "/a/b", "trim many separators");
eq(trimTrailing("/"), "/", "root stays root");
eq(trimTrailing("  /a/b  "), "/a/b", "trim spaces");

// --- the settings store can hold anything ------------------------------------
eq(normalizePathMap(undefined), [], "undefined");
eq(normalizePathMap("nope"), [], "not an array");
eq(normalizePathMap([null, 1, "x"]), [], "garbage rows");
eq(
  normalizePathMap([{ remote: "/a", local: "/b" }, { remote: "", local: "" }, { remote: "/c" }]),
  [{ remote: "/a", local: "/b" }, { remote: "/c", local: "" }],
  "blank row dropped, partial row kept",
);

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`paths: ${passed} assertions passed`);
