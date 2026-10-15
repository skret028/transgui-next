/**
 * The items the speed-limit menus offer.
 *
 * The original keeps them as one comma-separated string per direction, edited in
 * its connection dialog under "Speed limit menu items", and rebuilds the menus
 * from that string every time they open. Its default is the list below, and its
 * rebuild rules are worth keeping because they are what makes an edited list
 * behave:
 *
 *   - entries that are not a whole number are dropped, and negatives with them;
 *   - entries are sorted ascending and duplicates are dropped, so a hand-typed
 *     list always reads in order;
 *   - the limit currently in force is added to the list, so the active value is
 *     always one of the choices even after the list has been edited away from it;
 *   - "Unlimited" is always offered, ahead of the numbers.
 *
 * 0 counts as a real entry there ("0 KB/s" appears alongside "Unlimited"), and
 * this keeps that: the daemon treats 0 as no limit, so it costs nothing, and
 * dropping it would silently change what an existing list means.
 */
export const DEFAULT_SPEEDS = "0,10,25,50,100,250,500,750,1000,2500,5000,7000";

/** Parse one of the comma-separated lists into the menu's numbers, in order. */
export function parseSpeeds(text: string): number[] {
  const seen = new Set<number>();
  for (const part of text.split(",")) {
    const value = Number(part.trim());
    if (part.trim() === "" || !Number.isFinite(value) || value < 0) continue;
    seen.add(Math.round(value));
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * What a speed menu shows: the parsed list, with the limit in force folded in so
 * it can always be selected back.
 */
export function speedMenuItems(text: string, current: number | null): number[] {
  const items = parseSpeeds(text);
  if (current != null && current >= 0 && !items.includes(current)) {
    items.push(current);
    items.sort((a, b) => a - b);
  }
  return items;
}
