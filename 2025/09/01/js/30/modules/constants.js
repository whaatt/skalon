/*
 * Simulation constants.
 */

/*
 * Shared types.
 */

/**
 * @typedef {Object} Rectangle
 * @property {number} left
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 */

/*
 * Fly configuration.
 */

export const FLY_SPRITE_SOURCE = "assets/sprite-64.png";
export const FLY_SIZE_PIXELS = 64;
export const INITIAL_FLY_COUNT = 10;

/*
 * Trail configuration.
 */

/**
 * The distance between emitted dashes.
 *
 * @type {number}
 */
export const TRAIL_SPACING_PIXELS = 32;
/**
 * The length of each dash.
 *
 * @type {number}
 */
export const TRAIL_SEGMENT_LENGTH_PIXELS = 10;
/**
 * The fade duration per dash.
 *
 * @type {number}
 */
export const TRAIL_SEGMENT_FADE_DURATION_SECONDS = 20;
export const TRAIL_COLOR = "rgba(255, 0, 255, 1)";
export const TRAIL_LINE_WIDTH = 2;

/*
 * Wander configuration.
 */

/**
 * The maximum angular velocity in radians per second.
 *
 * @type {number}
 */
export const WANDER_MAXIMUM_ANGULAR_VELOCITY = 2 * Math.PI;
/**
 * The angular acceleration in radians per second squared.
 *
 * @type {number}
 */
export const WANDER_ANGULAR_ACCELERATION = 2 * Math.PI;
/**
 * The exponential damping factor for angular velocity.
 *
 * @type {number}
 */
export const WANDER_ANGULAR_DAMPING = 1;

/*
 * Content area soft avoidance configuration.
 */

/**
 * The distance within which avoidance applies.
 *
 * @type {number}
 */
export const CONTENT_AVOIDANCE_INFLUENCE_RADIUS_PIXELS = 140;
/**
 * The gain factor for accelerating turns in the away direction (per unit of
 * proximity).
 *
 * @type {number}
 */
export const CONTENT_AVOIDANCE_TURN_GAIN = 3.0;
/**
 * The cap on turn acceleration in radians per second squared.
 *
 * @type {number}
 */
export const CONTENT_AVOIDANCE_TURN_ACCELERATION_CAP = 8 * Math.PI;

/*
 * Mouse repulsion configuration.
 */

/**
 * The distance within which mouse repulsion applies.
 *
 * @type {number}
 */
export const MOUSE_AVOIDANCE_INFLUENCE_RADIUS_PIXELS = 160;
/**
 * The gain factor for accelerating turns in the away direction (per unit of
 * proximity).
 *
 * @type {number}
 */
export const MOUSE_AVOIDANCE_TURN_GAIN = 5.0;
/**
 * The cap on turn acceleration in radians per second squared.
 *
 * @type {number}
 */
export const MOUSE_AVOIDANCE_TURN_ACCELERATION_CAP = 8 * Math.PI;
/**
 * The maximum radial push away from mouse in pixels per second.
 *
 * @type {number}
 */
export const MOUSE_AVOIDANCE_PUSH_MAXIMUM_PIXELS_PER_SECOND = 180;
/**
 * The maximum duration of the boost while experiencing mouse repulsion.
 *
 * @type {number}
 */
export const MOUSE_AVOIDANCE_MAXIMUM_BOOST_DURATION_MILLISECONDS = 250;

/*
 * Base speed configuration.
 */

export const SPEED_MINIMUM = 60;
export const SPEED_MAXIMUM = 200;
/**
 * The gain factor for moving toward the target speed (per second).
 *
 * @type {number}
 */
export const SPEED_GAIN_TOWARDS_TARGET = 3.0;
/**
 * The random acceleration in pixels per second squared.
 *
 * @type {number}
 */
export const SPEED_ACCELERATION_JITTER = 30;
/**
 * The exponential damping factor for speed.
 *
 * @type {number}
 */
export const SPEED_DAMPING = 2.0;
/**
 * The minimum interval between speed changes in milliseconds.
 *
 * @type {number}
 */
export const SPEED_CHANGE_INTERVAL_MINIMUM_MILLISECONDS = 1200;
/**
 * The maximum interval between speed changes in milliseconds.
 *
 * @type {number}
 */
export const SPEED_CHANGE_INTERVAL_MAXIMUM_MILLISECONDS = 3000;

/*
 * Elements.
 */

export const contentElement = /** @type {HTMLDivElement} */ (
  document.getElementById("content")
);
if (!(contentElement instanceof HTMLDivElement)) {
  throw new Error("Content element not found");
}

export const downloadElement = /** @type {HTMLAnchorElement} */ (
  document.getElementById("download")
);
if (!(downloadElement instanceof HTMLAnchorElement)) {
  throw new Error("Download element not found");
}

export const canvasElement = /** @type {HTMLCanvasElement} */ (
  document.getElementById("flies")
);
if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error("Canvas element not found");
}
