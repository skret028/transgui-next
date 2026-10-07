// Recent download directories, as offered by the Add dialog. Pure, so the
// ordering and bounding rules stay testable without the settings store.

/** How many recent directories to keep. */
export const DIR_HISTORY_MAX = 10;

/**
 * Push a directory to the front, newest first.
 *
 * A directory already in the list moves to the front rather than appearing
 * twice: the list is for picking one of a handful of destinations, and a
 * repeated path would push a genuinely different one out of the window.
 * Blank (the dialog's "use the server default") is not a destination, so it
 * is not recorded.
 */
export function pushDirHistory(list: string[], dir: string): string[] {
  const d = dir.trim();
  if (!d) return list;
  return [d, ...list.filter((x) => x !== d)].slice(0, DIR_HISTORY_MAX);
}
