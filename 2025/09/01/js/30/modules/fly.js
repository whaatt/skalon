/*
 * Fly entity and rendering.
 */

import {
  CONTENT_AVOIDANCE_INFLUENCE_RADIUS_PIXELS,
  CONTENT_AVOIDANCE_TURN_ACCELERATION_CAP,
  CONTENT_AVOIDANCE_TURN_GAIN,
  FLY_SIZE_PIXELS,
  FLY_SPRITE_SOURCE,
  MOUSE_AVOIDANCE_INFLUENCE_RADIUS_PIXELS,
  MOUSE_AVOIDANCE_MAXIMUM_BOOST_DURATION_MILLISECONDS,
  MOUSE_AVOIDANCE_PUSH_MAXIMUM_PIXELS_PER_SECOND,
  MOUSE_AVOIDANCE_TURN_ACCELERATION_CAP,
  MOUSE_AVOIDANCE_TURN_GAIN,
  SPEED_ACCELERATION_JITTER,
  SPEED_CHANGE_INTERVAL_MAXIMUM_MILLISECONDS,
  SPEED_CHANGE_INTERVAL_MINIMUM_MILLISECONDS,
  SPEED_DAMPING,
  SPEED_GAIN_TOWARDS_TARGET,
  SPEED_MAXIMUM,
  SPEED_MINIMUM,
  WANDER_ANGULAR_ACCELERATION,
  WANDER_ANGULAR_DAMPING,
  WANDER_MAXIMUM_ANGULAR_VELOCITY,
} from "./constants.js";
import { clamp, normalizeAngleSigned, randomRange } from "./math.js";

/** @type {HTMLImageElement} */
const flyImage = new Image();
let flyImageLoaded = false;
flyImage.onload = () => {
  flyImageLoaded = true;
};
flyImage.src = FLY_SPRITE_SOURCE;

/**
 * @typedef {Object} FlyOptions
 * @property {number} x
 * @property {number} y
 * @property {number} velocityX
 * @property {number} velocityY
 * @property {number} [sizePixels]
 */

export class Fly {
  /**
   * @param {FlyOptions} flyOptions
   */
  constructor({ x, y, velocityX, velocityY, sizePixels = FLY_SIZE_PIXELS }) {
    /** @type {number} */
    this.x = x;
    /** @type {number} */
    this.y = y;
    /** @type {number} */
    this.sizePixels = sizePixels;
    /** @type {number} */
    this.velocityX = velocityX;
    /** @type {number} */
    this.velocityY = velocityY;
    /** @type {number} */
    this.speed = Math.hypot(velocityX, velocityY);
    /** @type {number} */
    this.targetSpeed = clamp(
      this.speed * (0.9 + Math.random() * 0.2),
      SPEED_MINIMUM,
      SPEED_MAXIMUM
    );
    /** @type {number} */
    this.accelerationScalar = 0;
    /** @type {number} */
    this.heading = Math.atan2(velocityY, velocityX);
    /** @type {number} */
    this.angularSpeed =
      (Math.random() * 2 - 1) * (WANDER_MAXIMUM_ANGULAR_VELOCITY * 0.25);
    /** @type {number} */
    this.mouseBoostMillisecondsRemaining = 0;
    /** @type {number} */
    this.nextSpeedChangeAtMilliseconds =
      performance.now() +
      randomRange(
        SPEED_CHANGE_INTERVAL_MINIMUM_MILLISECONDS,
        SPEED_CHANGE_INTERVAL_MAXIMUM_MILLISECONDS
      );

    /**
     * Trail spacing accumulator managed externally by the simulation.
     *
     * @type {{ value: number } | undefined}
     */
    this.trailAccumulatorInternal = undefined;
  }

  /**
   * Updates the fly's position and velocity based on a frame state.
   *
   * @param {number} deltaSeconds
   * @param {number} viewportWidth
   * @param {number} viewportHeight
   * @param {number} nowMilliseconds
   * @param {import("./constants.js").Rectangle | null} contentRectangleInCanvas
   * @param {{ x: number, y: number, active: boolean }} mousePosition
   * @returns {{ unwrappedX: number, unwrappedY: number }}
   */
  update(
    deltaSeconds,
    viewportWidth,
    viewportHeight,
    nowMilliseconds,
    contentRectangleInCanvas,
    mousePosition
  ) {
    if (deltaSeconds <= 0) {
      return {
        unwrappedX: this.x,
        unwrappedY: this.y,
      };
    }

    // Accumulators for additional radial push due to mouse repulsion (applied
    // this frame only).
    let escapePushVelocityX = 0;
    let escapePushVelocityY = 0;

    // Pick a new target speed at sporadic intervals.
    if (nowMilliseconds >= this.nextSpeedChangeAtMilliseconds) {
      this.targetSpeed =
        SPEED_MINIMUM + Math.random() * (SPEED_MAXIMUM - SPEED_MINIMUM);
      this.nextSpeedChangeAtMilliseconds =
        nowMilliseconds +
        randomRange(
          SPEED_CHANGE_INTERVAL_MINIMUM_MILLISECONDS,
          SPEED_CHANGE_INTERVAL_MAXIMUM_MILLISECONDS
        );
    }

    // Move toward target speed smoothly with some jitter.
    const speedError = this.targetSpeed - this.speed;
    this.accelerationScalar +=
      SPEED_GAIN_TOWARDS_TARGET * speedError * deltaSeconds;
    this.accelerationScalar +=
      (Math.random() * 2 - 1) * SPEED_ACCELERATION_JITTER * deltaSeconds;
    this.accelerationScalar *= Math.exp(-SPEED_DAMPING * deltaSeconds);
    this.speed += this.accelerationScalar * deltaSeconds;
    this.speed = clamp(this.speed, SPEED_MINIMUM, SPEED_MAXIMUM);

    // Smooth random steering to create curved paths.
    this.angularSpeed +=
      (Math.random() * 2 - 1) * WANDER_ANGULAR_ACCELERATION * deltaSeconds;
    // Exponential damping to keep angular velocity attracted toward 0.
    this.angularSpeed *= Math.exp(-WANDER_ANGULAR_DAMPING * deltaSeconds);

    // Soft avoidance of the content rectangle if provided.
    if (contentRectangleInCanvas) {
      const obstacle = contentRectangleInCanvas;
      // Nearest point on rectangle to current position (or the fly's own
      // position if inside the rectangle).
      const nearestX = Math.max(
        obstacle.left,
        Math.min(this.x, obstacle.right)
      );
      const nearestY = Math.max(
        obstacle.top,
        Math.min(this.y, obstacle.bottom)
      );

      // Avoid the rectangle if its closest point is close enough.
      const awayX = this.x - nearestX;
      const awayY = this.y - nearestY;
      const distanceToObstacle = Math.hypot(awayX, awayY);
      if (
        distanceToObstacle > 0 &&
        distanceToObstacle < CONTENT_AVOIDANCE_INFLUENCE_RADIUS_PIXELS
      ) {
        const desiredAwayHeading = Math.atan2(awayY, awayX);
        let error = normalizeAngleSigned(desiredAwayHeading - this.heading);
        const proximity =
          1 - distanceToObstacle / CONTENT_AVOIDANCE_INFLUENCE_RADIUS_PIXELS;
        // Introduce angular acceleration based on angle error and proximity.
        let angularAccelerationScalar =
          CONTENT_AVOIDANCE_TURN_GAIN * error * proximity;
        // Clamp angular acceleration and apply to angular speed.
        angularAccelerationScalar = clamp(
          angularAccelerationScalar,
          -CONTENT_AVOIDANCE_TURN_ACCELERATION_CAP,
          CONTENT_AVOIDANCE_TURN_ACCELERATION_CAP
        );
        this.angularSpeed += angularAccelerationScalar * deltaSeconds;
      }
    }

    // Mouse repulsion (similar to content avoidance).
    if (mousePosition && mousePosition.active) {
      const awayX = this.x - mousePosition.x;
      const awayY = this.y - mousePosition.y;
      const distanceToMouse = Math.hypot(awayX, awayY);
      if (
        distanceToMouse > 0 &&
        distanceToMouse < MOUSE_AVOIDANCE_INFLUENCE_RADIUS_PIXELS
      ) {
        const desiredAwayHeading = Math.atan2(awayY, awayX);
        let error = normalizeAngleSigned(desiredAwayHeading - this.heading);
        const proximity =
          1 - distanceToMouse / MOUSE_AVOIDANCE_INFLUENCE_RADIUS_PIXELS;
        // Introduce angular acceleration based on angle error and proximity.
        let angularAccelerationScalar =
          MOUSE_AVOIDANCE_TURN_GAIN * error * proximity;
        // Clamp angular acceleration and apply to angular speed.
        angularAccelerationScalar = clamp(
          angularAccelerationScalar,
          -MOUSE_AVOIDANCE_TURN_ACCELERATION_CAP,
          MOUSE_AVOIDANCE_TURN_ACCELERATION_CAP
        );
        this.angularSpeed += angularAccelerationScalar * deltaSeconds;

        // Apply a brief speed boost while repelled by mouse.
        const durationMilliseconds =
          MOUSE_AVOIDANCE_MAXIMUM_BOOST_DURATION_MILLISECONDS;
        const durationMillisecondsWithProximity =
          durationMilliseconds * (0.5 + 0.5 * proximity);
        if (
          this.mouseBoostMillisecondsRemaining <
          durationMillisecondsWithProximity
        ) {
          this.mouseBoostMillisecondsRemaining =
            durationMillisecondsWithProximity;
        }

        // Additive radial push to escape even before fully turning away.
        const normalizedX = awayX / distanceToMouse;
        const normalizedY = awayY / distanceToMouse;
        const push = MOUSE_AVOIDANCE_PUSH_MAXIMUM_PIXELS_PER_SECOND * proximity;
        escapePushVelocityX += normalizedX * push;
        escapePushVelocityY += normalizedY * push;
      }
    }

    // Clamp angular speed after repulsion applied.
    this.angularSpeed = clamp(
      this.angularSpeed,
      -WANDER_MAXIMUM_ANGULAR_VELOCITY,
      WANDER_MAXIMUM_ANGULAR_VELOCITY
    );

    // Update heading based on angular speed.
    this.heading += this.angularSpeed * deltaSeconds;

    // Boost radial speed while repelled by mouse.
    let boostedSpeed = this.speed;
    if (this.mouseBoostMillisecondsRemaining > 0) {
      const maxBoostDurationMilliseconds =
        MOUSE_AVOIDANCE_MAXIMUM_BOOST_DURATION_MILLISECONDS;
      // What fraction of the boost multiple to apply based on the remaining
      // duration of the boost, which is itself based on mouse proximity.
      const boostAlpha =
        this.mouseBoostMillisecondsRemaining / maxBoostDurationMilliseconds;
      const maxBoostMultiple = 1.25; // +125%.
      const clampedAlpha = Math.max(0, Math.min(1, boostAlpha));
      boostedSpeed = this.speed * (1 + maxBoostMultiple * clampedAlpha);
      this.mouseBoostMillisecondsRemaining = Math.max(
        0,
        this.mouseBoostMillisecondsRemaining - deltaSeconds * 1000
      );
    }

    // Compute velocity from heading and boosted speed.
    this.velocityX = Math.cos(this.heading) * boostedSpeed;
    this.velocityY = Math.sin(this.heading) * boostedSpeed;

    // Predict new position for computing trail segments without applying wrap
    // so that the trail does not jump across edges.
    const newX = this.x + (this.velocityX + escapePushVelocityX) * deltaSeconds;
    const newY = this.y + (this.velocityY + escapePushVelocityY) * deltaSeconds;

    // Commit new position.
    this.x = newX;
    this.y = newY;

    // Wrap around the viewport with a small margin.
    const margin = this.sizePixels;
    if (this.x < -margin) {
      this.x = viewportWidth + margin;
    }
    if (this.x > viewportWidth + margin) {
      this.x = -margin;
    }
    if (this.y < -margin) {
      this.y = viewportHeight + margin;
    }
    if (this.y > viewportHeight + margin) {
      this.y = -margin;
    }

    // Return the unwrapped position for the trail segments.
    return { unwrappedX: newX, unwrappedY: newY };
  }

  /**
   * Draws the fly to a canvas rendering context.
   *
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    ctx.save();
    // Disable smoothing so the pixel-art sprite rasterizes crisply.
    ctx.imageSmoothingEnabled = false;
    ctx.translate(this.x, this.y);
    // Mirror the sprite horizontally when traveling in the -X direction (rather
    // than rotating it around its center).
    if (this.velocityX < 0) {
      ctx.scale(-1, 1);
    }
    if (flyImageLoaded) {
      // Draw centered at `(x, y)` using `sizePixels` as both width and height.
      ctx.drawImage(
        flyImage,
        -this.sizePixels / 2,
        -this.sizePixels / 2,
        this.sizePixels,
        this.sizePixels
      );
    }
    ctx.restore();
  }
}
