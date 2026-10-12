// How long the daemon may take to answer, and how long a connection to it may
// take to come up.
//
// Both are the original's [NetWork] settings. Its bounds and its defaults are
// kept, including the one that matters: a connect timeout of 0 is not "no
// timeout" but "use the HTTP timeout", so the two are not interchangeable.

/** The original's default and range for the HTTP timeout, in seconds. */
export const HTTP_TIMEOUT_DEFAULT = 30;
export const HTTP_TIMEOUT_MIN = 2;
export const HTTP_TIMEOUT_MAX = 999;

/** A connect timeout of 0 means "the HTTP timeout"; the rest are seconds. */
export const CONNECT_TIMEOUT_DEFAULT = 0;
export const CONNECT_TIMEOUT_MAX = 999;

export function clampHttpTimeout(value: number): number {
  if (!Number.isFinite(value)) return HTTP_TIMEOUT_DEFAULT;
  const whole = Math.floor(value);
  if (whole < HTTP_TIMEOUT_MIN || whole > HTTP_TIMEOUT_MAX) return HTTP_TIMEOUT_DEFAULT;
  return whole;
}

export function clampConnectTimeout(value: number): number {
  if (!Number.isFinite(value)) return CONNECT_TIMEOUT_DEFAULT;
  const whole = Math.floor(value);
  if (whole < 0 || whole > CONNECT_TIMEOUT_MAX) return CONNECT_TIMEOUT_DEFAULT;
  return whole;
}

/** What a connect timeout of this value actually means, in seconds. */
export function effectiveConnectTimeout(configured: number, httpTimeout: number): number {
  const c = clampConnectTimeout(configured);
  return c === 0 ? clampHttpTimeout(httpTimeout) : c;
}
