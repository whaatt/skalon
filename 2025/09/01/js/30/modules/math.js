/*
 * Math utilities.
 */

/**
 * Normalizes the passed angle to `[-Math.PI, Math.PI]`.
 *
 * @param {number} theta
 * @returns {number}
 */
export const normalizeAngleSigned = (theta) => {
  while (theta > Math.PI) theta -= Math.PI * 2;
  while (theta < -Math.PI) theta += Math.PI * 2;
  return theta;
};

/**
 * Clamps a value between `minimum` and `maximum`.
 *
 * @param {number} value
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
export const clamp = (value, minimum, maximum) => {
  return Math.max(minimum, Math.min(maximum, value));
};

/**
 * Returns a random number in `[minimum, maximum]`.
 *
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
export const randomRange = (minimum, maximum) => {
  return minimum + Math.random() * (maximum - minimum);
};

/**
 * Gets the current device's pixel ratio.
 *
 * @returns {number}
 */
export const getDevicePixelRatio = () => {
  return window.devicePixelRatio || 1;
};
