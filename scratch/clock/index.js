// @ts-check
// Disclaimer: Mostly vibe-coded.

/**
 * @typedef {{
 *   data: Uint8ClampedArray,
 *   width: number,
 *   height: number,
 * }} ImageDataLike
 */

// Display parameter constants.
const DISPLAY_PARAMS = {
  // `BACKGROUND` and `BACKGROUND_LIGHT_MODE` are now hardcoded.
  PARTICLE_COLORS: [
    "#0000FF", // Pure Blue.
    "#0040FF", // Electric Blue.
    "#0080FF", // Bright Blue.
    "#00BFFF", // Deep Sky Blue.
    "#4080FF", // Light Electric Blue.
    "#6495ED", // Cornflower Blue.
    "#1E90FF", // Dodger Blue.
    "#87CEEB", // Sky Blue.
    "#4169E1", // Royal Blue.
    "#0066CC", // Medium Blue.
  ],
  EXPELLED_COLORS_FOREGROUND: ["#000000"],
  EXPELLED_COLORS_FOREGROUND_LIGHT_MODE: ["#FFFFFF"],
  EXPELLED_COLORS_BACKGROUND: ["#FF66FF"],
  DEBUG_OVERLAY_ALPHA: 1,
  FONT_FAMILY: "Barlow, sans-serif",
  DEBUG_FONT: "14px Barlow, sans-serif",
};

// Physics and behavior constants.
const PHYSICS_PARAMS = {
  FONT_SIZE_BASE_FOR_PIXELS_PER_FRAME: 200,
  SPAWN_PROBABILITY_IN_BOUNDING_BOX: 0.05,
  SPAWN_PROBABILITY_IN_BOUNDING_BOX_FADE: 0.95,
  // These values are not adjusted for font size.
  BASE_VELOCITY_PIXELS_PER_FRAME: 3,
  BASE_VELOCITY_PIXELS_PER_FRAME_FADE: 0.5,
  MAX_VELOCITY_PIXELS_PER_FRAME: 10,
  BOUNCE_THRESHOLD_FRAMES: 0,
  BOUNCE_THRESHOLD_FRAMES_FADE: 0,
  MAX_BOUNCES_UNTIL_DEATH: 50,
  OFF_SCREEN_DEATH_MARGIN: 10,
  RANDOM_ACCELERATION_STRENGTH: 0.1,
  EXPULSION_STRENGTH_PIXELS_PER_FRAME: 2,
  EXPELLED_FADE_FRAMES: 600, // Frames over which expelled particles fade out.
  ATTRACTION_FORCE_STRENGTH_PIXELS: 2,
  ATTRACTOR_CACHE_FRAMES: 600, // How long to keep same attractor point.
  MOUSE_FORCE_STRENGTH: 50, // Strength of mouse interaction force.
  MOUSE_FORCE_RADIUS_MULTIPLIER: 0.5, // Mouse radius as ratio of font size.
};

// Engine configuration constants.
const ENGINE_CONFIG = {
  DEFAULT_TEXT: "Hello\nWorld",
  DEFAULT_FONT_SIZE_WIDTH_MULTIPLIER: 0.15,
  PADDING_PERCENT_OF_CANVAS: 0.1,
  LINE_HEIGHT_MULTIPLIER: 1,
  TEXT_LEFT_POSITION: 50,
  MAX_PARTICLES: 30000,
  PARTICLE_SIZE_NO_FADE: 1,
};

/**
 * URL hash fragment utilities for preference management.
 */
class URLPreferences {
  /**
   * Gets a parameter from the URL hash fragment.
   * @param {string} key - The parameter key.
   * @returns {string | null} The parameter value or null if not found.
   */
  static getFromHash(key) {
    const hash = window.location.hash.substring(1); // Remove the `#`.
    if (!hash) return null;

    const params = new URLSearchParams(hash);
    return params.get(key);
  }

  /**
   * Sets a parameter in the URL hash fragment.
   * @param {string} key - The parameter key.
   * @param {string} value - The parameter value.
   */
  static setInHash(key, value) {
    const hash = window.location.hash.substring(1); // Remove the `#`.
    const params = new URLSearchParams(hash);
    params.set(key, value);

    // Update the URL hash without triggering a page reload.
    const newHash = params.toString();
    history.replaceState(
      null,
      "",
      newHash ? `#${newHash}` : window.location.pathname
    );
  }

  /**
   * Loads a boolean preference with URL hash priority.
   * @param {string} key - The preference key.
   * @param {boolean} defaultValue - The default value if not found anywhere.
   * @returns {boolean} The preference value.
   */
  static loadBooleanPreference(key, defaultValue) {
    // Check URL hash first.
    const hashValue = this.getFromHash(key);
    if (hashValue !== null) {
      const boolValue = hashValue === "true";
      // Sync to `localStorage`.
      localStorage.setItem(key, boolValue.toString());
      return boolValue;
    }

    // Check `localStorage` second.
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const boolValue = stored === "true";
      // Sync to URL hash.
      this.setInHash(key, boolValue.toString());
      return boolValue;
    }

    // Use default value and sync to both.
    this.setInHash(key, defaultValue.toString());
    localStorage.setItem(key, defaultValue.toString());
    return defaultValue;
  }

  /**
   * Saves a boolean preference to both localStorage and URL hash.
   * @param {string} key - The preference key.
   * @param {boolean} value - The preference value.
   */
  static saveBooleanPreference(key, value) {
    const stringValue = value.toString();
    localStorage.setItem(key, stringValue);
    this.setInHash(key, stringValue);
  }
}

/**
 * Represents a single particle in the text engine.
 */
class Particle {
  /**
   * Creates a new particle.
   * @param {number} x - Initial x position.
   * @param {number} y - Initial y position.
   * @param {ParticleTextEngine} engine - Reference to the text engine instance.
   */
  constructor(x, y, engine) {
    this.x = x;
    this.y = y;
    this.engine = engine;
    this.vx = (Math.random() - 0.5) * 2 * this.baseVelocity;
    this.vy = (Math.random() - 0.5) * 2 * this.baseVelocity;
    this.color = this.getRandomColor();
    // Track bounces.
    this.bounces = 0;
    this.maxBounces = PHYSICS_PARAMS.MAX_BOUNCES_UNTIL_DEATH;
    // Store original speed.
    this.initialSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    // Track how long particle has been inside text.
    this.incursionFrames = 0;
    // True if particle was trapped by text changing.
    this.wasTrappedByTextChange = false;
    // True if particle has been expelled and should fly off screen.
    this.isExpelled = false;
    // Track how many frames this particle has been expelled for.
    this.expelledFrames = 0;
    // Cached attractor point for consistent attraction.
    this.attractorX = 0;
    this.attractorY = 0;
    this.attractorCacheFrames = 0;
  }

  get size() {
    return this.engine.isHighTrailFade
      ? Math.max(1, Math.min(3, Math.floor(this.engine.fontSize() * 0.025)))
      : ENGINE_CONFIG.PARTICLE_SIZE_NO_FADE;
  }

  get baseVelocity() {
    return this.engine.isHighTrailFade
      ? PHYSICS_PARAMS.BASE_VELOCITY_PIXELS_PER_FRAME_FADE
      : PHYSICS_PARAMS.BASE_VELOCITY_PIXELS_PER_FRAME;
  }

  get bounceThreshold() {
    return this.engine.isHighTrailFade
      ? PHYSICS_PARAMS.BOUNCE_THRESHOLD_FRAMES_FADE
      : PHYSICS_PARAMS.BOUNCE_THRESHOLD_FRAMES;
  }

  /**
   * Gets a random color from the particle color palette.
   * @returns {string} A hex color string.
   */
  getRandomColor() {
    const colors = DISPLAY_PARAMS.PARTICLE_COLORS;
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Updates the particle's position and state.
   * @returns {boolean} True if particle is still alive; false otherwise.
   */
  update() {
    // If particle is expelled, just move it and don't apply other logic.
    if (this.isExpelled) {
      this.expelledFrames++; // Increment expelled frame counter.
      this.x += this.vx;
      this.y += this.vy;

      // Check if expelled particle has gone off screen.
      const margin = PHYSICS_PARAMS.OFF_SCREEN_DEATH_MARGIN * 5;
      if (
        this.x < -margin ||
        this.x > this.engine.canvas.width + margin ||
        this.y < -margin ||
        this.y > this.engine.canvas.height + margin
      ) {
        return false; // Particle is dead, needs respawning.
      }
      return true; // Still alive and flying.
    }

    // Store old position for collision detection.
    const oldX = this.x;
    const oldY = this.y;

    // Apply subtle attractive force toward text boundaries.
    this.applyTextAttraction();

    // Apply strong expulsive force if overlapping text.
    this.applyTextExpulsion();

    // Add random unit acceleration for curved motion (not when expelled).
    const randomAngle = Math.random() * Math.PI * 2;
    const accelStrength = PHYSICS_PARAMS.RANDOM_ACCELERATION_STRENGTH;
    this.vx += Math.cos(randomAngle) * accelStrength;
    this.vy += Math.sin(randomAngle) * accelStrength;

    // Normalize velocity to maintain constant speed.
    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (currentSpeed > 0) {
      this.vx = (this.vx / currentSpeed) * this.initialSpeed;
      this.vy = (this.vy / currentSpeed) * this.initialSpeed;
    }

    // Apply mouse interaction force if mouse is pressed.
    this.applyMouseForce();

    // Update position.
    this.x += this.vx;
    this.y += this.vy;

    // Check collision with text bounds.
    const isCurrentlyInsideText = Particle.isInsideText(
      this.x,
      this.y,
      this.engine.textBounds,
      this.size
    );
    const wasInsideText = Particle.isInsideText(
      oldX,
      oldY,
      this.engine.textBounds,
      this.size
    );

    if (isCurrentlyInsideText) {
      if (!wasInsideText) {
        // Just entered text area, start counting incursion frames.
        this.incursionFrames = 1;
      } else {
        // Already inside, increment incursion counter.
        this.incursionFrames++;
      }

      // Only bounce if we've been inside for too long AND not trapped.
      if (
        this.incursionFrames > this.bounceThreshold &&
        !this.wasTrappedByTextChange
      ) {
        // Bounce off text boundary.
        this.x = oldX;
        this.y = oldY;

        // Simple bounce; reverse direction with some randomness.
        this.vx = -this.vx + (Math.random() - 0.5) * 2;
        this.vy = -this.vy + (Math.random() - 0.5) * 2;

        // Increment bounce counter.
        this.bounces++;

        // Kill particle if it has bounced too many times.
        if (this.bounces >= this.maxBounces) {
          return false; // Particle is dead.
        }
      }
    } else {
      // Outside text area, reset incursion counter and trapped flag.
      this.incursionFrames = 0;
      this.wasTrappedByTextChange = false;
    }

    // Check if particle has gone off screen.
    const margin = PHYSICS_PARAMS.OFF_SCREEN_DEATH_MARGIN;
    if (
      this.x < -margin ||
      this.x > this.engine.canvas.width + margin ||
      this.y < -margin ||
      this.y > this.engine.canvas.height + margin
    ) {
      return false; // Particle is dead, needs respawning.
    }

    return true; // Still alive.
  }

  /**
   * Checks if a point is inside the text bounds.
   * @param {number} x - X coordinate to check.
   * @param {number} y - Y coordinate to check.
   * @param {ImageDataLike|null} textBounds - Text bounds image data.
   * @param {number} particleSize - Size of the particle.
   * @returns {boolean} True if inside text; false otherwise.
   */
  static isInsideText(x, y, textBounds, particleSize) {
    if (!textBounds) return false;

    const imageData = textBounds.data;
    const width = textBounds.width;

    // Check collision for the entire particle square, not just center.
    for (let dx = 0; dx < particleSize; dx++) {
      for (let dy = 0; dy < particleSize; dy++) {
        const pixelX = Math.floor(x + dx);
        const pixelY = Math.floor(y + dy);

        if (
          pixelX < 0 ||
          pixelX >= width ||
          pixelY < 0 ||
          pixelY >= textBounds.height
        ) {
          continue; // Skip out-of-bounds pixels.
        }

        const index = (pixelY * width + pixelX) * 4;
        if (imageData[index + 3] > 128) {
          return true; // Any part of the particle overlaps with text.
        }
      }
    }

    return false; // No part of the particle overlaps with text.
  }

  /**
   * Applies attractive force toward text boundaries.
   */
  applyTextAttraction() {
    const bounds = this.engine.getTextBounds();

    // Update cached attractor point if needed.
    if (this.attractorCacheFrames <= 0) {
      this.attractorX = bounds.left + Math.random() * bounds.totalWidth;
      this.attractorY = bounds.top + Math.random() * bounds.totalHeight;
      this.attractorCacheFrames = PHYSICS_PARAMS.ATTRACTOR_CACHE_FRAMES;
    } else {
      this.attractorCacheFrames--;
    }

    // Calculate attractive force toward cached attractor point.
    const dx = this.attractorX - this.x;
    const dy = this.attractorY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Apply simple distance-based force.
    const force =
      PHYSICS_PARAMS.ATTRACTION_FORCE_STRENGTH_PIXELS *
      (this.engine.fontSize() /
        PHYSICS_PARAMS.FONT_SIZE_BASE_FOR_PIXELS_PER_FRAME) *
      (1 / (distance * 0.1 + 1));

    // Apply force toward attraction point.
    this.vx += (dx / distance) * force;
    this.vy += (dy / distance) * force;

    // Limit velocity.
    const maxVelocity = PHYSICS_PARAMS.MAX_VELOCITY_PIXELS_PER_FRAME;
    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (currentSpeed > maxVelocity) {
      this.vx = (this.vx / currentSpeed) * maxVelocity;
      this.vy = (this.vy / currentSpeed) * maxVelocity;
    }
  }

  /**
   * Handles particles trapped by text changes by respawning them.
   */
  applyTextExpulsion() {
    // If particle was trapped by text change, expel it and add a particle.
    if (this.wasTrappedByTextChange && !this.isExpelled) {
      // Set expelled state.
      this.isExpelled = true;
      // TODO: Understand why this changes behavior. Does it?
      this.wasTrappedByTextChange = false;

      // Blast particle in negative direction with extreme force.
      const currentAngle = Math.atan2(this.vy, this.vx);
      const expulsionStrength =
        PHYSICS_PARAMS.EXPULSION_STRENGTH_PIXELS_PER_FRAME *
        (this.engine.fontSize() /
          PHYSICS_PARAMS.FONT_SIZE_BASE_FOR_PIXELS_PER_FRAME);
      this.vx = Math.cos(currentAngle) * expulsionStrength;
      this.vy = Math.sin(currentAngle) * expulsionStrength;

      // IGNORED: Create a smaller bounding box around the current particle
      // position.
      // const localRadius = this.engine.fontSize() * 0.05;
      // const localBounds = {
      //   left: Math.max(0, this.x - localRadius),
      //   right: Math.min(this.engine.canvas.width, this.x + localRadius),
      //   top: Math.max(0, this.y - localRadius),
      //   bottom: Math.min(this.engine.canvas.height, this.y + localRadius),
      // };

      // IGNORED: Spawn a new particle with local bounds.
      // const newParticle = this.engine.spawnInTextBoundingBox(localBounds);
      // if (newParticle) {
      //   this.engine.particles.add(newParticle);
      // }
    }
  }

  /**
   * Applies mouse interaction force.
   */
  applyMouseForce() {
    // Only apply force if particle is not expelled.
    if (this.isExpelled) {
      return;
    }

    // Calculate distance from particle to mouse.
    const dx = this.x - this.engine.mouseX;
    const dy = this.y - this.engine.mouseY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Get dynamic mouse force radius.
    const mouseRadius = this.engine.getMouseForceRadius();

    // Apply force only if particle is within influence radius.
    if (distance < mouseRadius && distance > 0) {
      // Calculate force strength based on distance (stronger when closer).
      const forceStrength =
        PHYSICS_PARAMS.MOUSE_FORCE_STRENGTH * (1 - distance / mouseRadius);

      if (this.engine.isMouseDown) {
        // Mouse button down: Apply outward expulsive force.
        const forceX = (dx / distance) * forceStrength;
        const forceY = (dy / distance) * forceStrength;

        this.vx += forceX;
        this.vy += forceY;
      }
      // Mouse hovering: No particle force applied, visual effect handled in
      // draw method.
    }
  }

  /**
   * Draws the particle on the canvas.
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context.
   */
  draw(ctx) {
    let fillColor;

    // Handle expelled particles with fade-out effect.
    if (this.isExpelled) {
      // Calculate fade-out alpha based on expelled frames.
      const fadeProgress = Math.min(
        this.expelledFrames / PHYSICS_PARAMS.EXPELLED_FADE_FRAMES,
        1
      );
      const alpha = Math.max(1 - fadeProgress, 0);

      // Skip drawing if completely faded out.
      if (alpha <= 0) {
        return;
      }

      // Use expelled color for expelled particles.
      const expelledColors = Particle.isInsideText(
        this.x,
        this.y,
        this.engine.textBounds,
        this.size
      )
        ? this.engine.isLightMode
          ? DISPLAY_PARAMS.EXPELLED_COLORS_FOREGROUND_LIGHT_MODE
          : DISPLAY_PARAMS.EXPELLED_COLORS_FOREGROUND
        : DISPLAY_PARAMS.EXPELLED_COLORS_BACKGROUND;
      fillColor =
        expelledColors[Math.floor(Math.random() * expelledColors.length)];

      // Apply fade-out alpha.
      ctx.save();
      ctx.globalAlpha = alpha;
    } else {
      fillColor = this.color;
    }

    // Check if particle should be gray (mouse hovering but not pressed and on
    // screen).
    if (!this.engine.isMouseDown && this.engine.isMouseOnScreen()) {
      const dx = this.x - this.engine.mouseX;
      const dy = this.y - this.engine.mouseY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < this.engine.getMouseForceRadius()) {
        // Dark gray for light mode and light gray for dark mode.
        fillColor = this.engine.isLightMode ? "#BA8E23" : "#C0C0C0";
      }
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.size, this.size);

    // Restore canvas state if we modified it for expelled particles.
    if (this.isExpelled) {
      ctx.restore();
    }
  }
}

/**
 * Main particle text engine class.
 */
class ParticleTextEngine {
  /**
   * Creates a new particle text engine.
   * @param {HTMLCanvasElement} canvas - The canvas element.
   */
  constructor(canvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    this.ctx = ctx;
    /** @type {Set<Particle>} */
    this.particles = new Set();
    this.text = ENGINE_CONFIG.DEFAULT_TEXT;
    this.cachedInnerWidth = window.innerWidth;
    this.fontSize = () =>
      this.cachedInnerWidth * ENGINE_CONFIG.DEFAULT_FONT_SIZE_WIDTH_MULTIPLIER;
    /** @type {ImageDataLike|null} */
    this.textBounds = null;
    this.maxParticles = ENGINE_CONFIG.MAX_PARTICLES;
    this.showDebug = false;
    this.showShortcuts = this.loadShortcutsPreference();
    /** @type {HTMLCanvasElement|null} */
    this.debugCanvas = null;

    // Mouse interaction state.
    this.mouseX = 0;
    this.mouseY = 0;
    this.isMouseDown = false;
    this.isMouseOverCanvas = false;

    // Touch interaction state.
    this.isTouching = false;

    // Light mode state.
    this.isLightMode = this.loadLightModePreference();

    // Trail fade state.
    this.isHighTrailFade = this.loadTrailFadePreference();

    // Show seconds state.
    this.showSeconds = this.loadShowSecondsPreference();

    // FPS tracking.
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 0;
    this.fpsUpdateInterval = 500; // Update FPS every 500 milliseconds.
    this.lastFpsUpdate = performance.now();

    // Get debug overlay element.
    this.debugOverlay = /** @type {HTMLElement} */ (
      document.getElementById("debug-overlay")
    );

    this.setupCanvas();
    this.setupKeyboard();
    this.setupMouse();

    // Set initial body background color.
    this.updateBodyBackground();

    // Set the initial clock text BEFORE spawning particles.
    this.updateText(getCurrentDateTime(this.showSeconds));
    this.spawnAllParticles();
    this.animate();
  }

  /**
   * Sets up the canvas and resize handling.
   */
  setupCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    window.addEventListener("resize", () => {
      this.cachedInnerWidth = window.innerWidth;
      this.canvas.width = this.cachedInnerWidth;
      this.canvas.height = window.innerHeight;
      this.updateTextBounds();
    });
  }

  /**
   * Sets up keyboard event handlers.
   */
  setupKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "d") {
        this.showDebug = !this.showDebug;
      } else if (e.key.toLowerCase() === "m") {
        this.isLightMode = !this.isLightMode;
        this.saveLightModePreference();
        this.updateBodyBackground();
        this.clearCanvas();
        this.spawnAllParticles();
      } else if (e.key.toLowerCase() === "f") {
        this.isHighTrailFade = !this.isHighTrailFade;
        this.saveTrailFadePreference();
        this.clearCanvas();
        this.spawnAllParticles();
      } else if (e.key.toLowerCase() === "h" && !this.showDebug) {
        this.showShortcuts = !this.showShortcuts;
        this.saveShortcutsPreference();
      } else if (e.key.toLowerCase() === "s") {
        this.showSeconds = !this.showSeconds;
        this.saveShowSecondsPreference();
      }
    });
  }

  /**
   * Loads light mode preference from URL hash, `localStorage`, or system
   * preference.
   * @returns {boolean} True for light mode; false for dark mode.
   */
  loadLightModePreference() {
    // Check URL hash first, then localStorage, then system preference.
    const systemDefault = !window.matchMedia("(prefers-color-scheme: dark)")
      .matches;
    return URLPreferences.loadBooleanPreference("lightMode", systemDefault);
  }

  /**
   * Saves light mode preference to both `localStorage` and URL hash.
   */
  saveLightModePreference() {
    URLPreferences.saveBooleanPreference("lightMode", this.isLightMode);
  }

  /**
   * Loads trail fade preference from URL hash, `localStorage`, or default.
   * @returns {boolean} True for high trail fade (0.01); false for low (0.0001).
   */
  loadTrailFadePreference() {
    // Check URL hash first, then localStorage, then default to low trail fade.
    return URLPreferences.loadBooleanPreference("trailFade", false);
  }

  /**
   * Saves trail fade preference to both `localStorage` and URL hash.
   */
  saveTrailFadePreference() {
    URLPreferences.saveBooleanPreference("trailFade", this.isHighTrailFade);
  }

  /**
   * Loads shortcuts preference from URL hash, `localStorage`, or default.
   * @returns {boolean} True to show shortcuts; false to hide them.
   */
  loadShortcutsPreference() {
    // Check URL hash first, then `localStorage`, then default to showing
    // shortcuts.
    return URLPreferences.loadBooleanPreference("showShortcuts", true);
  }

  /**
   * Saves shortcuts preference to both `localStorage` and URL hash.
   */
  saveShortcutsPreference() {
    URLPreferences.saveBooleanPreference("showShortcuts", this.showShortcuts);
  }

  /**
   * Loads show seconds preference from URL hash, `localStorage`, or default.
   * @returns {boolean} True to show seconds; false to hide them.
   */
  loadShowSecondsPreference() {
    // Check URL hash first, then `localStorage`, then default to showing
    // seconds.
    return URLPreferences.loadBooleanPreference("showSeconds", true);
  }

  /**
   * Saves show seconds preference to both `localStorage` and URL hash.
   */
  saveShowSecondsPreference() {
    URLPreferences.saveBooleanPreference("showSeconds", this.showSeconds);
  }

  /**
   * Gets the current trail fade alpha value based on preference.
   * @returns {number} Trail fade alpha value.
   */
  getTrailFadeAlpha() {
    return this.isHighTrailFade ? 1 : 0.0001;
  }

  /**
   * Clears the canvas with the appropriate background color.
   */
  clearCanvas() {
    this.ctx.fillStyle = this.isLightMode ? "#FFFFFF" : "#000000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Updates the body background color based on light mode state.
   */
  updateBodyBackground() {
    document.body.style.backgroundColor = this.isLightMode ? "#FFF" : "#000";
  }

  /**
   * Sets up mouse and touch event handlers.
   */
  setupMouse() {
    // Track mouse position.
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.isMouseOverCanvas = true;
    });

    // Track mouse button state.
    this.canvas.addEventListener("mousedown", (e) => {
      this.isMouseDown = true;
    });

    this.canvas.addEventListener("mouseup", (e) => {
      this.isMouseDown = false;
    });

    // Handle mouse entering canvas.
    this.canvas.addEventListener("mouseenter", (e) => {
      this.isMouseOverCanvas = true;
    });

    // Handle mouse leaving canvas.
    this.canvas.addEventListener("mouseleave", (e) => {
      this.isMouseDown = false;
      this.isMouseOverCanvas = false;
    });

    // Touch event handlers:
    // - Tap: Immediate hover effect (particles change color)
    // - Drag: Triggers mousedown effect (particles pushed away; canvas cleared)
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault(); // Prevent scrolling and other default behaviors.
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      this.mouseX = touch.clientX - rect.left;
      this.mouseY = touch.clientY - rect.top;
      this.isTouching = true;
      this.isMouseOverCanvas = true;
      // Note: `isMouseDown` stays false on touch start.
      // Only hover effect.
    });

    // Dragging triggers the mouse down effect.
    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault(); // Prevent scrolling.
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      this.mouseX = touch.clientX - rect.left;
      this.mouseY = touch.clientY - rect.top;
      this.isMouseDown = true;
    });

    // Reset touch and mouse states.
    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.isTouching = false;
      this.isMouseDown = false;
      this.isMouseOverCanvas = false;
    });

    // Reset states.
    this.canvas.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      this.isTouching = false;
      this.isMouseDown = false;
      this.isMouseOverCanvas = false;
    });
  }

  /**
   * Updates the displayed text and font size.
   * @param {string} text - New text to display.
   */
  updateText(text) {
    this.text = text;
    this.updateTextBounds();
    this.markTrappedParticles(); // Mark particles trapped by new text.
  }

  /**
   * Updates the text bounds for collision detection.
   */
  updateTextBounds() {
    // Create temporary canvas to render text and get pixel data.
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    if (!tempCtx) return;

    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;

    // Ensure canvas is completely transparent.
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Set font and text properties.
    tempCtx.font = `bold ${this.fontSize()}px ${DISPLAY_PARAMS.FONT_FAMILY}`;
    tempCtx.textAlign = "left";
    tempCtx.textBaseline = "middle";
    tempCtx.fillStyle = "rgba(255, 255, 255, 1)";

    // Split text into lines and draw each line.
    const lines = this.text.split("\n");
    const lineHeight = this.fontSize() * ENGINE_CONFIG.LINE_HEIGHT_MULTIPLIER;
    const totalHeight = (lines.length - 1) * lineHeight;
    const startY = tempCanvas.height / 2 - totalHeight / 2;

    // Measure actual text dimensions for accurate bounding box.
    let maxTextWidth = 0;
    lines.forEach((line) => {
      const metrics = tempCtx.measureText(line);
      maxTextWidth = Math.max(maxTextWidth, metrics.width);
    });

    // Store measured dimensions for bounding box calculations.
    this.measuredTextWidth = maxTextWidth;
    this.measuredTextHeight = lines.length * lineHeight;

    // Calculate text position (will be left-aligned within centered bounding
    // box).
    const bounds = this.getTextBounds();

    lines.forEach((line, index) => {
      const y = startY + index * lineHeight;
      tempCtx.fillText(line, bounds.textX, y);
    });

    // Get image data for collision detection.
    this.textBounds = tempCtx.getImageData(
      0,
      0,
      tempCanvas.width,
      tempCanvas.height
    );

    // Store the temporary canvas for debugging.
    this.debugCanvas = tempCanvas;
  }

  /**
   * Gets the current mouse force radius based on font size.
   * @returns {number} Mouse force radius in pixels.
   */
  getMouseForceRadius() {
    return this.fontSize() * PHYSICS_PARAMS.MOUSE_FORCE_RADIUS_MULTIPLIER;
  }

  /**
   * Checks if the mouse or touch is currently on screen.
   * @returns {boolean} True if mouse is over the canvas or touch is active.
   */
  isMouseOnScreen() {
    return this.isMouseOverCanvas || this.isTouching;
  }

  /**
   * Gets standardized text bounding box information.
   * @returns {Object} Bounding box data.
   */
  getTextBounds() {
    const paddingWidth =
      this.canvas.width * ENGINE_CONFIG.PADDING_PERCENT_OF_CANVAS;
    const paddingHeight =
      this.canvas.height * ENGINE_CONFIG.PADDING_PERCENT_OF_CANVAS;
    const actualWidth = this.measuredTextWidth || 0;
    const actualHeight = this.measuredTextHeight || 0;

    // Center the bounding box on the page.
    const boundingBoxWidth = actualWidth + 2 * paddingWidth;
    const boundingBoxHeight = actualHeight + 2 * paddingHeight;
    const boundingBoxLeft = (this.canvas.width - boundingBoxWidth) / 2;
    const boundingBoxTop = (this.canvas.height - boundingBoxHeight) / 2;

    // Text is left-aligned within the centered bounding box.
    const textX = boundingBoxLeft + paddingWidth;
    const centerY = this.canvas.height / 2;

    return {
      textX,
      centerY,
      actualWidth,
      actualHeight,
      // Centered bounding box coordinates.
      left: boundingBoxLeft,
      right: boundingBoxLeft + boundingBoxWidth,
      top: boundingBoxTop,
      bottom: boundingBoxTop + boundingBoxHeight,
      // Total dimensions including padding.
      totalWidth: boundingBoxWidth,
      totalHeight: boundingBoxHeight,
      // Bounding box area.
      area: boundingBoxWidth * boundingBoxHeight,
    };
  }

  /**
   * Marks particles that are suddenly inside text as trapped.
   */
  markTrappedParticles() {
    if (!this.textBounds) return;

    // Mark particles that are suddenly inside text as trapped by change.
    // Only mark particles that weren't already naturally incurring.
    this.particles.forEach((particle) => {
      if (
        particle.incursionFrames === 0 && // Only particles not inside.
        Particle.isInsideText(
          particle.x,
          particle.y,
          this.textBounds,
          particle.size
        )
      ) {
        particle.wasTrappedByTextChange = true;
      }
    });
  }

  /**
   * Spawns all particles at once.
   */
  spawnAllParticles() {
    this.particles.clear();
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.add(this.spawnSingleParticle());
    }
  }

  /**
   * Spawns a single particle in the appropriate location.
   * @returns {Particle} A new particle instance.
   */
  spawnSingleParticle() {
    // Use simplified spawn probability.
    const boundingBoxSpawnProbability = this.isHighTrailFade
      ? PHYSICS_PARAMS.SPAWN_PROBABILITY_IN_BOUNDING_BOX_FADE
      : PHYSICS_PARAMS.SPAWN_PROBABILITY_IN_BOUNDING_BOX;

    // Spawn inside text bounding box but not overlapping glyphs.
    if (Math.random() < boundingBoxSpawnProbability) {
      const newParticle = this.spawnInTextBoundingBox();
      if (newParticle) {
        return newParticle;
      }
    }

    // Spawn elsewhere on screen.
    const x = Math.random() * this.canvas.width;
    const y = Math.random() * this.canvas.height;
    return new Particle(x, y, this);
  }

  /**
   * Spawns a particle within the text bounding box.
   * @returns {Particle | null} A new particle instance.
   */
  spawnInTextBoundingBox(bounds = this.getTextBounds()) {
    const {
      left: boxLeft,
      right: boxRight,
      top: boxTop,
      bottom: boxBottom,
    } = bounds;

    const getPointInBox = () => {
      const x = boxLeft + Math.random() * (boxRight - boxLeft);
      const y = boxTop + Math.random() * (boxBottom - boxTop);
      return [x, y];
    };

    // Text overlap checking.
    let [x, y] = getPointInBox();
    let attempts = 0;
    while (Particle.isInsideText(x, y, this.textBounds, 1)) {
      attempts++;
      if (attempts > 10) {
        return null;
      }
      [x, y] = getPointInBox();
    }

    return new Particle(x, y, this);
  }

  /**
   * Updates all particles and handles respawning.
   */
  update() {
    // Update particles and handle respawning.
    const particlesToRemove = [];
    for (const particle of this.particles) {
      if (!particle.update()) {
        // Particle went off screen; mark for replacement.
        particlesToRemove.push(particle);
      }
    }

    // Remove dead particles and add new ones.
    for (const deadParticle of particlesToRemove) {
      this.particles.delete(deadParticle);
      this.particles.add(this.spawnSingleParticle());
    }
  }

  /**
   * Draws the entire scene.
   */
  draw() {
    // Create subtle trails with simple fade overlay
    const trailAlpha = this.getTrailFadeAlpha();
    this.ctx.fillStyle = this.isLightMode
      ? `rgba(255, 255, 255, ${trailAlpha})`
      : `rgba(0, 0, 0, ${trailAlpha})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Clear pixels around mouse cursor when button is pressed
    if (this.isMouseDown) {
      this.ctx.save();
      this.ctx.globalCompositeOperation = "destination-out";
      this.ctx.fillStyle = "rgba(255, 255, 255, 1)"; // Full opacity clear.
      this.ctx.beginPath();
      this.ctx.arc(
        this.mouseX,
        this.mouseY,
        this.getMouseForceRadius(),
        0,
        Math.PI * 2
      );
      this.ctx.fill();
      this.ctx.restore();
    }

    // Draw particles.
    this.particles.forEach((particle) => particle.draw(this.ctx));

    // Optional: Draw debug text bounds.
    if (this.showDebug && this.debugCanvas) {
      this.ctx.save();
      this.ctx.globalAlpha = DISPLAY_PARAMS.DEBUG_OVERLAY_ALPHA;
      this.ctx.drawImage(this.debugCanvas, 0, 0);
      this.ctx.restore();
    }

    // Draw debug bounding box.
    if (this.showDebug) {
      const bounds = this.getTextBounds();
      this.ctx.save();
      this.ctx.strokeStyle = "#00FF00"; // Bright green for visibility.
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        bounds.left,
        bounds.top,
        bounds.totalWidth,
        bounds.totalHeight
      );

      // Draw center cross for reference.
      this.ctx.strokeStyle = "#FF0000"; // Red center marker.
      this.ctx.lineWidth = 1;
      // Horizontal line.
      this.ctx.beginPath();
      this.ctx.moveTo(bounds.left, bounds.centerY);
      this.ctx.lineTo(bounds.right, bounds.centerY);
      this.ctx.stroke();
      // Vertical line at text start.
      this.ctx.beginPath();
      this.ctx.moveTo(bounds.textX, bounds.top);
      this.ctx.lineTo(bounds.textX, bounds.bottom);
      this.ctx.stroke();

      this.ctx.restore();
    }

    // Draw mouse interaction radius in debug mode.
    if (this.showDebug && this.isMouseDown) {
      this.ctx.save();
      this.ctx.strokeStyle = "#FF6600"; // Orange for mouse interaction.
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(
        this.mouseX,
        this.mouseY,
        this.getMouseForceRadius(),
        0,
        Math.PI * 2
      );
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Update debug overlay.
    this.updateDebugOverlay();
  }

  /**
   * Updates FPS tracking.
   */
  updateFps() {
    const currentTime = performance.now();
    this.frameCount++;

    // Update FPS every interval.
    if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = Math.round(
        (this.frameCount * 1000) / (currentTime - this.lastFpsUpdate)
      );
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
    }
  }

  /**
   * Updates the debug overlay DOM element.
   */
  updateDebugOverlay() {
    if (!this.debugOverlay) return;
    const debugInfo = [];

    if (this.showDebug) {
      const bounds = this.getTextBounds();
      debugInfo.push(
        `FPS: ${this.fps}`,
        `Bounds: ${Math.round(bounds.totalWidth)}x${Math.round(
          bounds.totalHeight
        )}`,
        `Particles: ${this.particles.size}`,
        `Debug: On`,
        `Mouse Over: ${this.isMouseOverCanvas ? "Yes" : "No"}`,
        `Mouse Down: ${this.isMouseDown ? "Yes" : "No"}`,
        `Touch Active: ${this.isTouching ? "Yes" : "No"}`
      );
    } else if (this.showShortcuts) {
      debugInfo.push(`[M] = Toggle Light`);
      debugInfo.push(`[F] = Toggle Fade`);
      debugInfo.push(`[S] = Toggle Seconds`);
      debugInfo.push(`[H] = Toggle Info`);
    }

    this.debugOverlay.innerHTML = debugInfo.join("<br>");
  }

  /**
   * Main animation loop.
   */
  animate() {
    this.updateFps();
    this.update();
    this.draw();
    requestAnimationFrame(() => this.animate());
  }
}

// Initialize.
const canvas = /** @type {HTMLCanvasElement} */ (
  document.getElementById("canvas")
);
if (!canvas) throw new Error("Canvas element not found");
const engine = new ParticleTextEngine(canvas);

/**
 * Formats the current date and time for display.
 * @param {boolean} showSeconds - Whether to show seconds.
 * @returns {string} Formatted date and time string.
 */
function getCurrentDateTime(showSeconds) {
  const now = new Date();

  // Format date as YYYY-MM-DD.
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;

  // Format time as HH:MM:SS.
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const time = `${hours}:${minutes}${showSeconds ? `:${seconds}` : ""}`;

  return `${date}\n${time}`;
}

/**
 * Updates the clock display with current date and time.
 */
function updateClock() {
  const dateTimeText = getCurrentDateTime(engine.showSeconds);
  engine.updateText(dateTimeText);
}

// Start the clock timer (first update already happened in constructor).
setInterval(updateClock, 1000);
