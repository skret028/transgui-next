/**
 * Assertions for src/torrentLink.ts — the clipboard-link recogniser and the
 * magnet builder used by "Copy Magnet Link(s)".
 *
 * Run with `pnpm test`. Both directions matter: a recogniser that matches too
 * much would auto-open the Add dialog for a plain web page, and a magnet that
 * is missing `dn` or carries a stray character produces a link that looks right
 * but does not resolve for the receiving client.
 */
import { extractTorrentLink, magnetLink, trackersFromMagnet } from "../src/torrentLink.ts";

let passed = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

const HASH = "c12fe1c06bba254a9dc9f519b335aa7c1367a88a";

// --- extractTorrentLink: magnets --------------------------------------------
eq(
  extractTorrentLink(`magnet:?xt=urn:btih:${HASH}&dn=Some+Thing`),
  `magnet:?xt=urn:btih:${HASH}&dn=Some+Thing`,
  "a bare magnet is returned as-is",
);
eq(
  extractTorrentLink(`hey look at this: magnet:?xt=urn:btih:${HASH} thanks!`),
  `magnet:?xt=urn:btih:${HASH}`,
  "a magnet embedded in a chat line is extracted without trailing text",
);
eq(extractTorrentLink(`MAGNET:?xt=urn:btih:${HASH}`), `MAGNET:?xt=urn:btih:${HASH}`, "scheme match is case-insensitive");

// --- extractTorrentLink: .torrent URLs --------------------------------------
eq(
  extractTorrentLink("https://example.com/files/debian.torrent"),
  "https://example.com/files/debian.torrent",
  "an http .torrent URL is accepted",
);
eq(
  extractTorrentLink("https://example.com/files/debian.torrent?x=1"),
  "https://example.com/files/debian.torrent?x=1",
  "a query string after .torrent is kept",
);

// --- extractTorrentLink: things that must NOT match -------------------------
eq(extractTorrentLink(""), null, "empty text");
eq(extractTorrentLink("   \n\t "), null, "whitespace only");
eq(extractTorrentLink("https://example.com/index.html"), null, "a plain page URL is not a torrent");
eq(extractTorrentLink("see https://example.com/notes.txt for details"), null, "a non-.torrent file URL is ignored");
eq(
  extractTorrentLink("https://example.com/.torrents/readme"),
  null,
  ".torrent as a directory name does not match",
);
eq(extractTorrentLink("just some words"), null, "prose without a link");

// --- magnetLink -------------------------------------------------------------
eq(
  magnetLink(HASH, "Ubuntu 24.04"),
  `magnet:?xt=urn:btih:${HASH}&dn=Ubuntu%2024.04`,
  "name is percent-encoded into dn",
);
eq(magnetLink(HASH.toUpperCase(), "x"), `magnet:?xt=urn:btih:${HASH}&dn=x`, "hash is lower-cased");
eq(magnetLink(`  ${HASH}  `, "x"), `magnet:?xt=urn:btih:${HASH}&dn=x`, "hash is trimmed");
eq(magnetLink(HASH, ""), `magnet:?xt=urn:btih:${HASH}`, "no dn when the name is empty");
eq(magnetLink(HASH, "   "), `magnet:?xt=urn:btih:${HASH}`, "blank name is treated as empty");
eq(magnetLink("", "x"), "", "no hash means no link");
eq(magnetLink("   ", "x"), "", "blank hash means no link");
eq(
  magnetLink(HASH, "a&b=c?d#e/日本"),
  `magnet:?xt=urn:btih:${HASH}&dn=${encodeURIComponent("a&b=c?d#e/日本")}`,
  "separators and non-ASCII in the name are encoded, not left to break the URI",
);
const built = magnetLink(HASH, "x");
eq(built.startsWith("magnet:?xt=urn:btih:"), true, "the built link starts with the xt field");
eq(built.includes(" "), false, "the built link contains no raw spaces");

// --- trackersFromMagnet -----------------------------------------------------
eq(
  trackersFromMagnet(`magnet:?xt=urn:btih:${HASH}&tr=${encodeURIComponent("http://a.example:80/announce")}`),
  ["http://a.example:80/announce"],
  "a single tr is decoded",
);
eq(
  trackersFromMagnet("magnet:?tr=udp%3A%2F%2Fb.example%3A6969&tr=http%3A%2F%2Fa.example"),
  ["udp://b.example:6969", "http://a.example"],
  "several tr values keep their order and both schemes survive",
);
eq(
  trackersFromMagnet("magnet:?tr=http%3A%2F%2Fa.example&tr=http%3A%2F%2Fa.example"),
  ["http://a.example"],
  "a repeated tracker is only offered once",
);
eq(trackersFromMagnet("magnet:?xt=urn:btih:abc"), [], "no tr means nothing to merge");
eq(trackersFromMagnet("magnet:?dn=x&TR=http%3A%2F%2Fa.example"), ["http://a.example"], "tr is matched case-insensitively");
eq(trackersFromMagnet("magnet:?tr="), [], "an empty tr is skipped");
eq(trackersFromMagnet("magnet:?tr"), [], "a tr with no = is skipped");
eq(
  trackersFromMagnet("magnet:?tr=http%3A%2F%2Fa.example%2F%zz&dn=x"),
  ["http%3A%2F%2Fa.example%2F%zz"],
  "a tracker that cannot be decoded is kept as it arrived, not dropped",
);
eq(trackersFromMagnet(`magnet:?tr=%20${encodeURIComponent("http://a.example")}%20`), ["http://a.example"], "padding is trimmed, before and after decoding");
eq(trackersFromMagnet("https://example.com/x.torrent"), [], "a plain URL names no trackers");
eq(trackersFromMagnet(""), [], "no link means nothing to merge");
eq(trackersFromMagnet("  "), [], "a blank link means nothing to merge");
eq(
  trackersFromMagnet("magnet:?dn=a& tr=http%3A%2F%2Fa.example"),
  ["http://a.example"],
  "whitespace around a field name does not stop it",
);

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`torrentLink: ${passed} assertions passed`);
