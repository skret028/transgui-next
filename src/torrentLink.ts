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
