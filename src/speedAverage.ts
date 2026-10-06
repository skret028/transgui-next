// Pure sampling + averaging for the "smooth transfer speeds" preference.
//
// The list refreshes every couple of seconds; a torrent's raw rate jumps around
// from one poll to the next, so the opt-in setting shows a moving average of
// the last few samples instead. Everything here is a pure function of its
// inputs (no clock, no hidden state), so it stays trivially unit-testable and
// free of React.

/** One torrent's most recent samples, oldest first. */
export interface SpeedSamples {
  down: number[];
  up: number[];
}

/** Per-torrent sample history, keyed by torrent id. */
export type SpeedHistory = Record<number, SpeedSamples>;

/** How many samples the moving average spans (≈10s at the 2s refresh). */
export const SPEED_WINDOW = 5;

/** Append a sample, keeping only the most recent `window` values. */
export function pushSample(history: number[], value: number, window = SPEED_WINDOW): number[] {
  const span = Math.max(1, Math.floor(window));
  const next = [...history, value];
  return next.length > span ? next.slice(next.length - span) : next;
}

/** Mean of the samples; 0 for an empty list (nothing to show yet). */
export function average(history: number[]): number {
  if (history.length === 0) return 0;
  let sum = 0;
  for (const v of history) sum += v;
  return sum / history.length;
}

/** One torrent's raw rate for this poll, fed into the history. */
export interface SpeedReading {
  id: number;
  down: number;
  up: number;
}

/**
 * Fold a fresh list snapshot into the running histories. Ids absent from the
 * snapshot are dropped, so the history does not grow with torrents that are
 * gone. Pure: `prev` is never mutated.
 */
export function sampleSpeeds(
  prev: SpeedHistory,
  readings: SpeedReading[],
  window = SPEED_WINDOW,
): SpeedHistory {
  const next: SpeedHistory = {};
  for (const r of readings) {
    const before = prev[r.id] ?? { down: [], up: [] };
    next[r.id] = {
      down: pushSample(before.down, r.down, window),
      up: pushSample(before.up, r.up, window),
    };
  }
  return next;
}

/** The moving average to display for each id, ready for the table. */
export function averagedSpeeds(history: SpeedHistory): Map<number, { down: number; up: number }> {
  const out = new Map<number, { down: number; up: number }>();
  for (const [key, samples] of Object.entries(history)) {
    out.set(Number(key), { down: average(samples.down), up: average(samples.up) });
  }
  return out;
}
