/**
 * @typedef {import("./typings").TagGlyph} TagGlyph
 * @typedef {import("./typings").TagWord} TagWord
 * @typedef {import("./typings").TagSentence} TagSentence
 * @typedef {import("./typings").TagParagraph} TagParagraph
 * @typedef {import("./typings").TagContainer} TagContainer
 */

/**
 * @typedef {import("./typings").TagTypes} TagTypes
 */

/**
 * @typedef {import("./typings").TagSequenceTypes} TagSequenceTypes
 */

/**
 * @typedef {import("./typings").EntityAtomic} EntityAtomic
 */

/**
 * @typedef {import("./typings").EntitySequences} EntitySequences
 */

/**
 * @typedef {import("./typings").Entity} Entity
 */

/**
 * @template {TagTypes} Tag
 * @typedef {import("./typings").EntityOf<Tag>} EntityOf
 */

/**
 * @template {TagSequenceTypes} Tag
 * @typedef {import("./typings").ItemsOf<Tag>} ItemsOf
 */

/**
 * @template {TagSequenceTypes} Tag
 * @typedef {import("./typings").EntitySequence<Tag>} EntitySequence
 */

/**
 * @typedef {import("./typings").EntityTransformerContextBase} EntityTransformerContextBase
 */

/**
 * @typedef {import("./typings").EntityTransformer} EntityTransformer
 */

export const PARAGRAPH_BREAK = "\n";
const CLASS_INLINE = "text-inline";
export const CLASS_PARAGRAPH_BREAK = "text-paragraph-break";

/**
 * @abstract
 * @class
 * @implements {EntityTransformer}
 */
export class EntityTransformerBase {
  /**
   * @readonly @param {EntityAtomic} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformGlyph(item, contextBase) {}

  /**
   * @readonly @param {EntitySequence<"Word">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformWord(item, contextBase) {
    item.items.forEach((item) => this.transform(item, contextBase));
  }

  /**
   * @readonly @param {EntitySequence<"Sentence">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformSentence(item, contextBase) {
    item.items.forEach((item) => this.transform(item, contextBase));
  }

  /**
   * @readonly @param {EntitySequence<"Paragraph">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformParagraph(item, contextBase) {
    item.items.forEach((item) => this.transform(item, contextBase));
  }

  /**
   * @readonly @param {EntitySequence<"Container">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformContainer(item, contextBase) {
    item.items.forEach((item) => this.transform(item, contextBase));
  }

  /**
   * @template {Entity} Item
   * @param {Item} item
   * @param {EntityTransformerContextBase} contextBase
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
  /** @type {{
    startTimestamp: number;
    endTimestamp: number | null;
    groupPosition: [number, number] | null;
  }} */
  metrics;
  /** @type {HTMLSpanElement} */
  element;

  /**
   * @param {string} character
   */
  constructor(character) {
    this.character = character;
    this.metrics = {
      startTimestamp: Date.now(),
      endTimestamp: null,
      groupPosition: null,
    };
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_INLINE);
    if (character === PARAGRAPH_BREAK) {
      this.element.classList.add(CLASS_PARAGRAPH_BREAK);
      character = "&nbsp;";
    }
    this.element.innerHTML = character;
  }

  /**
   * @returns {number}
   */
  getDuration() {
    if (this.metrics.startTimestamp === null) {
      return 0;
    }

    if (this.metrics.endTimestamp === null) {
      return Date.now() - this.metrics.startTimestamp;
    }

    return this.metrics.endTimestamp - this.metrics.startTimestamp;
  }

  release() {
    this.metrics.endTimestamp = Date.now();
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
  /** @type {{
    startTimestamp: number;
    endTimestamp: number | null;
    averageGlyphInterval: number | null;
    pauseBeforeWord: number | null;
    groupPosition: [number, number] | null;
  }} */
  metrics;
  /**
   * @abstract
   * @type {HTMLElement}
   */
  element;

  /**
   * @param {Tag} tag
   */
  constructor(tag) {
    this.tag = tag;
    this.items = [];
    this.metrics = {
      startTimestamp: Date.now(),
      endTimestamp: null,
      averageGlyphInterval: null,
      pauseBeforeWord: null,
      groupPosition: null,
    };
    this.element = document.createElement("span");
  }

  /**
   * @returns {number}
   */
  getDuration() {
    if (this.metrics.startTimestamp === null) {
      return 0;
    }

    if (this.metrics.endTimestamp === null) {
      return Date.now() - this.metrics.startTimestamp;
    }

    return this.metrics.endTimestamp - this.metrics.startTimestamp;
  }

  getSequenceInProgress() {
    return this.metrics.startTimestamp !== null;
  }

  /**
   * @param {ItemsOf<Tag>} item
   */
  addItem(item) {
    if (!this.getSequenceInProgress()) {
      return;
    }
    if (this.items.length === 0) {
      this.metrics.startTimestamp = item.metrics.startTimestamp;
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
  removeLastGlyphAndResumeNestedSequences() {
    // Remove last item:
    if (!this.getSequenceInProgress()) {
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
        return true;
      }

      // TODO: Figure out why TS is not narrowing `previousItem` properly.
      const previousItemSequence = /** @type{EntitySequences} */ (previousItem);
      previousItemSequence.resumeGrouping();
      if (previousItemSequence.removeLastGlyphAndResumeNestedSequences()) {
        return true;
      }

      this.element.removeChild(previousItem.element);
      this.items.pop();
      this.updateMetrics();
    }

    // No previous item to resume and recurse on:
    return false;
  }

  updateMetrics() {
    let totalIntervals = 0;
    for (let i = 1; i < this.items.length; i++) {
      totalIntervals +=
        this.items[i].metrics.startTimestamp -
        this.items[i - 1].metrics.startTimestamp;
    }
    this.metrics.averageGlyphInterval =
      this.items.length > 1 ? totalIntervals / (this.items.length - 1) : 0;
  }

  finishGrouping() {
    if (!this.getSequenceInProgress()) {
      return;
    }
    this.metrics.endTimestamp = Date.now();
  }

  resumeGrouping() {
    if (this.getSequenceInProgress()) {
      return;
    }
    // Hacky reset for the start timestamp based on prior word duration.
    this.metrics.startTimestamp = Date.now() - this.getDuration();
    this.metrics.endTimestamp = null;
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
  /** @type {HTMLSpanElement} */
  element;

  constructor() {
    super("Word");
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_ENTITY_WORD);
    this.element.classList.add(CLASS_INLINE);
  }
}

/**
 * @extends {EntitySequenceGeneric<"Sentence">}
 */
class Sentence extends EntitySequenceGeneric {
  /** @type {HTMLSpanElement} */
  element;

  constructor() {
    super("Sentence");
    this.element = document.createElement("div");
    this.element.classList.add(CLASS_ENTITY_SENTENCE);
    this.element.classList.add(CLASS_INLINE);
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
