/**
 * @typedef {import("./model.d.ts").TagGlyph} TagGlyph
 */

/**
 * @typedef {import("./model.d.ts").TagSequenceTypes} TagSequenceTypes
 */

/**
 * @typedef {import("./model.d.ts").EntityAtomic} EntityAtomic
 */

/**
 * @typedef {import("./model.d.ts").EntitySequences} EntitySequences
 */

/**
 * @typedef {import("./model.d.ts").Entity} Entity
 */

/**
 * @template {TagSequenceTypes} Tag
 * @typedef {import("./model.d.ts").ItemsOf<Tag>} ItemsOf
 */

/**
 * @template {TagSequenceTypes} Tag
 * @typedef {import("./model.d.ts").EntitySequence<Tag>} EntitySequence
 */

/**
 * @template {Record<any, any>} Context
 * @typedef {import("./model.d.ts").EntityTransformer<any, Context>} EntityTransformer
 */

/**
 * @abstract
 * @class
 * @template {Record<any, any>} Context
 * @implements {EntityTransformer<Context>}
 */
class EntityTransformerBase {
  /**
   * @param {EntityAtomic} item
   * @param {Context} context
   */
  transformGlyph(item, context) {
    // TODO.
  }

  /**
   * @param {EntitySequence<"Word">} item
   * @param {Context} context
   */
  transformWord(item, context) {
    // TODO.
  }

  /**
   * @param {EntitySequence<"Sentence">} item
   * @param {Context} context
   */
  transformSentence(item, context) {
    // TODO.
  }

  /**
   * @param {EntitySequence<"Paragraph">} item
   * @param {Context} context
   */
  transformParagraph(item, context) {
    // TODO.
  }

  /**
   * @param {EntitySequence<"Container">} item
   * @param {Context} context
   */
  transformContainer(item, context) {
    // TODO.
  }

  /**
   * @template {Entity} Item
   * @param {Item} item
   * @param {Context} context
   */
  transform(item, context) {
    switch (item.tag) {
      case "Glyph":
        this.transformGlyph(item, context);
        break;
      case "Word":
        this.transformWord(item, context);
        break;
      case "Sentence":
        this.transformSentence(item, context);
        break;
      case "Paragraph":
        this.transformParagraph(item, context);
        break;
      case "Container":
        this.transformContainer(item, context);
    }
  }
}

/**
 * A glyph is a single typed character.
 *
 * @class
 * @implements {EntityAtomic}
 */
class Glyph {
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
    this.transformState = {};
  }

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

  createElement() {
    // TODO.
    return document.createElement("span");
  }

  /**
   * @template {Record<any, any>} Context
   * @param {EntityTransformer<Context>} transformer
   * @param {Context} context
   */
  transformWith(transformer, context) {
    transformer.transform(this, context);
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
  }

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
    return this.metrics.endTimestamp !== null;
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
    this.updateMetrics();
  }

  removeLastItem() {
    if (!this.getSequenceInProgress()) {
      return;
    }
    if (this.items.length === 0) {
      return;
    }
    this.items.pop();
    this.updateMetrics();
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
   * @abstract
   */
  createElement() {
    return document.createElement("span");
  }

  /**
   * @template {Record<any, any>} Context
   * @param {EntityTransformer<Context>} transformer
   * @param {Context} context
   */
  transformWith(transformer, context) {
    transformer.transform(this, context);
  }
}

/**
 * Hacky way to have EntitySequenceGeneric implement a union type and be
 * constrained properly in its implementation.
 *
 * @type {new (...args: any[]) => EntitySequences}
 */
const constrainEntitySequenceGeneric = EntitySequenceGeneric;

/**
 * @extends {EntitySequenceGeneric<"Word">}
 */
class Word extends EntitySequenceGeneric {
  constructor() {
    super("Word");
  }
}

/**
 * @extends {EntitySequenceGeneric<"Sentence">}
 */
class Sentence extends EntitySequenceGeneric {
  constructor() {
    super("Sentence");
  }
}

/**
 * @extends {EntitySequenceGeneric<"Paragraph">}
 */
class Paragraph extends EntitySequenceGeneric {
  constructor() {
    super("Paragraph");
  }
}

/**
 * @extends {EntitySequenceGeneric<"Container">}
 */
class Container extends EntitySequenceGeneric {
  constructor() {
    super("Container");
  }
}
