/**
 * @typedef {import("../typings.js").EntityTransformerContextBase} EntityTransformerContextBase
 * @typedef {import("../typings.js").EntityAtomic} EntityAtomic
 */

// @ts-ignore
import OpenAIBase from "https://cdn.jsdelivr.net/npm/openai@4.97.0/+esm";
import { TERMINATOR_WORD } from "../constants.js";
import { EntityTransformerBase, Glyph } from "../model.js";

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
 *         seed: number;
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
 * Transformer that adds emoji after words using AI completions.
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
    wordToEmojiCache: Map<import("../model.js").EntitySequence<"Word">, string> | null;
    updateIsRunning: boolean;
    seed: number;
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

    this.completionsService = new OpenAIBase({
      baseURL: baseUrl,
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
    this.model = model;
  }

  /**
   * @private
   * @param {import("../model.js").EntitySequence<"Word">[]} words
   * @param {number} seed
   * @returns {Promise<string[] | null>}
   */
  async getEmojiForWordList(words, seed) {
    if (!this.completionsService || !this.model) {
      return null;
    }

    // Convert words to raw text items:
    const text = words.map((word) =>
      word.items
        .map((/** @type {EntityAtomic} */ glyph) => {
          const typedGlyph = /** @type {import("../model.js").Glyph} */ (glyph);
          if (typedGlyph.element.classList.contains(CLASS_EMOJI)) {
            return null;
          }
          return typedGlyph.character;
        })
        .filter((character) => character !== null)
        .join("")
        .replace(/&nbsp;/g, " ")
        .trim()
    );
    if (text.join("").length === 0) {
      return Array(words.length).fill(null);
    }

    try {
      const response = await this.completionsService.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: [
              "You are a helpful assistant that adds relevant emoji after words in a text in the style of an Emojipasta meme.",
              "Your input is a list of words, which were separated by spaces in the text.",
              "Transform the array into a new array by adding a particular emoji string or `null` after each word.",
              "Use a `null` element (the literal `null`, not a string) when there isn't a relevant emoji to add after a word.",
              "The number of elements in the array should end up being exactly double the number of words in the input.",
              "Do not return anything but a JSON array literal, which must use double-quotes for strings according to spec.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(text),
          },
        ],
        seed,
      });

      const result = JSON.parse(response.choices[0].message.content);
      const wordsEmoji = new Array(words.length);

      // Ensure structure of result by reading it into a blank array:
      for (let i = 0; i < words.length * 2; i += 2) {
        if (typeof result[i] === "string" && result[i + 1] !== "null") {
          wordsEmoji[i / 2] = result[i + 1] || null;
        } else {
          wordsEmoji[i / 2] = null;
        }
      }

      return wordsEmoji;
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
    if (!this.completionsService || !this.model) {
      return;
    }

    // Get or initialize paragraph state:
    let paragraphState = this.paragraphStateCache.get(item);
    if (!paragraphState) {
      paragraphState = {
        lastUpdateTime: 0,
        wordToEmojiCache: null,
        updateIsRunning: false,
        seed: Math.floor(Math.random() * 1000000),
      };
      this.paragraphStateCache.set(item, paragraphState);
    }

    // Short-circuit if we've updated emoji recently or we're running an update:
    const now = Date.now();
    if (
      now - paragraphState.lastUpdateTime < EMOJI_UPDATE_INTERVAL ||
      paragraphState.updateIsRunning
    ) {
      return;
    }

    // Get all words from all sentences in the paragraph. Short-circuit if we
    // don't have any words:
    const words = item.items.flatMap((sentence) => sentence.items);
    if (words.length === 0) {
      return;
    }

    // Short-circuit if the latest started word predates the last update time:
    if (words.length > 0) {
      const latestWord = words[words.length - 1];
      if (latestWord.startTimestamp < paragraphState.lastUpdateTime) {
        return;
      }
    }

    // Retrieve emoji map in a locked update call:
    paragraphState.updateIsRunning = true;
    const wordsEmoji = await this.getEmojiForWordList(
      words,
      paragraphState.seed
    );
    paragraphState.lastUpdateTime = now;
    paragraphState.updateIsRunning = false;
    if (!wordsEmoji) {
      return;
    }

    // Apply emoji to words using the stable indices of words at the time we
    // dispatched the completions query:
    wordsEmoji.forEach((emoji, index) => {
      const word = words[index];
      if (word && word.items.length > 0 && !word.getInProgress()) {
        // Clear any existing emoji from the word:
        while (
          word.items.length > 0 &&
          word.items[word.items.length - 1].element.classList.contains(
            CLASS_EMOJI
          )
        ) {
          word.removeLastGlyphAndResumeNestedSequences(true);
        }

        // Add non-null emoji to the word by appending spacer and emoji glyphs:
        if (emoji) {
          let emojiSingle = "";
          // Grab only the first code point of the emoji string.
          for (const character of emoji) {
            emojiSingle = character;
            break;
          }
          const lastGlyph = /** @type {import("../model.js").Glyph} */ (
            word.items[word.items.length - 1]
          );
          // Add a spacer before the emoji if there isn't one already:
          if (lastGlyph.character !== TERMINATOR_WORD) {
            const preSpacer = new Glyph(TERMINATOR_WORD);
            preSpacer.element.classList.add(CLASS_EMOJI);
            preSpacer.release();
            word.addItem(preSpacer, true);
          }
          // Add the emoji glyph:
          const emojiGlyph = new Glyph(emojiSingle);
          emojiGlyph.element.classList.add(CLASS_EMOJI);
          emojiGlyph.release();
          word.addItem(emojiGlyph, true);
          // Add a spacer after the emoji:
          const postSpacer = new Glyph(TERMINATOR_WORD);
          postSpacer.element.classList.add(CLASS_EMOJI);
          postSpacer.release();
          word.addItem(postSpacer, true);
        }

        // Set the word back to a completed state.
        word.finishGrouping();
      }
    });
  }
}
