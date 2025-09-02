/*
 * App entry (global state and event listeners).
 */

import { contentElement, downloadElement } from "./modules/constants.js";
import { mouseState, resetSimulation } from "./modules/simulation.js";

/**
 * Debounce time for resetting the layout and simulation on resize.
 *
 * @type {number}
 */
const DEBOUNCE_TIME_MILLISECONDS = 150;

/** @type {number | undefined} */
let resetOnResizeDebounceTimer = undefined;

// Track mouse in page coordinates (later converted to canvas space).
window.addEventListener("pointermove", (event) => {
  mouseState.x = event.clientX;
  mouseState.y = event.clientY;
  mouseState.active = true;
});
window.addEventListener("pointerleave", () => {
  mouseState.active = false;
});

/**
 * Handles pointer down (coloring the download button).
 *
 * @param {PointerEvent} event
 */
const handlePointerDown = (event) => {
  const target = /** @type {EventTarget} */ (event.target);
  if (!(target instanceof Element)) {
    return;
  }
  // Allow clicks outside content to trigger download button flash (except on
  // touch devices).
  if (!contentElement.contains(target) && event.pointerType !== "touch") {
    downloadElement.classList.add("flash");
    // Keep this duration in sync with the `flash` animation in CSS.
    setTimeout(() => {
      downloadElement.classList.remove("flash");
    }, 500);
  }
};
window.addEventListener("pointerdown", handlePointerDown);

// Run reset on first load.
resetSimulation();

// Run reset on resize.
window.addEventListener("resize", () => {
  if (resetOnResizeDebounceTimer !== undefined) {
    clearTimeout(resetOnResizeDebounceTimer);
  }
  // Debounce reset until the resize settles a bit.
  resetOnResizeDebounceTimer = setTimeout(() => {
    resetSimulation();
    resetOnResizeDebounceTimer = undefined;
  }, DEBOUNCE_TIME_MILLISECONDS);
});
