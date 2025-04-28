/**
 * @typedef {import("../typings.js").EntityTransformer} EntityTransformer
 */

import { GlyphInflationTransformer } from "./glyphInflation.js";
import { GlyphIntervalColorizer } from "./glyphIntervalColorizer.js";

const RegistryConst = {
  GlyphInflation: GlyphInflationTransformer,
  GlyphIntervalColorizer: GlyphIntervalColorizer,
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
];
