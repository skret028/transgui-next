// Pane sizes: the bounds a divider is held inside, wherever the size came from.
import {
  clampPane,
  detailsCeiling,
  DEFAULT_DETAILS_HEIGHT,
  DEFAULT_FILTER_WIDTH,
  DETAILS_PANE,
  FILTER_PANE,
} from "../src/splitSizes.ts";

let n = 0;
function check(what: string, ok: boolean, detail = "") {
  n++;
  if (!ok) {
    console.error(`FAIL ${what} ${detail}`);
    process.exit(1);
  }
}

// A drag inside the bounds is taken as it is.
check("a size in range is kept", clampPane(200, FILTER_PANE) === 200);

// A drag past either end stops at the end: the pane can never be dragged away
// or made to cover the window.
check("a size below the minimum stops there", clampPane(10, FILTER_PANE) === FILTER_PANE.min);
check("a size above the maximum stops there", clampPane(9000, DETAILS_PANE) === DETAILS_PANE.max);

// Sizes arrive as fractions of a pixel from a pointer, and are stored as whole
// ones.
check("a size is rounded", clampPane(199.6, FILTER_PANE) === 200, String(clampPane(199.6, FILTER_PANE)));

// A missing or unusable saved value must not leave a pane at zero width.
check("NaN falls back to the minimum", clampPane(NaN, DETAILS_PANE) === DETAILS_PANE.min);
check("Infinity falls back to the minimum", clampPane(Infinity, DETAILS_PANE) === DETAILS_PANE.min);

// The details pane stops short of the window's own height so the list keeps
// room; on a tall window that means its own maximum.
check("a tall window allows the full maximum", detailsCeiling(1400, 220) === DETAILS_PANE.max);
check(
  "a short window leaves room for the list",
  detailsCeiling(500, 220) === 280,
  String(detailsCeiling(500, 220)),
);
check("a very short window still leaves the minimum", detailsCeiling(100, 220) === DETAILS_PANE.min);

// The defaults the app starts with have to be legal, or a fresh install would
// open with a pane already outside its bounds.
check("the default filter width is inside its bounds", clampPane(DEFAULT_FILTER_WIDTH, FILTER_PANE) === DEFAULT_FILTER_WIDTH);
check(
  "the default details height is inside its bounds",
  clampPane(DEFAULT_DETAILS_HEIGHT, DETAILS_PANE) === DEFAULT_DETAILS_HEIGHT,
);

console.log(`splitSizes: ${n} assertions passed`);
