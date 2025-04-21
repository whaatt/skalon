/**
 * @typedef {import("./typings").EntityTransformerContextBase} EntityTransformerContextBase
 */

/**
 * @typedef {import("./typings").EntityTransformer} EntityTransformer
 */

import { CLASS_PARAGRAPH_BREAK, EntityTransformerBase } from "./model.js";

const CLASS_INFLATING = "glyph-inflating";
const MAX_SCALE = 5;
const INFLATION_BASELINE_MILLISECONDS = 60;

/**
 * Transformer that handles glyph inflation during press interactions.
 *
 * @extends {EntityTransformerBase}
 */
export class GlyphInflationTransformer extends EntityTransformerBase {
  /**
   * @readonly @param {import("./model").Glyph} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformGlyph(item, contextBase) {
    const element = item.element;
    if (item.element.classList.contains(CLASS_PARAGRAPH_BREAK)) {
      return;
    }

    // Calculate press duration:
    let pressDuration;
    if (item.metrics.endTimestamp !== null) {
      // If released, use the time between start and end.
      pressDuration = item.metrics.endTimestamp - item.metrics.startTimestamp;
    } else {
      // If still being pressed, use time since start.
      pressDuration = Date.now() - item.metrics.startTimestamp;
    }

    // Calculate font size scaling based on press duration:
    const scale = Math.min(
      pressDuration / INFLATION_BASELINE_MILLISECONDS,
      MAX_SCALE
    );

    // Apply font size:
    if (pressDuration > 0) {
      element.classList.add(CLASS_INFLATING);
      element.style.fontSize = `${scale}em`;
    } else {
      element.classList.remove(CLASS_INFLATING);
      element.style.fontSize = "";
    }
  }
}
