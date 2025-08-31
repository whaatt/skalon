/**
 * @typedef {import("../typings.js").EntityTransformerContextBase} EntityTransformerContextBase
 */

import { CLASS_PARAGRAPH_BREAK, TERMINATOR_WORD } from "../constants.js";
import { EntityTransformerBase } from "../model.js";

const MAX_SCALE = 5;
const INFLATION_BASELINE_MILLISECONDS = 60;

/**
 * Transformer that handles glyph inflation during press interactions.
 *
 * @extends {EntityTransformerBase}
 */
export class GlyphInflationTransformer extends EntityTransformerBase {
  /** @private @type {number} */
  currentWordFontSize = 0;

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
    if (!item.getInProgress() || item.character === TERMINATOR_WORD) {
      element.style.fontSize = `${this.currentWordFontSize}rem`;
      return;
    }

    // Calculate press duration:
    const pressDuration = Date.now() - item.startTimestamp;
    const scale = Math.min(
      pressDuration / INFLATION_BASELINE_MILLISECONDS,
      MAX_SCALE
    );

    // Apply font size to the glyph element:
    if (pressDuration > 0) {
      element.style.fontSize = `${scale}rem`;
    } else {
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
      if (glyph.endTimestamp !== null) {
        // If released, use the time between start and end:
        maxPressDuration = Math.max(
          maxPressDuration,
          glyph.endTimestamp - glyph.startTimestamp
        );
      }
    }

    // Calculate default word-level scaling based on the max press duration:
    this.currentWordFontSize = Math.min(
      maxPressDuration / INFLATION_BASELINE_MILLISECONDS,
      MAX_SCALE
    );
    item.element.style.fontSize = `${this.currentWordFontSize}rem`;

    // Apply per-glyph transformation to propagate the calculated scaling:
    EntityTransformerBase.prototype.transformWord.call(this, item, contextBase);
  }
}
