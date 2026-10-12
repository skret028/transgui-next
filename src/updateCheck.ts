// When the next version check is due.
//
// Pure, so the arithmetic - and the ways it can go wrong - stay testable without
// the app: a stored timestamp that is empty, unparseable, or in the future must
// not turn into a check on every tick, and 0 days means the check is off.

/**
 * Is a version check due?
 *
 * @param last  The stored time of the last check (an ISO string), or "".
 * @param days  How often to check. 0 means never.
 * @param now   The current time.
 *
 * A `last` that cannot be read counts as "never checked", except when it sits in
 * the future - a clock that moved backwards should not schedule anything until
 * it catches up, so that is treated as not due.
 */
export function updateCheckDue(last: string, days: number, now: Date): boolean {
  if (!Number.isFinite(days) || days <= 0) return false;
  if (!last) return true;
  const then = Date.parse(last);
  if (Number.isNaN(then)) return true;
  const elapsed = now.getTime() - then;
  if (elapsed < 0) return false;
  return elapsed >= days * 86_400_000;
}
