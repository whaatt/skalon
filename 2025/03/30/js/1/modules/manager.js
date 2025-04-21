/**
 * @typedef {import("./typings").EntityTransformerContextBase} EntityTransformerContextBase
 */

/**
 * @template {EntityTransformerContextBase} Context
 * @typedef {import("./typings").EntityTransformer<any, Context>} EntityTransformer
 */

/**
 * @typedef {import("./typings").TagSequenceTypes} TagSequenceTypes
 */

/**
 * @template {TagSequenceTypes} Tag
 * @typedef {import("./typings").EntitySequence<Tag>} EntitySequence
 */

import {
  Container,
  Glyph,
  LINE_BREAK,
  Paragraph,
  Sentence,
  Word,
} from "./model.js";

const CLASS_CURRENT_GLYPH = "current-glyph";

export const TERMINATOR_PARAGRAPH = LINE_BREAK;
const TERMINATORS_SENTENCE = [".", "!", "?"];
const TERMINATOR_WORD = "&nbsp;";

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
  paragraphPlaceholder;
  /** @private @type {EntityTransformer<any>[]} */
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
    this.paragraphPlaceholder = null;
    this.enablePlaceholder();

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
  enablePlaceholder() {
    this.paragraphPlaceholder = new Glyph("").element;
    this.paragraphPlaceholder.classList.add(CLASS_CURRENT_GLYPH);
    this.current.container.element.appendChild(this.paragraphPlaceholder);
  }

  /**
   * @private
   */
  disablePlaceholder() {
    if (this.paragraphPlaceholder) {
      this.paragraphPlaceholder.remove();
      this.paragraphPlaceholder = null;
    }
  }

  backspace() {
    this.current.container.removeLastGlyphAndResumeNestedSequences();
    this.current.paragraph = this.current.container.getLastItem();
    this.current.sentence = this.current.paragraph?.getLastItem() || null;
    this.current.word = this.current.sentence?.getLastItem() || null;
    if (document.getElementsByClassName(CLASS_CURRENT_GLYPH).length === 0) {
      this.enablePlaceholder();
    }
  }

  /**
   * @param {string} character
   */
  startGlyph(character) {
    // Map all whitespace characters to a non-breaking space:
    if (character.trim() === "") {
      character = TERMINATOR_WORD;
    }

    // Map enter to a line break:
    if (character === "Enter") {
      character = TERMINATOR_PARAGRAPH;
    }

    // Ensure wrapping context exists:
    this.ensureWord();

    // Create and add the glyph node:
    const glyph = new Glyph(character);
    this.current.word?.addItem(glyph);

    // Update cursor position:
    Array.from(document.getElementsByClassName(CLASS_CURRENT_GLYPH)).forEach(
      (element) => element.classList.remove(CLASS_CURRENT_GLYPH)
    );
    glyph.element.classList.add(CLASS_CURRENT_GLYPH);

    // Finish any appropriate wrapping contexts:
    if (character === TERMINATOR_PARAGRAPH) {
      this.finishParagraph(); // Includes finishing the sentence and word.
    } else if (TERMINATORS_SENTENCE.includes(character)) {
      this.finishSentence(); // Includes finishing the word.
    } else if (character === TERMINATOR_WORD) {
      this.finishWord();
    }
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

    this.disablePlaceholder();
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
    this.enablePlaceholder();
  }

  /**
   * @private
   * @template {EntityTransformerContextBase} Context
   * @param {EntityTransformer<Context>} transformer
   * @param {Context} context
   */
  transformWith(transformer, context) {
    transformer.transform(this, context);
  }

  /**
   * @param {EntityTransformer<EntityTransformerContextBase>} transformer
   */
  addTransformer(transformer) {
    this.transformers.push(transformer);
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
    this.transformers.forEach((transformer) =>
      this.transformWith.bind(this, transformer)
    );

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
}
