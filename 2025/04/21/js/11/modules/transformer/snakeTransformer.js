/**
 * @typedef {import("../typings.js").EntityTransformerContextBase} EntityTransformerContextBase
 */

import { EntityTransformerBase } from "../model.js";

// Pixels per frame.
const MOVE_SPEED = 10;

// Spacing fudge factor (a perturbation of font size to make things look nicer
// for most texts).
const SPACING_FUDGE_FACTOR = 1.2;

/**
 * Transformer that creates a snake-like movement effect for paragraphs.
 *
 * Co-authored by AI, but required a lot of manual tweaking to get just right.
 *
 * @extends {EntityTransformerBase}
 */
export class SnakeTransformer extends EntityTransformerBase {
  /** @private @type {boolean} */
  gotMovement = false;

  /** @private @type {number | null} */
  headIndex = null;

  /** @private @type {{
    x: number;
    y: number;
  } | null} */
  headPosition = null;

  /** @private @type {{ x: number; y: number }[]} */
  pathHistory = [];

  /** @private @type {Map<HTMLElement, number>} */
  lastRotationForGlyph = new Map();

  /** @private @type {Record<number, {
      segmentStartIndex: number;
      segmentEndIndex: number;
      offsetFromHead: number;
      position: { x: number; y: number };
      rotation: number;
  }>} */
  pathRecordForGlyph = {};

  /** @private @type {number} */
  lastGlyphCount = 0;

  /** @private @type {Map<import("../model.js").EntitySequence<"Paragraph">, {
    gotMovement: boolean;
    headIndex: number | null;
    headPosition: { x: number; y: number } | null;
    pathHistory: { x: number; y: number }[];
    lastRotationForGlyph: Map<HTMLElement, number>;
    lastGlyphCount: number;
    pathRecordForGlyph: Record<number, {
      segmentStartIndex: number;
      segmentEndIndex: number;
      offsetFromHead: number;
      position: { x: number; y: number };
      rotation: number;
    }>;
  }>} */
  paragraphStateCache = new Map();

  /** @private @type {import("../model.js").EntitySequence<"Paragraph"> | null} */
  activeParagraph = null;

  /** @private @type {import("../model.js").EntitySequence<"Paragraph"> | null} */
  latestParagraph = null;

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
  updatePathHistoryForHead() {
    if (this.headPosition === null) {
      return;
    }
    // Update position based on keys:
    if (this.keys.up) {
      this.headPosition.y -= MOVE_SPEED;
      this.gotMovement = true;
    }
    if (this.keys.down) {
      this.headPosition.y += MOVE_SPEED;
      this.gotMovement = true;
    }
    if (this.keys.left) {
      this.headPosition.x -= MOVE_SPEED;
      this.gotMovement = true;
    }
    if (this.keys.right) {
      this.headPosition.x += MOVE_SPEED;
      this.gotMovement = true;
    }
    // Skip duplicate path points:
    if (
      this.pathHistory.length > 0 &&
      this.headPosition.x === this.pathHistory[this.pathHistory.length - 1].x &&
      this.headPosition.y === this.pathHistory[this.pathHistory.length - 1].y
    ) {
      return;
    }
    // Skip path points that are along the same line as the previous two points:
    if (this.pathHistory.length > 1) {
      const lastDx =
        this.pathHistory[this.pathHistory.length - 1].x -
        this.pathHistory[this.pathHistory.length - 2].x;
      const lastDy =
        this.pathHistory[this.pathHistory.length - 1].y -
        this.pathHistory[this.pathHistory.length - 2].y;
      const dx =
        this.headPosition.x - this.pathHistory[this.pathHistory.length - 1].x;
      const dy =
        this.headPosition.y - this.pathHistory[this.pathHistory.length - 1].y;
      if (dx === lastDx && dy === lastDy) {
        return;
      }
    }
    // Skip NaN values and try to recover (still not entirely clear when this
    // happens):)
    if (isNaN(this.headPosition.x) || isNaN(this.headPosition.y)) {
      this.headPosition =
        this.pathHistory.length > 0
          ? this.pathHistory[this.pathHistory.length - 1]
          : { x: 0, y: 0 };
    }
    this.pathHistory.push({ ...this.headPosition });
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
   * @returns {{
   *   segmentStartIndex: number;
   *   segmentEndIndex: number;
   *   offsetFromHead: number;
   *   position: { x: number; y: number };
   *   rotation: number;
   * }}
   */
  getPathRecordAtOffsetBackwardsFromHead(offset) {
    // Handle negative distances by projecting with the most recent points:
    if (offset <= 0) {
      if (this.pathHistory.length === 1) {
        // Augment the head's path along the X-axis if we only have one point.
        return {
          segmentStartIndex: 0,
          segmentEndIndex: 1,
          offsetFromHead: offset,
          position: {
            x: -offset,
            y: 0,
          },
          rotation: 0,
        };
      } else if (this.pathHistory.length > 1) {
        const p1 = this.pathHistory[this.pathHistory.length - 1];
        const p2 = this.pathHistory[this.pathHistory.length - 2];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const segmentLength = Math.sqrt(dx * dx + dy * dy);
        const t = offset / segmentLength || 0;
        return {
          segmentStartIndex: this.pathHistory.length - 2,
          segmentEndIndex: this.pathHistory.length - 1,
          offsetFromHead: offset,
          position: this.interpolate(t, p1, p2),
          rotation: Math.atan2(-dy, -dx),
        };
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
      if (accumulatedLength + segmentLength >= offset || i === 1) {
        const t = (offset - accumulatedLength) / segmentLength || 0;
        return {
          segmentStartIndex: i - 1,
          segmentEndIndex: i,
          offsetFromHead: offset,
          position: this.interpolate(t, p1, p2),
          rotation: Math.atan2(-dy, -dx),
        };
      }
      accumulatedLength += segmentLength;
    }

    // Not reachable:
    return {
      segmentStartIndex: 0,
      segmentEndIndex: 1,
      offsetFromHead: offset,
      position: {
        x: -(offset - accumulatedLength),
        y: 0,
      },
      rotation: 0,
    };
  }

  /**
   * @private
   * @param {import("../model.js").EntitySequence<"Paragraph">} paragraph
   */
  setActiveParagraph(paragraph) {
    if (paragraph !== this.activeParagraph) {
      // Save state for old paragraph:
      if (this.activeParagraph !== null) {
        this.paragraphStateCache.set(this.activeParagraph, {
          gotMovement: this.gotMovement,
          headIndex: this.headIndex,
          headPosition: this.headPosition,
          pathHistory: this.pathHistory,
          pathRecordForGlyph: this.pathRecordForGlyph,
          lastRotationForGlyph: this.lastRotationForGlyph,
          lastGlyphCount: this.lastGlyphCount,
        });
      }
      // Try to retrieve cached state for new paragraph (or reset state):
      const cachedState = this.paragraphStateCache.get(paragraph);
      if (this.paragraphStateCache.has(paragraph) && cachedState) {
        this.gotMovement = cachedState.gotMovement;
        this.headIndex = cachedState.headIndex;
        this.headPosition = cachedState.headPosition;
        this.pathHistory = cachedState.pathHistory;
        this.lastRotationForGlyph = cachedState.lastRotationForGlyph;
        this.pathRecordForGlyph = cachedState.pathRecordForGlyph;
        this.lastGlyphCount = cachedState.lastGlyphCount;
      } else {
        this.gotMovement = false;
        this.headIndex = null;
        this.headPosition = null;
        this.pathHistory = [];
        this.pathRecordForGlyph = {};
        this.lastRotationForGlyph = new Map();
        this.lastGlyphCount = 0;
      }
      this.activeParagraph = paragraph;
    }
  }

  /**
   * @readonly @param {import("../model.js").EntitySequence<"Container">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformContainer(item, contextBase) {
    // Set the latest paragraph:
    if (item.items.length > 0) {
      this.latestParagraph = item.items[item.items.length - 1];
    }
    EntityTransformerBase.prototype.transformContainer.call(
      this,
      item,
      contextBase
    );
  }

  /**
   * @private
   * @param {HTMLElement} element
   * @param {HTMLElement} headElement
   * @returns {{ x: number; y: number }}
   */
  getDeltaFromHeadReferenceFrame(element, headElement) {
    return {
      x:
        headElement.offsetLeft +
        headElement.getBoundingClientRect().width / 2 -
        (element.offsetLeft + element.getBoundingClientRect().width / 2),
      y:
        headElement.offsetTop +
        headElement.getBoundingClientRect().height / 2 -
        (element.offsetTop + element.getBoundingClientRect().height / 2),
    };
  }

  /**
   * @readonly @param {import("../model.js").EntitySequence<"Paragraph">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformParagraph(item, contextBase) {
    // Get all glyphs from all sentences in the paragraph:
    const glyphs = item.items.flatMap((sentence) =>
      sentence.items.flatMap((word) => word.items)
    );
    if (glyphs.length === 0) {
      return;
    }

    // By default, only handle the latest paragraph (but watch for changes in
    // previously completed paragraphs and handle them as necessary):
    let canMoveSnake = true;
    if (
      item !== this.latestParagraph &&
      glyphs.length !== this.lastGlyphCount
    ) {
      canMoveSnake = false;
    } else if (item !== this.latestParagraph) {
      return;
    }
    this.setActiveParagraph(item);

    // Handle deletion of an existing head:
    if (this.headIndex !== null && glyphs.length - 1 < this.headIndex) {
      this.headIndex = glyphs.length - 1;
      const { position, segmentEndIndex, offsetFromHead } =
        this.pathRecordForGlyph[this.headIndex];
      this.headPosition = { ...position };
      this.pathHistory[segmentEndIndex] = {
        ...this.headPosition,
      };
      // Transform everything into the reference frame of the new head's initial
      // position:
      this.headPosition.x += offsetFromHead;
      this.pathHistory.forEach((point) => {
        point.x += offsetFromHead;
      });
      // Prune path history from deleted glyphs:
      this.pathHistory = this.pathHistory.slice(0, segmentEndIndex + 1);
    }

    // Update head position and path history (or initialize as needed):
    if (this.headPosition === null || this.headIndex === null) {
      this.headIndex = glyphs.length - 1;
      this.headPosition = { x: 0, y: 0 };
    }
    if (canMoveSnake) {
      this.updatePathHistoryForHead();
    }

    // Calculate cumulative distances from the head to each glyph (assuming no
    // line wrapping and traveling towards the tail as the positive direction):
    const pathOffsetsFromHead = Array(glyphs.length).fill(0);
    let cumulativeDistance = 0;
    // From head to tail:
    for (let i = this.headIndex - 1; i >= 0; i--) {
      const element = glyphs[i].element;
      const previousElement = glyphs[i + 1].element;
      // Average the width of the current and previous glyphs to account for
      // transformations being relative to the centers of glyphs:
      cumulativeDistance +=
        (element.offsetWidth / 2 + previousElement.offsetWidth / 2) *
        SPACING_FUDGE_FACTOR;
      pathOffsetsFromHead[i] = cumulativeDistance;
    }
    cumulativeDistance = 0;
    // From head to potential new head:
    for (let i = this.headIndex; i < glyphs.length; i++) {
      const element = glyphs[i].element;
      const nextElement = glyphs[i + 1]?.element;
      pathOffsetsFromHead[i] = cumulativeDistance;
      // Average the width of the current and next glyphs to account for
      // transformations being relative to the centers of glyphs:
      cumulativeDistance -=
        (element.offsetWidth / 2 + (nextElement ?? element).offsetWidth / 2) *
        SPACING_FUDGE_FACTOR;
    }

    // Apply CSS translation to each glyph based on its path position:
    let minSegmentStartIndex = this.pathHistory.length - 1;
    this.pathRecordForGlyph = {};
    glyphs.forEach((glyph, index) => {
      const element = glyph.element;
      const offsetFromHead = pathOffsetsFromHead[index];
      const delta = this.getDeltaFromHeadReferenceFrame(
        element,
        glyphs[this.headIndex ?? 0].element
      );
      // Compute path position offset from the head (driver of the path):
      this.pathRecordForGlyph[index] =
        this.getPathRecordAtOffsetBackwardsFromHead(offsetFromHead);
      const {
        rotation: rotationRaw,
        position,
        segmentStartIndex,
      } = this.pathRecordForGlyph[index];
      minSegmentStartIndex = Math.min(minSegmentStartIndex, segmentStartIndex);

      // Don't translate anything until we have actual movement of the head:
      if (!this.gotMovement) {
        return;
      }

      // Use the shortest direction of rotation when animating between the last
      // rotation and the current rotation:
      const lastRotation = this.lastRotationForGlyph.get(element) || 0;
      const rotationNormalized =
        ((rotationRaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      // Get the origin angle of the last rotation, which is the nearest
      // multiple of `2 * Math.PI` below `lastRotation`:
      const lastRotationOrigin =
        Math.floor(lastRotation / (2 * Math.PI)) * (2 * Math.PI);
      // Add the normalized current rotation to the origin angle to produce a
      // candidate for the new rotation:
      const rotationCandidate = lastRotationOrigin + rotationNormalized;
      let rotation = rotationCandidate;
      // If the candidate rotation is more than 180 degrees away from the last
      // rotation, then we need to wrap around the circle in either the positive
      // or negative direction:
      if (Math.abs(rotationCandidate - lastRotation) > Math.PI) {
        rotation =
          rotationCandidate < lastRotation
            ? rotationCandidate + 2 * Math.PI
            : rotationCandidate - 2 * Math.PI;
      }
      this.lastRotationForGlyph.set(element, rotation);

      // Apply translation, subtracting the glyph's offset from the tail since
      // we treat the tail as the origin of the path (and reference point for
      // all relative distance calculations involving the path). Then apply
      // rotation from the new origin:
      element.style.transform = `translate(${position.x + delta.x}px, ${
        position.y + delta.y
      }px) rotate(${rotation}rad)`;
    });

    // Handle creation of a new head:
    if (pathOffsetsFromHead[pathOffsetsFromHead.length - 1] < 0) {
      this.headIndex = glyphs.length - 1;
      const { position, offsetFromHead } =
        this.pathRecordForGlyph[this.headIndex];
      this.headPosition = { ...position };
      this.updatePathHistoryForHead();
      // Transform everything into the reference frame of the new head's initial
      // position:
      this.headPosition.x += offsetFromHead;
      this.pathHistory.forEach((point) => {
        point.x += offsetFromHead;
      });
    }

    // Prune unused path history:
    this.pathHistory = this.pathHistory.slice(minSegmentStartIndex);
  }
}
