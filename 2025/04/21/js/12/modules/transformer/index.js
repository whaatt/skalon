/**
 * @typedef {import("../typings.js").EntityTransformer} EntityTransformer
 */

import { EmojiTransformer } from "./emojiTransformer.js";
import { GlyphInflationTransformer } from "./glyphInflation.js";
import { GlyphIntervalColorizer } from "./glyphIntervalColorizer.js";
import { SnakeTransformer } from "./snakeTransformer.js";

const RegistryConst = {
  GlyphInflation: GlyphInflationTransformer,
  GlyphIntervalColorizer: GlyphIntervalColorizer,
  SnakeTransformer: SnakeTransformer,
  EmojiTransformer: EmojiTransformer,
};

/**
 * @type {Record<keyof typeof RegistryConst, new () => EntityTransformer>}
 */
export const Registry = RegistryConst;

/**
 * @type {Array<keyof typeof Registry>}
 */
export const DEFAULT_TRANSFORMERS = [
  "GlyphInflation",
  "GlyphIntervalColorizer",
  "SnakeTransformer",
];

/**
 * An ordering of the transformers that seeks to minimize conflicts related to
 * their sequential application. In general, transformers should seek to reduce
 * conflicts on their own.
 *
 * Lower numbers are applied first.
 *
 * @type {Record<keyof typeof Registry, number>}
 */
export const TRANSFORMER_APPLICATION_SORT_ORDER = {
  EmojiTransformer: 1,
  GlyphInflation: 2,
  SnakeTransformer: 3,
  GlyphIntervalColorizer: 4,
};

export const DEFAULT_COMPLETIONS_CONFIG = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-2025-04-14",
  apiKey: "",
};
