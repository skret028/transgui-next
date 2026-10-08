/**
 * Recognise a torrent link in arbitrary clipboard text.
 *
 * Accepts a magnet URI, or an http(s) URL that names a .torrent file. Only a
 * single, clearly-delimited link is returned; surrounding text (a chat line, a
 * list) is ignored. A lone page URL that is not a .torrent is deliberately not
 * matched — we cannot add it, and guessing would be wrong.
 */
export function extractTorrentLink(text: string): string | null {
  if (!text) return null;
  const magnet = text.match(/magnet:\?[^\s"'<>]+/i);
  if (magnet) return magnet[0];
  const url = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (url && /\.torrent(\?|#|$)/i.test(url[0])) return url[0];
  return null;
}

/**
 * Magnet URI for a torrent, from its info hash and display name.
 *
 * Only `xt` and `dn` go in: every client understands both, and the tracker list
 * is not part of what a list row carries. Returns "" when there is no hash, so
 * a caller skips the copy rather than putting a useless link on the clipboard.
 */
export function magnetLink(hashString: string, name: string): string {
  const hash = hashString.trim().toLowerCase();
  if (!hash) return "";
  const params = [`xt=urn:btih:${hash}`];
  if (name.trim()) params.push(`dn=${encodeURIComponent(name)}`);
  return `magnet:?${params.join("&")}`;
}

/** decodeURIComponent throws on malformed input; one bad tracker is not fatal. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The trackers named in a magnet URI, in order, with duplicates dropped.
 *
 * `tr` is URL-encoded and may repeat. Only used when the daemon reports that a
 * torrent is already present: merging these into the torrent that is already
 * there is the one thing that can still come of a repeat add, which is what the
 * original offers in that spot.
 */
export function trackersFromMagnet(link: string): string[] {
  const text = link.trim();
  if (!/^magnet:\?/i.test(text)) return [];
  const found: string[] = [];
  for (const part of text.slice(8).split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim().toLowerCase() !== "tr") continue;
    const value = safeDecode(part.slice(eq + 1).trim()).trim();
    if (value && !found.includes(value)) found.push(value);
  }
  return found;
}
