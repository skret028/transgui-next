// Where the two pane dividers were left.
//
// The original has a TSplitter for the filter pane's width and one for the
// details pane's height, and remembers both. A pane that has been dragged must
// not be able to vanish or to swallow the window, so a size is held inside its
// bounds wherever it comes from: a drag now, or a saved value from a smaller
// window, a different screen, or a hand-edited settings file.

export interface PaneBounds {
  min: number;
  max: number;
}

/** The filter pane sits on the left of the list. */
export const FILTER_PANE: PaneBounds = { min: 120, max: 460 };
/** The details pane sits under the list. */
export const DETAILS_PANE: PaneBounds = { min: 60, max: 700 };

export const DEFAULT_FILTER_WIDTH = 186;
export const DEFAULT_DETAILS_HEIGHT = 280;

/** Hold a pane size inside its bounds, in whole pixels. */
export function clampPane(value: number, bounds: PaneBounds): number {
  if (!Number.isFinite(value)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * How far the details pane may be dragged on a window this tall: the list keeps
 * room to show a few rows even when the pane is dragged as far as it goes.
 */
export function detailsCeiling(windowHeight: number, reserved: number): number {
  return clampPane(windowHeight - reserved, DETAILS_PANE);
}
