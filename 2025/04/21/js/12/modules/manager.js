/**
 * @typedef {import("./typings.js").EntityTransformerContextBase} EntityTransformerContextBase
 */

/**
 * @typedef {import("./typings.js").Entity} Entity
 */

/**
 * @typedef {import("./typings.js").EntityTransformer} EntityTransformer
 */

/**
 * @typedef {import("./typings.js").TagSequenceTypes} TagSequenceTypes
 */

/**
 * @template {TagSequenceTypes} Tag
 * @typedef {import("./typings.js").EntitySequence<Tag>} EntitySequence
 */

import {
  CLASS_CURRENT_GLYPH,
  TERMINATOR_PARAGRAPH,
  TERMINATOR_WORD,
  TERMINATORS_SENTENCE,
} from "./constants.js";
import { Container, Glyph, Paragraph, Sentence, Word } from "./model.js";

/**
 * Orchestrator class between key events and text entities.
 */
export class EntityManager {
  /** @private @type {{
    word: EntitySequence<"Word"> | null;
    sentence: EntitySequence<"Sentence"> | null;
    paragraph: EntitySequence<"Paragraph"> | null;
    container: EntitySequence<"Container">;
  }} */
  current;
  /** @private @type {HTMLSpanElement | null} */
  cursorPlaceholder;
  /** @private @type {EntityTransformer[]} */
  transformers;
  /** @private @type {{
    timeDelta: number;
    timeElapsed: number;
    lastFrameTime: number;
  }} */
  animationContext;
  /** @private @type {boolean} */
  isAnimating;

  /**
   * @param {HTMLDivElement} containerElement
   */
  constructor(containerElement) {
    // Current active nodes at each level:
    this.current = {
      word: null,
      sentence: null,
      paragraph: null,
      container: new Container(containerElement),
    };

    // Set initial placeholder glyph (used when we're between paragraphs):
    this.cursorPlaceholder = null;
    this.ensureCursor();

    // Transformers and animation context:
    this.transformers = [];
    this.animationContext = {
      timeDelta: 0,
      timeElapsed: 0,
      lastFrameTime: 0,
    };
    this.isAnimating = false;
  }

  /**
   * @private
   */
  ensureCursor() {
    if (this.cursorPlaceholder) {
      this.cursorPlaceholder.remove();
      this.cursorPlaceholder = null;
    }
    this.cursorPlaceholder = new Glyph("").element;
    this.cursorPlaceholder.classList.add(CLASS_CURRENT_GLYPH);
    this.current.word?.element.appendChild(this.cursorPlaceholder) ||
      this.current.sentence?.element.appendChild(this.cursorPlaceholder) ||
      this.current.paragraph?.element.appendChild(this.cursorPlaceholder) ||
      this.current.container?.element.appendChild(this.cursorPlaceholder);
  }

  backspace() {
    this.current.container.removeLastGlyphAndResumeNestedSequences();
    this.current.paragraph = this.current.container.getLastItem();
    this.current.sentence = this.current.paragraph?.getLastItem() || null;
    this.current.word = this.current.sentence?.getLastItem() || null;
    this.ensureCursor();
  }

  /**
   * @param {string} character
   */
  startGlyph(character) {
    // Map all whitespace characters to a non-breaking space HTML entity:
    if (character !== TERMINATOR_PARAGRAPH && character.trim() === "") {
      character = TERMINATOR_WORD;
    }

    // Ensure wrapping context exists to add the glyph to:
    this.ensureWord();

    // Create and add the glyph node (running any transformers before adding
    // the glyph to the DOM):
    const glyph = new Glyph(character);
    this.transform();
    this.current.word?.addItem(glyph);

    // Finish any appropriate wrapping contexts:
    if (character === TERMINATOR_PARAGRAPH) {
      this.finishParagraph(); // Includes finishing the sentence and word.
    } else if (TERMINATORS_SENTENCE.includes(character)) {
      this.finishSentence(); // Includes finishing the word.
    } else if (character === TERMINATOR_WORD) {
      this.finishWord();
    }

    // Ensure the cursor position is updated:
    this.ensureCursor();

    // Scroll the bottom of the container into view:
    this.current.container.element.scrollTo(
      0,
      this.current.container.element.scrollHeight
    );
    return glyph;
  }

  /**
   * @private
   */
  ensureWord() {
    if (this.current.word) {
      return;
    }

    this.ensureSentence();
    const word = new Word();
    this.current.sentence?.addItem(word);
    this.current.word = word;
  }

  /**
   * @private
   */
  ensureSentence() {
    if (this.current.sentence) {
      return;
    }

    this.ensureParagraph();
    const sentence = new Sentence();
    this.current.paragraph?.addItem(sentence);
    this.current.sentence = sentence;
  }

  /**
   * @private
   */
  ensureParagraph() {
    if (this.current.paragraph) {
      return;
    }

    const paragraph = new Paragraph();
    this.current.container.addItem(paragraph);
    this.current.paragraph = paragraph;
  }

  /**
   * @private
   */
  finishWord() {
    this.current.word?.finishGrouping();
    this.current.word = null;
  }

  /**
   * @private
   */
  finishSentence() {
    this.finishWord();
    this.current.sentence?.finishGrouping();
    this.current.sentence = null;
  }

  /**
   * @private
   */
  finishParagraph() {
    this.finishSentence();
    this.current.paragraph?.finishGrouping();
    this.current.paragraph = null;
  }

  /**
   * @private
   */
  transform() {
    this.transformers.forEach((transformer) =>
      this.current.container.transformWith(transformer, this.animationContext)
    );
  }

  /**
   * @param {EntityTransformer[]} transformers
   */
  syncTransformers(transformers) {
    this.transformers = transformers;
  }

  /**
   * @private
   * @param {number | undefined} [timestamp]
   */
  animate(timestamp) {
    // Update animation context:
    const now = timestamp || performance.now();
    this.animationContext.timeDelta = now - this.animationContext.lastFrameTime;
    this.animationContext.timeElapsed += this.animationContext.timeDelta;
    this.animationContext.lastFrameTime = now;

    // Apply transformations:
    this.transform();

    // Continue animation loop:
    if (this.isAnimating) {
      requestAnimationFrame(this.animate.bind(this));
    }
  }

  startAnimation() {
    if (this.isAnimating) {
      return;
    }

    this.isAnimating = true;
    this.animationContext.lastFrameTime = performance.now();
    this.animate();
  }

  stopAnimation() {
    this.isAnimating = false;
  }

  resetStyle() {
    this.current.container.resetStyle();
    this.ensureCursor();
  }
}
