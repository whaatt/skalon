/*
 * Simulation global state and orchestration.
 */

import {
  canvasElement,
  contentElement,
  FLY_SIZE_PIXELS,
  INITIAL_FLY_COUNT,
  SPEED_MAXIMUM,
  SPEED_MINIMUM,
} from "./constants.js";
import { Fly } from "./fly.js";
import { getDevicePixelRatio } from "./math.js";
import { drawTrail, emitTrailAlongMovement, trailSegments } from "./trail.js";

const ctx = /** @type {CanvasRenderingContext2D} */ (
  canvasElement.getContext("2d")
);
if (!(ctx instanceof CanvasRenderingContext2D)) {
  throw new Error("CanvasRenderingContext2D not supported");
}

/** @type {Fly[]} */
const flies = [];

/** @type {number} */
let lastFrameMilliseconds = performance.now();

/** @type {{ x: number, y: number, active: boolean }} */
export const mouseState = { x: 0, y: 0, active: false };

/**
 * Gets the content rectangle in canvas coordinates.
 *
 * @param {DOMRect} canvasRectangle
 * @returns {import("./constants.js").Rectangle}
 */
const getContentRectangleInCanvas = (canvasRectangle) => {
  const contentRectangle = contentElement.getBoundingClientRect();
  return {
    left: contentRectangle.left - canvasRectangle.left,
    top: contentRectangle.top - canvasRectangle.top,
    right: contentRectangle.right - canvasRectangle.left,
    bottom: contentRectangle.bottom - canvasRectangle.top,
  };
};

/**
 * Gets the mouse position in canvas coordinates.
 *
 * @param {DOMRect} canvasRectangle
 * @returns {{ x: number, y: number, active: boolean }}
 */
const getMousePositionInCanvas = (canvasRectangle) => {
  return mouseState.active
    ? {
        x: mouseState.x - canvasRectangle.left,
        y: mouseState.y - canvasRectangle.top,
        active: true,
      }
    : { x: 0, y: 0, active: false };
};

/**
 * Resizes the internal dimensions of the canvas to match display size and DPR.
 *
 * When we draw, we will apply a transformation matrix such that we can draw in
 * CSS pixels rather than device pixels.
 */
export const resizeCanvasToDisplaySize = () => {
  const devicePixelRatio = getDevicePixelRatio();
  const { clientWidth, clientHeight } = canvasElement;
  const displayWidth = Math.max(1, Math.floor(clientWidth * devicePixelRatio));
  const displayHeight = Math.max(
    1,
    Math.floor(clientHeight * devicePixelRatio)
  );
  if (
    canvasElement.width !== displayWidth ||
    canvasElement.height !== displayHeight
  ) {
    canvasElement.width = displayWidth;
    canvasElement.height = displayHeight;
  }
};

/**
 * Seeds flies with random positions and velocities while avoiding the content
 * rectangle.
 *
 * @param {number} count
 */
export const seedFlies = (count = INITIAL_FLY_COUNT) => {
  // Get the CSS dimensions of the canvas.
  const canvasRectangle = canvasElement.getBoundingClientRect();
  const width = canvasRectangle.width;
  const height = canvasRectangle.height;

  // Compute the content rectangle in canvas coordinates.
  const contentRectangleInCanvas = getContentRectangleInCanvas(canvasRectangle);

  // Spawn each of `count` flies.
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed =
      SPEED_MINIMUM + Math.random() * (SPEED_MAXIMUM - SPEED_MINIMUM);
    let x = Math.random() * width;
    let y = Math.random() * height;

    // Make 50 attempts to spawn a fly outside the content rectangle.
    if (contentRectangleInCanvas) {
      let attempts = 0;
      while (
        attempts < 50 &&
        x >= contentRectangleInCanvas.left &&
        x <= contentRectangleInCanvas.right &&
        y >= contentRectangleInCanvas.top &&
        y <= contentRectangleInCanvas.bottom
      ) {
        x = Math.random() * width;
        y = Math.random() * height;
        attempts++;
      }

      // After 50 attempts, place the fly randomly on the edge of the content
      // rectangle.
      if (
        x >= contentRectangleInCanvas.left &&
        x <= contentRectangleInCanvas.right &&
        y >= contentRectangleInCanvas.top &&
        y <= contentRectangleInCanvas.bottom
      ) {
        const centerX =
          (contentRectangleInCanvas.left + contentRectangleInCanvas.right) / 2;
        const centerY =
          (contentRectangleInCanvas.top + contentRectangleInCanvas.bottom) / 2;
        const distanceToContentCenterX = x - centerX;
        const distanceToContentCenterY = y - centerY;
        if (
          Math.abs(distanceToContentCenterX) >
          Math.abs(distanceToContentCenterY)
        ) {
          x =
            distanceToContentCenterX > 0
              ? contentRectangleInCanvas.right + 1
              : contentRectangleInCanvas.left - 1;
        } else {
          y =
            distanceToContentCenterY > 0
              ? contentRectangleInCanvas.bottom + 1
              : contentRectangleInCanvas.top - 1;
        }
      }
    }

    flies.push(
      new Fly({
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        sizePixels: FLY_SIZE_PIXELS,
      })
    );
  }
};

/**
 * Renders a frame (called via `requestAnimationFrame`).
 *
 * @param {number} nowMilliseconds
 */
function renderFrame(nowMilliseconds) {
  resizeCanvasToDisplaySize();
  const devicePixelRatio = getDevicePixelRatio();
  const deltaSeconds = Math.min(
    0.1,
    (nowMilliseconds - lastFrameMilliseconds) / 1000
  );
  lastFrameMilliseconds = nowMilliseconds;

  // Set the canvas transformation matrix to account for DPR (henceforth we will
  // draw in CSS pixels rather than device pixels).
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const widthCss = canvasElement.width / devicePixelRatio;
  const heightCss = canvasElement.height / devicePixelRatio;
  ctx.clearRect(0, 0, widthCss, heightCss);

  // Get content and mouse states for fly repulsion.
  const canvasRectangle = canvasElement.getBoundingClientRect();
  const contentRectangleInCanvas = getContentRectangleInCanvas(canvasRectangle);
  const mousePosition = getMousePositionInCanvas(canvasRectangle);

  // Update each fly and emit its new trail segments.
  for (const fly of flies) {
    const { x: initialX, y: initialY } = fly;
    const { unwrappedX, unwrappedY } = fly.update(
      deltaSeconds,
      widthCss,
      heightCss,
      nowMilliseconds,
      contentRectangleInCanvas,
      mousePosition
    );
    if (!fly.trailAccumulatorInternal) {
      fly.trailAccumulatorInternal = { value: 0 };
    }
    emitTrailAlongMovement(
      initialX,
      initialY,
      unwrappedX,
      unwrappedY,
      nowMilliseconds,
      fly.trailAccumulatorInternal
    );
  }

  // Draw the trails and flies after all position updates.
  drawTrail(ctx, nowMilliseconds);
  for (const fly of flies) {
    fly.draw(ctx);
  }

  // Queue the next frame.
  requestAnimationFrame(renderFrame);
}

/**
 * Resets simulation state, spawns flies, and starts the render loop anew.
 */
export const resetSimulation = () => {
  flies.length = 0;
  trailSegments.length = 0;

  resizeCanvasToDisplaySize();
  seedFlies(INITIAL_FLY_COUNT);
  lastFrameMilliseconds = performance.now();
  requestAnimationFrame(renderFrame);
};
