/**
 * @typedef {import("../typings.js").EntityTransformerContextBase} EntityTransformerContextBase
 */

import { CLASS_PARAGRAPH_BREAK, TERMINATOR_WORD } from "../constants.js";
import { EntityTransformerBase } from "../model.js";

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
   * @readonly @param {import("../model.js").Glyph} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformGlyph(item, contextBase) {
    const element = item.element;
    if (item.element.classList.contains(CLASS_PARAGRAPH_BREAK)) {
      return;
    }

    // Do not inflate spaces or completed glyphs individually.
    if (
      item.metrics.endTimestamp !== null ||
      item.character === TERMINATOR_WORD
    ) {
      element.classList.remove(CLASS_INFLATING);
      element.style.fontSize = "";
      return;
    }

    // Calculate press duration:
    const pressDuration = Date.now() - item.metrics.startTimestamp;
    const scale = Math.min(
      pressDuration / INFLATION_BASELINE_MILLISECONDS,
      MAX_SCALE
    );

    // Apply font size to the glyph element:
    if (pressDuration > 0) {
      element.classList.add(CLASS_INFLATING);
      element.style.fontSize = `${scale}rem`;
    } else {
      element.classList.remove(CLASS_INFLATING);
      element.style.fontSize = "";
    }
  }

  /**
   * @readonly @param {import("../model.js").EntitySequence<"Word">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformWord(item, contextBase) {
    // Find the max press duration among all completed glyphs in the word:
    let maxPressDuration = 0;
    for (const glyph of item.items) {
      if (glyph.metrics.endTimestamp !== null) {
        // If released, use the time between start and end
        maxPressDuration = Math.max(
          maxPressDuration,
          glyph.metrics.endTimestamp - glyph.metrics.startTimestamp
        );
      }
    }

    // Calculate font size scaling based on the max press duration:
    const scale = Math.min(
      maxPressDuration / INFLATION_BASELINE_MILLISECONDS,
      MAX_SCALE
    );

    // Apply font size to the word element:
    if (maxPressDuration > 0) {
      item.element.classList.add(CLASS_INFLATING);
      item.element.style.fontSize = `${scale}rem`;
    } else {
      item.element.classList.remove(CLASS_INFLATING);
      item.element.style.fontSize = "";
    }

    // Apply per-glyph transformation for the last glyph:
    EntityTransformerBase.prototype.transformWord.call(this, item, contextBase);
  }
}
