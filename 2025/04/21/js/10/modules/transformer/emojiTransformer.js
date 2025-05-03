/**
 * @typedef {import("../typings.js").EntityTransformerContextBase} EntityTransformerContextBase
 * @typedef {import("../typings.js").EntityAtomic} EntityAtomic
 */

import { EntityTransformerBase } from "../model.js";

const CLASS_EMOJI = "emoji";
const EMOJI_UPDATE_INTERVAL = 5000; // 5 seconds between updates.

/**
 * @typedef {{
 *   baseURL: string;
 *   apiKey: string;
 * }} OpenAIConfig
 *
 * @typedef {{
 *   chat: {
 *     completions: {
 *       create: (params: {
 *         model: string;
 *         messages: Array<{role: string; content: string}>;
 *         response_format: {type: string};
 *       }) => Promise<{
 *         choices: Array<{
 *           message: {
 *             content: string;
 *           };
 *         }>;
 *       }>;
 *     };
 *   };
 * }} OpenAI
 */

/**
 * @typedef {{
 *   new (config: OpenAIConfig): OpenAI;
 * }} OpenAIConstructor
 */

/**
 * Transformer that adds emojis after words using AI completions.
 *
 * @extends {EntityTransformerBase}
 */
export class EmojiTransformer extends EntityTransformerBase {
  /** @private @type {OpenAI | null} */
  completionsService = null;

  /** @private @type {string | null} */
  model = null;

  /** @private @type {Map<import("../model.js").EntitySequence<"Paragraph">, {
    lastUpdateTime: number;
    emojiMap: Map<number, string> | null;
    wordToGlyphMap: Map<number, import("../model.js").EntitySequence<"Word">>;
  }>} */
  paragraphStateCache = new Map();

  /** @private @type {import("../model.js").EntitySequence<"Paragraph"> | null} */
  latestParagraph = null;

  /**
   * Sets the completions configuration.
   *
   * @param {string} baseUrl The base URL for the (OpenAI) completions API.
   * @param {string} model The model to use for completions.
   * @param {string} apiKey The API key for authentication.
   */
  setCompletionsConfig(baseUrl, model, apiKey) {
    if (!baseUrl || !model || !apiKey) {
      this.completionsService = null;
      this.model = null;
      return;
    }

    this.completionsService = new /** @type {OpenAIConstructor} */ (
      // @ts-ignore (OpenAI is loaded from CDN and is guaranteed to exist on
      // the window object.)
      window.OpenAI
    )({
      baseURL: baseUrl,
      apiKey: apiKey,
    });
    this.model = model;
  }

  /**
   * @private
   * @param {string} text
   * @returns {Promise<Map<number, string> | null>}
   */
  async getEmojiMap(text) {
    if (!this.completionsService || !this.model) {
      return null;
    }

    try {
      const response = await this.completionsService.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: [
              "You are a helpful assistant that adds relevant emojis after words in a text.",
              "Words are separated by spaces.",
              "Return a JSON array where each element is either null or an emoji string.",
              "The array length should match the number of words in the text.",
              "Do not add emojis after the last word.",
            ].join(" "),
          },
          {
            role: "user",
            content: text,
          },
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content);
      const emojiMap = new Map();

      // Convert array to map, skipping the last word:
      for (let i = 0; i < result.length - 1; i++) {
        if (result[i] !== null) {
          emojiMap.set(i, result[i]);
        }
      }

      return emojiMap;
    } catch (error) {
      console.error("Error getting emoji completions:", error);
      return null;
    }
  }

  /**
   * @readonly @param {import("../model.js").EntitySequence<"Container">} item
   * @param {EntityTransformerContextBase} contextBase
   */
  transformContainer(item, contextBase) {
    // Update latest paragraph:
    if (item.items.length > 0) {
      const newLatestParagraph = item.items[item.items.length - 1];
      if (newLatestParagraph !== this.latestParagraph) {
        // Save state for old paragraph:
        if (this.latestParagraph !== null) {
          const cachedState = this.paragraphStateCache.get(
            this.latestParagraph
          );
          if (cachedState) {
            this.paragraphStateCache.set(this.latestParagraph, cachedState);
          }
        }
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
  async transformParagraph(item, contextBase) {
    if (
      item !== this.latestParagraph ||
      !this.completionsService ||
      !this.model
    ) {
      return;
    }

    // Get or initialize paragraph state:
    let paragraphState = this.paragraphStateCache.get(item);
    if (!paragraphState) {
      paragraphState = {
        lastUpdateTime: 0,
        emojiMap: null,
        wordToGlyphMap: new Map(),
      };
      this.paragraphStateCache.set(item, paragraphState);
    }

    // Check if it's time to update emojis:
    const now = Date.now();
    if (now - paragraphState.lastUpdateTime < EMOJI_UPDATE_INTERVAL) {
      return;
    }

    // Get all words from all sentences in the paragraph:
    const words = item.items.flatMap((sentence) => sentence.items);
    if (words.length === 0) {
      return;
    }

    // Update word to glyph mapping:
    const newWordToGlyphMap = new Map();
    words.forEach((word, index) => {
      newWordToGlyphMap.set(index, word);
    });
    paragraphState.wordToGlyphMap = newWordToGlyphMap;

    // Get the text content of the paragraph:
    const text = words
      .map((word) =>
        word.items
          .map((/** @type {EntityAtomic} */ glyph) => {
            const typedGlyph = /** @type {import("../model.js").Glyph} */ (
              glyph
            );
            return typedGlyph.character;
          })
          .join("")
      )
      .join(" ");

    // Update emoji map:
    paragraphState.emojiMap = await this.getEmojiMap(text);
    paragraphState.lastUpdateTime = now;
    if (!paragraphState.emojiMap) {
      return;
    }

    // Apply emojis to words using the stable mapping:
    Array.from(paragraphState.emojiMap.entries()).forEach(([index, emoji]) => {
      const word = paragraphState.wordToGlyphMap.get(index);
      if (word && word.items.length > 0 && word.getDuration() !== null) {
        // Find the last glyph in the word (space):
        const lastGlyph = word.items[word.items.length - 1];
        if (lastGlyph) {
          // Update the space glyph to include the emoji:
          lastGlyph.element.innerHTML = `&nbsp;${emoji}&nbsp;`;
          lastGlyph.element.classList.add(CLASS_EMOJI);
        }
      }
    });
  }
}
