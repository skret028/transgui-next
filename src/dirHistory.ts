// Recent download directories, as offered by the Add dialog. Pure, so the
// ordering and bounding rules stay testable without the settings store.

/**
 * How many recent directories to keep, and the range it may be set to.
 *
 * The original keeps 50 by default and offers the number in its connection
 * settings, bounded by its FolderHistory unit; the same bounds are kept here.
 */
export const DIR_HISTORY_MAX = 50;
export const HISTORY_LIMIT_MIN = 10;
export const HISTORY_LIMIT_MAX = 99;

/** Hold a configured history size inside the range the original allows. */
export function clampHistoryLimit(value: number): number {
  if (!Number.isFinite(value)) return DIR_HISTORY_MAX;
  const whole = Math.floor(value);
  if (whole < HISTORY_LIMIT_MIN) return HISTORY_LIMIT_MIN;
  if (whole > HISTORY_LIMIT_MAX) return HISTORY_LIMIT_MAX;
  return whole;
}

/**
 * Push a directory to the front, newest first.
 *
 * A directory already in the list moves to the front rather than appearing
 * twice: the list is for picking one of a handful of destinations, and a
 * repeated path would push a genuinely different one out of the window.
 * Blank (the dialog's "use the server default") is not a destination, so it
 * is not recorded.
 */
export function pushDirHistory(
  list: string[],
  dir: string,
  max: number = DIR_HISTORY_MAX,
): string[] {
  const d = dir.trim();
  if (!d) return list;
  return [d, ...list.filter((x) => x !== d)].slice(0, clampHistoryLimit(max));
}
