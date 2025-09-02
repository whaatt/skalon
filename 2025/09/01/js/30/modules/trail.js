/*
 * Trail logic and rendering.
 */

import {
  TRAIL_COLOR,
  TRAIL_LINE_WIDTH,
  TRAIL_SEGMENT_FADE_DURATION_SECONDS,
  TRAIL_SEGMENT_LENGTH_PIXELS,
  TRAIL_SPACING_PIXELS,
} from "./constants.js";

/**
 * @typedef {Object} TrailSegment
 * @property {number} x
 * @property {number} y
 * @property {number} angle
 * @property {number} length
 * @property {number} createdAtMilliseconds
 */

/** @type {TrailSegment[]} */
export const trailSegments = [];

/**
 * Emits evenly-spaced trail segments along a movement path with the provided
 * start and end points.
 *
 * Mutates the provided `accumulatorPixels` to track even spacing of segments
 * across frames.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @param {number} nowMilliseconds
 * @param {{ value: number }} accumulatorPixels
 */
export const emitTrailAlongMovement = (
  startX,
  startY,
  endX,
  endY,
  nowMilliseconds,
  accumulatorPixels
) => {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const frameDistance = Math.hypot(deltaX, deltaY);
  if (frameDistance <= 0) {
    return;
  }

  const normalizedDeltaX = deltaX / frameDistance;
  const normalizedDeltaY = deltaY / frameDistance;
  let remainingDistance = frameDistance;
  let consumedUpToX = startX;
  let consumedUpToY = startY;
  let emittedAnySegments = false;

  // Consume the distance traveled this frame while placing new trail segments.
  let distanceToNextSegment = TRAIL_SPACING_PIXELS - accumulatorPixels.value;
  while (remainingDistance >= distanceToNextSegment) {
    // Advance to emission position.
    consumedUpToX += normalizedDeltaX * distanceToNextSegment;
    consumedUpToY += normalizedDeltaY * distanceToNextSegment;

    // Place a dash segment at this fixed world position.
    trailSegments.push({
      x: consumedUpToX,
      y: consumedUpToY,
      angle: Math.atan2(normalizedDeltaY, normalizedDeltaX),
      length: TRAIL_SEGMENT_LENGTH_PIXELS,
      createdAtMilliseconds: nowMilliseconds,
    });
    remainingDistance -= distanceToNextSegment;

    // Reset distance to next segment and keep iterating if we have more
    // distance to consume.
    distanceToNextSegment = TRAIL_SPACING_PIXELS;
    emittedAnySegments = true;
    accumulatorPixels.value = 0;
  }

  // If we emitted segments, the new accumulator value is whatever distance we
  // did not consume this frame. Otherwise, we keep accumulating frame travel
  // distances until there is enough distance for a segment.
  if (emittedAnySegments) {
    accumulatorPixels.value = remainingDistance;
  } else {
    accumulatorPixels.value += frameDistance;
  }

  // Safeguard against floating-point rounding errors (this conditional should
  // not be possible given the loop condition above).
  if (accumulatorPixels.value >= TRAIL_SPACING_PIXELS) {
    accumulatorPixels.value = TRAIL_SPACING_PIXELS - 1e-6;
  }
};

/**
 * Draws and prunes trail segments.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} nowMilliseconds
 */
export const drawTrail = (ctx, nowMilliseconds) => {
  const fadeDurationMilliseconds = TRAIL_SEGMENT_FADE_DURATION_SECONDS * 1000;

  ctx.save();
  ctx.lineWidth = TRAIL_LINE_WIDTH;
  ctx.strokeStyle = TRAIL_COLOR;
  ctx.lineCap = "round";

  // Iterate over the segments, updating their opacity based on their age and
  // the fade duration constant. As segments are killed off, live segments are
  // pushed toward the front of the array using the `writeIndex` (and the array
  // length is modified to avoid unnecessary array resizing).
  let writeIndex = 0;
  for (let i = 0; i < trailSegments.length; i++) {
    const segment = trailSegments[i];
    const segmentAgeMilliseconds =
      nowMilliseconds - segment.createdAtMilliseconds;
    if (segmentAgeMilliseconds >= fadeDurationMilliseconds) {
      continue;
    }
    const fadeCompletion = segmentAgeMilliseconds / fadeDurationMilliseconds;
    const alpha = 1 - fadeCompletion;
    if (alpha <= 0) {
      continue;
    }

    // Segments are centered around their `(x, y)` position (with half their
    // length offset in each direction).
    const halfLength = segment.length / 2;
    const cosA = Math.cos(segment.angle);
    const sinA = Math.sin(segment.angle);
    const startX = segment.x - cosA * halfLength;
    const startY = segment.y - sinA * halfLength;
    const endX = segment.x + cosA * halfLength;
    const endY = segment.y + sinA * halfLength;

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Push the segment to the last free position in the array.
    trailSegments[writeIndex++] = segment;
  }

  trailSegments.length = writeIndex;
  ctx.restore();
};
