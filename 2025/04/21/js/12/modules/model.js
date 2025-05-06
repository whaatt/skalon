/**
 * @typedef {import("./typings.js").TagGlyph} TagGlyph
 * @typedef {import("./typings.js").TagWord} TagWord
 * @typedef {import("./typings.js").TagSentence} TagSentence
 * @typedef {import("./typings.js").TagParagraph} TagParagraph
 * @typedef {import("./typings.js").TagContainer} TagContainer
 */

import {
  CLASS_PARAGRAPH_BREAK,
  CLASS_TEXT_GLYPH,
  CLASS_TEXT_INLINE_WRAPPER,
  CLASS_TEXT_WORD,
  TERMINATOR_PARAGRAPH,
} from "./constants.js";

/**
 * @typedef {import("./typings.js").TagTypes} TagTypes
 */

/**
 * @typedef {import("./typings.js").TagSequenceTypes} TagSequenceTypes
 */

/**
 * @typedef {import("./typings.js").EntityAtomic} EntityAtomic
 */

/**
 * @typedef {import("./typings.js").EntitySequences} EntitySequences
 */

/**
 * @typedef {import("./typings.js").Entity} Entity
 */

/**
 * @template {TagTypes} Tag
 * @typedef {import("./typings.js").EntityOf<Tag>} EntityOf
 */

/**
 * @template {TagSequenceTypes} Tag
 * @typedef {import("./typings.js").ItemsOf<Tag>} ItemsOf
 */

/**
 * @template {TagSequenceTypes} Tag
 * @typedef {import("./typings.js").EntitySequence<Tag>} EntitySequence
 */

/**
 * @typedef {import("./typings.js").EntityTransformerContextBase} EntityTransformerContextBase
 */

/**
 * @typedef {import("./typings.js").EntityTransformer} EntityTransformer
 */

/**
 * @abstract
 * @class
 * @implements {EntityTransformer}
 */
export class EntityTransformerBase {
  /**
   * @readonly @param {EntityAtomic} item
   * @readonly @param {EntityTransformerContextBase} contextBase
   */
  transformGlyph(item, contextBase) {}

  /**
   * @readonly @param {EntitySequence<"Word">} item
   * @readonly @param {EntityTransformerContextBase} contextBase
   */
  transformWord(item, contextBase) {
    item.items.forEach((item) => this.transform(item, contextBase));
  }

  /**
   * @readonly @param {EntitySequence<"Sentence">} item
   * @readonly @param {EntityTransformerContextBase} contextBase
   */
  transformSentence(item, contextBase) {
    item.items.forEach((item) => this.transform(item, contextBase));
  }

  /**
   * @readonly @param {EntitySequence<"Paragraph">} item
   * @readonly @param {EntityTransformerContextBase} contextBase
   */
  transformParagraph(item, contextBase) {
    item.items.forEach((item) => this.transform(item, contextBase));
  }

  /**
   * @readonly @param {EntitySequence<"Container">} item
   * @readonly @param {EntityTransformerContextBase} contextBase
   */
  transformContainer(item, contextBase) {
    item.items.forEach((item) => this.transform(item, contextBase));
  }

  /**
   * @template {Entity} Item
   * @param {Item} item
   * @readonly @param {EntityTransformerContextBase} contextBase
   */
  transform(item, contextBase) {
    switch (item.tag) {
      case "Glyph":
        this.transformGlyph(item, contextBase);
        break;
      case "Word":
        this.transformWord(item, contextBase);
        break;
      case "Sentence":
        this.transformSentence(item, contextBase);
        break;
      case "Paragraph":
        this.transformParagraph(item, contextBase);
        break;
      case "Container":
        this.transformContainer(item, contextBase);
    }
  }
}

/**
 * A glyph is a single typed character.
 *
 * @class
 * @implements {EntityAtomic}
 */
export class Glyph {
  /** @type {TagGlyph} */
  tag = "Glyph";
  /** @type {false} */
  isSequence = false;
  /** @type {string} */
  character;
  /** @type {boolean} */
  shouldIgnoreForMetrics;
  /** @type {number} */
  startTimestamp;
  /** @type {number | null} */
  endTimestamp;
  /** @type {HTMLDivElement} */
  element;

  /**
   * @param {string} character
   */
  constructor(character, shouldIgnoreForMetrics = false) {
    this.character = character;
    this.shouldIgnoreForMetrics = shouldIgnoreForMetrics;
    this.startTimestamp = Date.now();
    this.endTimestamp = null;
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_TEXT_GLYPH);
    if (character === TERMINATOR_PARAGRAPH) {
      this.element.classList.add(CLASS_PARAGRAPH_BREAK);
      character = "&nbsp;";
    }
    this.element.innerHTML = character;
  }

  resetStyle() {
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_TEXT_GLYPH);
    let characterValue = this.character;
    if (this.character === TERMINATOR_PARAGRAPH) {
      this.element.classList.add(CLASS_PARAGRAPH_BREAK);
      characterValue = "&nbsp;";
    }
    this.element.innerHTML = characterValue;
  }

  /**
   * @returns {number}
   */
  getDuration() {
    if (this.startTimestamp === null) {
      return 0;
    }

    if (this.endTimestamp === null) {
      return Date.now() - this.startTimestamp;
    }

    return this.endTimestamp - this.startTimestamp;
  }

  getInProgress() {
    return this.endTimestamp === null;
  }

  release() {
    this.endTimestamp = Date.now();
  }

  /**
   * @param {EntityTransformer} transformer
   * @param {EntityTransformerContextBase} contextBase
   */
  transformWith(transformer, contextBase) {
    transformer.transform(this, contextBase);
  }
}

/**
 * @abstract
 * @class
 * @template {TagSequenceTypes} Tag
 */
class EntitySequenceGeneric {
  /** @type {Tag} */
  tag;
  /** @type {true} */
  isSequence = true;
  /** @type {ItemsOf<Tag>[]} */
  items;
  /** @type {number} */
  startTimestamp;
  /** @type {number | null} */
  endTimestamp;
  /** @type {{
    averageGlyphInterval: number | null;
  }} */
  metrics;
  /**
   * @abstract
   * @type {HTMLDivElement}
   */
  element;

  /**
   * @param {Tag} tag
   */
  constructor(tag, shouldIgnoreForMetrics = false) {
    this.tag = tag;
    this.items = [];
    this.shouldIgnoreForMetrics = shouldIgnoreForMetrics;
    this.startTimestamp = Date.now();
    this.endTimestamp = null;
    this.metrics = {
      averageGlyphInterval: null,
    };
    this.element = document.createElement("div");
  }

  /**
   * @abstract
   */
  resetStyle() {
    this.element.innerHTML = "";
    this.items.forEach((item) => {
      item.resetStyle();
      this.element.appendChild(item.element);
    });
  }

  /**
   * @returns {number}
   */
  getDuration() {
    if (this.startTimestamp === null) {
      return 0;
    }

    if (this.endTimestamp === null) {
      return Date.now() - this.startTimestamp;
    }

    return this.endTimestamp - this.startTimestamp;
  }

  getInProgress() {
    return this.endTimestamp === null;
  }

  /**
   * @param {ItemsOf<Tag>} item
   */
  addItem(item, forceWhileFinished = false) {
    if (!this.getInProgress() && !forceWhileFinished) {
      return;
    }
    if (this.items.length === 0) {
      this.startTimestamp = item.startTimestamp;
    }
    this.items.push(item);
    this.element.appendChild(item.element);
    this.updateMetrics();
  }

  /**
   * @returns {ItemsOf<Tag> | null}
   */
  getLastItem() {
    if (this.items.length === 0) {
      return null;
    }
    return this.items[this.items.length - 1];
  }

  /**
   * @returns {boolean}
   */
  removeLastGlyphAndResumeNestedSequences(forceWhileFinished = false) {
    if (!this.getInProgress() && !forceWhileFinished) {
      return false;
    }
    if (this.items.length === 0) {
      return false;
    }

    // Resume last item(s) recursively and find a trailing glyph to remove:
    while (this.items.length > 0) {
      const previousItem = this.items[this.items.length - 1];
      if (previousItem.tag === "Glyph") {
        this.element.removeChild(previousItem.element);
        this.items.pop();
        this.updateMetrics();
        this.resumeGrouping();
        return true;
      }

      // TODO: Figure out why TS is not narrowing `previousItem` properly.
      const previousItemSequence = /** @type{EntitySequences} */ (previousItem);
      previousItemSequence.resumeGrouping();
      if (previousItemSequence.removeLastGlyphAndResumeNestedSequences()) {
        this.resumeGrouping();
        return true;
      }

      this.element.removeChild(previousItem.element);
      this.items.pop();
    }

    // No previous item to resume and recurse on:
    this.updateMetrics();
    this.resumeGrouping();
    return false;
  }

  updateMetrics() {
    let totalIntervals = 0;
    let totalIntervalsCount = 0;
    for (let i = 1; i < this.items.length; i++) {
      if (this.items[i].shouldIgnoreForMetrics) {
        continue;
      }
      if (this.items[i - 1].shouldIgnoreForMetrics) {
        continue;
      }
      totalIntervals +=
        this.items[i].startTimestamp - this.items[i - 1].startTimestamp;
      totalIntervalsCount++;
    }
    this.metrics.averageGlyphInterval =
      totalIntervalsCount > 0 ? totalIntervals / totalIntervalsCount : null;
  }

  finishGrouping() {
    if (!this.getInProgress()) {
      return;
    }
    this.endTimestamp = Date.now();
  }

  resumeGrouping() {
    if (this.getInProgress()) {
      return;
    }
    this.endTimestamp = null;
  }

  /**
   * @param {EntityTransformer} transformer
   * @param {EntityTransformerContextBase} contextBase
   */
  transformWith(transformer, contextBase) {
    transformer.transform(/** @type {Entity} */ (this), contextBase);
  }
}

/**
 * Hacky way to have EntitySequenceGeneric implement a union type and be
 * constrained properly in its implementation.
 *
 * @type {new (...args: any[]) => EntitySequences}
 */
const constrainEntitySequenceGeneric = EntitySequenceGeneric;

const /** @type{`entity-${Lowercase<TagWord>}`} */ CLASS_ENTITY_WORD =
    "entity-word";
const /** @type{`entity-${Lowercase<TagSentence>}`} */ CLASS_ENTITY_SENTENCE =
    "entity-sentence";
const /** @type{`entity-${Lowercase<TagParagraph>}`} */ CLASS_ENTITY_PARAGRAPH =
    "entity-paragraph";
const /** @type{`entity-${Lowercase<TagContainer>}`} */ CLASS_ENTITY_CONTAINER =
    "entity-container";

/**
 * @extends {EntitySequenceGeneric<"Word">}
 */
class Word extends EntitySequenceGeneric {
  /** @type {HTMLDivElement} */
  element;

  constructor() {
    super("Word");
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_ENTITY_WORD);
    this.element.classList.add(CLASS_TEXT_WORD);
  }

  resetStyle() {
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_ENTITY_WORD);
    this.element.classList.add(CLASS_TEXT_WORD);
    super.resetStyle();
  }
}

/**
 * @extends {EntitySequenceGeneric<"Sentence">}
 */
class Sentence extends EntitySequenceGeneric {
  /** @type {HTMLDivElement} */
  element;

  constructor() {
    super("Sentence");
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_ENTITY_SENTENCE);
    this.element.classList.add(CLASS_TEXT_INLINE_WRAPPER);
  }

  resetStyle() {
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_ENTITY_SENTENCE);
    this.element.classList.add(CLASS_TEXT_INLINE_WRAPPER);
    super.resetStyle();
  }
}

/**
 * @extends {EntitySequenceGeneric<"Paragraph">}
 */
class Paragraph extends EntitySequenceGeneric {
  /** @type {HTMLDivElement} */
  element;

  constructor() {
    super("Paragraph");
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_ENTITY_PARAGRAPH);
  }

  resetStyle() {
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_ENTITY_PARAGRAPH);
    super.resetStyle();
  }
}

/**
 * @extends {EntitySequenceGeneric<"Container">}
 */
class Container extends EntitySequenceGeneric {
  /** @type {HTMLDivElement} */
  element;

  constructor(containerElement = document.createElement("div")) {
    super("Container");
    this.element = containerElement;
    this.element.classList.add(CLASS_ENTITY_CONTAINER);
  }

  resetStyle() {
    // Do not recreate the element since we're at the root of the hierarchy.
    this.element.style.cssText = "";
    super.resetStyle();
  }
}

// Ugly typecasting to export individual entity classes in terms of their common
// public interface.
const /** @type{new (...args: any[]) => EntitySequence<"Word">} */ WordExport =
    Word;
const /** @type{new (...args: any[]) => EntitySequence<"Sentence">} */ SentenceExport =
    Sentence;
const /** @type{new (...args: any[]) => EntitySequence<"Paragraph">} */ ParagraphExport =
    Paragraph;
const /** @type{new (...args: any[]) => EntitySequence<"Container">} */ ContainerExport =
    Container;

export {
  ContainerExport as Container,
  ParagraphExport as Paragraph,
  SentenceExport as Sentence,
  WordExport as Word,
};
