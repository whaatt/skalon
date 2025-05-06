/**
 * @typedef {import("../typings.js").EntityTransformerContextBase} EntityTransformerContextBase
 */

import { EntityTransformerBase } from "../model.js";

// Color mapping based on interval ranges (in milliseconds).
const INTERVAL_COLORS = {
  FAST: { h: 0, s: 90, l: 40 }, // Deep red for very fast typing.
  MEDIUM: { h: 120, s: 90, l: 35 }, // Deep green for medium typing.
  SLOW: { h: 240, s: 85, l: 45 }, // Lighter blue for slow, deliberate typing.
};

// Interval thresholds (in milliseconds).
const INTERVAL_THRESHOLDS = {
  FAST: 75, // Very fast typing (< 75 milliseconds between glyphs).
  MEDIUM: 200, // Medium typing (75-200 milliseconds between glyphs).
  SLOW: 500, // Slow typing (> 200 milliseconds between glyphs).
};

// Number of recent intervals to consider for the average.
const AVERAGE_WINDOW_SIZE = 5;

// Maximum age of intervals to consider (in milliseconds).
const MAX_INTERVAL_AGE = 2000; // 2 seconds.

/**
 * Transformer that colorizes glyphs based on typing speed intervals.
 *
 * Co-authored by AI!
 *
 * @extends {EntityTransformerBase}
 */
export class GlyphIntervalColorizer extends EntityTransformerBase {
  /** @private @type {{
    interval: number;
    startTime: number;
    endTime: number;
  }[]} */
  recentIntervals = [];

  /** @private @type {number|null} */
  lastGlyphStartTime = null;

  /**
   * @private
   * @param {number} interval
   * @returns {string}
   */
  getColorForInterval(interval) {
    if (interval <= INTERVAL_THRESHOLDS.FAST) {
      return `hsl(${INTERVAL_COLORS.FAST.h}, ${INTERVAL_COLORS.FAST.s}%, ${INTERVAL_COLORS.FAST.l}%)`;
    } else if (interval <= INTERVAL_THRESHOLDS.MEDIUM) {
      // Interpolate between `FAST` and `MEDIUM`.
      const t =
        (interval - INTERVAL_THRESHOLDS.FAST) /
        (INTERVAL_THRESHOLDS.MEDIUM - INTERVAL_THRESHOLDS.FAST);
      const h =
        INTERVAL_COLORS.FAST.h +
        (INTERVAL_COLORS.MEDIUM.h - INTERVAL_COLORS.FAST.h) * t;
      const s =
        INTERVAL_COLORS.FAST.s +
        (INTERVAL_COLORS.MEDIUM.s - INTERVAL_COLORS.FAST.s) * t;
      const l =
        INTERVAL_COLORS.FAST.l +
        (INTERVAL_COLORS.MEDIUM.l - INTERVAL_COLORS.FAST.l) * t;
      return `hsl(${h}, ${s}%, ${l}%)`;
    } else {
      // Interpolate between `MEDIUM` and `SLOW`.
      const t = Math.min(
        1,
        (interval - INTERVAL_THRESHOLDS.MEDIUM) /
          (INTERVAL_THRESHOLDS.SLOW - INTERVAL_THRESHOLDS.MEDIUM)
      );
      const h =
        INTERVAL_COLORS.MEDIUM.h +
        (INTERVAL_COLORS.SLOW.h - INTERVAL_COLORS.MEDIUM.h) * t;
      const s =
        INTERVAL_COLORS.MEDIUM.s +
        (INTERVAL_COLORS.SLOW.s - INTERVAL_COLORS.MEDIUM.s) * t;
      const l =
        INTERVAL_COLORS.MEDIUM.l +
        (INTERVAL_COLORS.SLOW.l - INTERVAL_COLORS.MEDIUM.l) * t;
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }

  /**
   * @private
   * @param {number} currentGlyphStartTime
   * @returns {number}
   */
  calculateAverageInterval(currentGlyphStartTime) {
    // Filter out intervals that are too old relative to the current glyph's
    // start time.
    const recentValidIntervals = this.recentIntervals.filter(
      (item) => currentGlyphStartTime - item.endTime < MAX_INTERVAL_AGE
    );

    // If we have no valid intervals, return a default value.
    if (recentValidIntervals.length === 0) {
      return INTERVAL_THRESHOLDS.SLOW;
    }

    // Calculate the average of valid intervals.
    const sum = recentValidIntervals.reduce(
      (total, item) => total + item.interval,
      0
    );
    return sum / recentValidIntervals.length;
  }

  /**
   * @readonly @param {import("../model.js").Glyph} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformGlyph(item, contextBase) {
    // Skip if the glyph hasn't been completed yet.
    if (item.endTimestamp === null) {
      return;
    }

    // Calculate the interval between this glyph and the previous one.
    const interval =
      this.lastGlyphStartTime !== null
        ? item.startTimestamp - this.lastGlyphStartTime
        : INTERVAL_THRESHOLDS.MEDIUM; // Default to medium speed

    // Add the interval with its timestamps.
    this.recentIntervals.push({
      interval,
      startTime: item.startTimestamp,
      endTime: item.endTimestamp,
    });

    // Keep only the most recent intervals up to the window size.
    while (this.recentIntervals.length > AVERAGE_WINDOW_SIZE) {
      this.recentIntervals.shift();
    }

    // Update the last glyph start time.
    this.lastGlyphStartTime = item.startTimestamp;

    // Calculate the average interval, considering only recent valid intervals
    // relative to this glyph's start time.
    const averageInterval = this.calculateAverageInterval(item.startTimestamp);

    // Apply color based on the average interval.
    const color = this.getColorForInterval(averageInterval);
    item.element.style.color = color;
  }

  /**
   * @readonly @param {import("../model.js").EntitySequence<"Container">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformContainer(item, contextBase) {
    // Clear the intervals array and last glyph start time when starting a new
    // container transformation.
    this.recentIntervals = [];
    this.lastGlyphStartTime = null;

    // Continue with standard recursive container transformation.
    EntityTransformerBase.prototype.transformContainer.call(
      this,
      item,
      contextBase
    );
  }
}
