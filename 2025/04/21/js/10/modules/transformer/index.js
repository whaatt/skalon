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

export const DEFAULT_COMPLETIONS_CONFIG = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-3.5-turbo",
  apiKey: "",
};
