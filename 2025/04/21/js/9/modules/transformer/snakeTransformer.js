/**
 * @typedef {import("../typings.js").EntityTransformerContextBase} EntityTransformerContextBase
 */

import { EntityTransformerBase } from "../model.js";

const MOVE_SPEED = 5; // Pixels per frame.
const PATH_HISTORY_LENGTH = 50; // Number of positions to remember.

/**
 * Transformer that creates a snake-like movement effect for paragraphs.
 *
 * @extends {EntityTransformerBase}
 */
export class SnakeTransformer extends EntityTransformerBase {
  /** @private @type {number} */
  lastHeadIndex = 0;

  /** @private @type {{
    x: number;
    y: number;
  }} */
  headPosition = { x: 0, y: 0 };

  /** @private @type {{
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  }} */
  keys = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  /** @private @type {import("../model.js").EntitySequence<"Paragraph"> | null} */
  latestParagraph = null;

  /** @private @type {{ x: number; y: number }[]} */
  pathHistory = [{ x: 0, y: 0 }];

  constructor() {
    super();
    // Set up key listeners
    window.addEventListener("keydown", this.handleKeyDown.bind(this));
    window.addEventListener("keyup", this.handleKeyUp.bind(this));
  }

  /**
   * @private
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    switch (event.key) {
      case "ArrowUp":
        this.keys.up = true;
        break;
      case "ArrowDown":
        this.keys.down = true;
        break;
      case "ArrowLeft":
        this.keys.left = true;
        break;
      case "ArrowRight":
        this.keys.right = true;
        break;
    }
  }

  /**
   * @private
   * @param {KeyboardEvent} event
   */
  handleKeyUp(event) {
    switch (event.key) {
      case "ArrowUp":
        this.keys.up = false;
        break;
      case "ArrowDown":
        this.keys.down = false;
        break;
      case "ArrowLeft":
        this.keys.left = false;
        break;
      case "ArrowRight":
        this.keys.right = false;
        break;
    }
  }

  /**
   * @private
   */
  updateHeadPosition() {
    // Update position based on keys
    if (this.keys.up) {
      this.headPosition.y -= MOVE_SPEED;
    }
    if (this.keys.down) {
      this.headPosition.y += MOVE_SPEED;
    }
    if (this.keys.left) {
      this.headPosition.x -= MOVE_SPEED;
    }
    if (this.keys.right) {
      this.headPosition.x += MOVE_SPEED;
    }
    if (
      this.headPosition.x === this.pathHistory[this.pathHistory.length - 1].x &&
      this.headPosition.y === this.pathHistory[this.pathHistory.length - 1].y
    ) {
      return;
    }
    this.pathHistory.push({ ...this.headPosition });
    if (this.pathHistory.length > PATH_HISTORY_LENGTH) {
      this.pathHistory.shift();
    }
  }

  /**
   * @private
   * @param {number} t Interpolation parameter (0 to 1).
   * @param {{ x: number; y: number }} p1 Start point.
   * @param {{ x: number; y: number }} p2 End point.
   * @returns {{ x: number; y: number }}
   */
  interpolate(t, p1, p2) {
    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
    };
  }

  /**
   * @private
   * @param {number} offset Offset along path going backwards from the head.
   * @returns {{ x: number; y: number }}
   */
  getPositionAtOffsetBackwardsFromHead(offset) {
    // Handle negative distances by projecting with the most recent points:
    if (offset <= 0) {
      if (this.pathHistory.length === 1) {
        // See note below regarding augmentation of the head's path along the
        // X-axis.
        return { x: -offset, y: 0 };
      } else if (this.pathHistory.length > 1) {
        const p1 = this.pathHistory[this.pathHistory.length - 1];
        const p2 = this.pathHistory[this.pathHistory.length - 2];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const segmentLength = Math.sqrt(dx * dx + dy * dy);
        const t = offset / segmentLength;
        return this.interpolate(t, p1, p2);
      }
    }

    // Find the segment where the offset falls:
    let accumulatedLength = 0;
    for (let i = this.pathHistory.length - 1; i >= 1; i--) {
      const p1 = this.pathHistory[i];
      const p2 = this.pathHistory[i - 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segmentLength = Math.sqrt(dx * dx + dy * dy);
      if (accumulatedLength + segmentLength >= offset) {
        const t = (offset - accumulatedLength) / segmentLength;
        return this.interpolate(t, p1, p2);
      }
      accumulatedLength += segmentLength;
    }

    // Augment the beginning of the head's path with the tail as a control
    // point (i.e. the X-axis):
    return { x: -(offset - accumulatedLength), y: 0 };
  }

  /**
   * @readonly @param {import("../model.js").EntitySequence<"Container">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformContainer(item, contextBase) {
    // Update latest paragraph
    if (item.items.length > 0) {
      const newLatestParagraph = item.items[item.items.length - 1];
      if (newLatestParagraph !== this.latestParagraph) {
        // Reset state for new paragraph:
        this.lastHeadIndex = 0;
        this.headPosition = { x: 0, y: 0 };
        this.pathHistory = [{ x: 0, y: 0 }];
        this.latestParagraph = newLatestParagraph;
      }
    }
    EntityTransformerBase.prototype.transformContainer.call(
      this,
      item,
      contextBase
    );
  }

  /**
   * @readonly @param {import("../model.js").EntitySequence<"Paragraph">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformParagraph(item, contextBase) {
    if (item !== this.latestParagraph) {
      return;
    }

    // Get all glyphs from all sentences in the paragraph:
    const glyphs = item.items.flatMap((sentence) =>
      sentence.items.flatMap((word) => word.items)
    );
    console.log(glyphs);
    if (glyphs.length === 0) {
      return;
    }

    // TODO: Save glyph translated positions so we can handle deletion of a head.

    // Calculate cumulative offsets from the head for each glyph (note that this
    // does not include the width of the head). Note also that the number of
    // glyphs may have changed, so some glyphs will have a negative offset with
    // respect to the head (used for getting position at some offset from the
    // head):
    let cumulativeWidth = 0;
    /** @type {number[]} */
    const glyphOffsetsFromHead = Array(glyphs.length).fill(0);
    for (let i = this.lastHeadIndex - 1; i >= 0; i--) {
      cumulativeWidth += glyphs[i].element.getBoundingClientRect().width;
      glyphOffsetsFromHead[i] = cumulativeWidth;
    }
    cumulativeWidth = 0;
    for (let i = this.lastHeadIndex + 1; i < glyphs.length; i++) {
      cumulativeWidth -= glyphs[i - 1].element.getBoundingClientRect().width;
      glyphOffsetsFromHead[i] = cumulativeWidth;
    }

    // Update head position and path history based on keys:
    this.updateHeadPosition();

    // Apply transforms to each glyph:
    glyphs.forEach((glyph, index) => {
      const element = glyph.element;
      const offsetFromHead = glyphOffsetsFromHead[index];

      // Compute path position offset from the head (driver of the path):
      const position =
        this.getPositionAtOffsetBackwardsFromHead(offsetFromHead);

      // Apply translation, subtracting the glyph's offset from the tail since
      // we treat the tail as the origin of the path (and reference point for
      // all relative distance calculations involving the path):
      element.style.transform = `translate(${position.x + offsetFromHead}px, ${
        position.y
      }px)`;
    });

    // Handle creation of a new head:
    if (glyphOffsetsFromHead[glyphOffsetsFromHead.length - 1] < 0) {
      this.lastHeadIndex = glyphs.length - 1;
      this.headPosition = this.getPositionAtOffsetBackwardsFromHead(
        glyphOffsetsFromHead[glyphs.length - 1]
      );
      this.pathHistory[this.pathHistory.length - 1] = { ...this.headPosition };
    }
  }
}
