/** @typedef {import("./typings.js").GeoJSONArea} GeoJSONArea */
/** @typedef {import("./typings.js").BoundingBox} BoundingBox */
/** @typedef {import("./typings.js").SunMode} SunMode */
/** @typedef {import("./typings.js").WaterCanvasElement} WaterCanvasElement */

import {
  SUN_AZIMUTH_DEFAULT,
  SUN_ELEVATION_DEFAULT,
  TERRAIN_MODE_NIGHT,
  WATER_BACKGROUND_DAY,
  WATER_BACKGROUND_NIGHT,
  WATER_CYCLE_SPEED_RADIANS_PER_SECOND,
  WATER_PIXEL_DENSITY,
  WATER_PIXEL_DRAW_SIZE,
  WATER_PIXEL_GAP,
  WATER_PIXEL_MAX_INTENSITY,
  WATER_PIXEL_MIN_BRIGHTNESS,
  WATER_PIXEL_MIN_INTENSITY,
  WATER_PIXEL_SIZE,
  WATER_TERRAIN_MAX_PROXIMITY_PIXELS,
} from "./constants.js";

/**
 * Class for rendering water with an animated pixel bloom effect that resembles
 * currents or waves.
 *
 * Terrain coordinates (with actual data) are punched out as transparent within
 * this canvas.
 */
export class WaterCanvas {
  /**
   * @param {number} width
   * @param {number} height
   * @param {number} minLon
   * @param {number} minLat
   * @param {number} maxLon
   * @param {number} maxLat
   * @param {GeoJSONArea} terrainArea - GeoJSON `MultiPolygon` or `Polygon`
   */
  constructor(width, height, minLon, minLat, maxLon, maxLat, terrainArea) {
    // Reduce canvas resolution to 25% of pixels (50% width × 50% height) since
    // this dramatically improves MapLibre performance.
    this.width = Math.round(width * 0.25);
    this.height = Math.round(height * 0.25);
    this.minLon = minLon;
    this.minLat = minLat;
    this.maxLon = maxLon;
    this.maxLat = maxLat;
    this.terrainArea = terrainArea;

    // Dynamic sun position (can be updated).
    this.sunAzimuth = SUN_AZIMUTH_DEFAULT;
    this.sunElevation = SUN_ELEVATION_DEFAULT;

    // Sun's coordinates for directional lighting.
    this.sunLon = null;
    this.sunLat = null;

    // Helpful alpha mask for determining where terrain is (generated from this
    // canvas's alpha channel after the terrain GeoJSON is punched out of it).
    this.alphaMask = null;

    /** @type {SunMode} */
    this.mode = 0;

    this.canvas = this.createCanvas();
    this.setUpPixelBloom();
  }

  /**
   * Creates the canvas and draws the terrain mask.
   *
   * @returns {HTMLCanvasElement}
   * @private
   */
  createCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d");
    if (!(ctx instanceof CanvasRenderingContext2D)) {
      throw new Error("CanvasRenderingContext2D not supported");
    }
    ctx.imageSmoothingEnabled = false;

    // Fill entire canvas with blue background (not necessarily the final
    // background color we will use).
    // This is needed for compositing mode `destination-out` to work properly.
    ctx.fillStyle = "#1a4d8c";
    ctx.fillRect(0, 0, this.width, this.height);

    /**
     * @param {number} lon
     * @returns {number}
     */
    const lonToX = (lon) =>
      ((lon - this.minLon) / (this.maxLon - this.minLon)) * this.width;

    /**
     * @param {number} lat
     * @returns {number}
     */
    const latToY = (lat) =>
      ((this.maxLat - lat) / (this.maxLat - this.minLat)) * this.height;

    // Draw boundary paths and use compositing mode `destination-out` to punch
    // holes. Only draw exterior rings (the first ring of each polygon) to punch
    // out the land area. Inner rings (holes) are not drawn for now to simplify.
    ctx.globalCompositeOperation = "destination-out";

    /**
     * Draws an exterior ring (first ring) of a polygon.
     *
     * @param {Array<[number, number]>} exteriorRing - Exterior ring coordinates
     */
    const drawExteriorRing = (exteriorRing) => {
      ctx.beginPath();
      const [firstLon, firstLat] = exteriorRing[0];
      ctx.moveTo(lonToX(firstLon), latToY(firstLat));
      for (let i = 1; i < exteriorRing.length; i++) {
        const [lon, lat] = exteriorRing[i];
        ctx.lineTo(lonToX(lon), latToY(lat));
      }
      ctx.closePath();
      ctx.fill();
    };

    if (this.terrainArea.type === "MultiPolygon") {
      for (const polygon of this.terrainArea.coordinates) {
        drawExteriorRing(/** @type {Array<[number, number]>} */ (polygon[0]));
      }
    } else if (this.terrainArea.type === "Polygon") {
      drawExteriorRing(
        /** @type {Array<[number, number]>} */ (this.terrainArea.coordinates[0])
      );
    }

    // Reset compositing mode for future drawing.
    ctx.globalCompositeOperation = "source-over";
    return canvas;
  }

  /**
   * Sets up and starts the pixel bloom animation.
   *
   * @private
   */
  setUpPixelBloom() {
    const ctx = this.canvas.getContext("2d");
    if (!(ctx instanceof CanvasRenderingContext2D)) {
      throw new Error("CanvasRenderingContext2D not supported");
    }

    // Save the alpha mask after punching out the terrain (for preserving
    // transparency in that region.
    const imageDataWithTerrainHole = ctx.getImageData(
      0,
      0,
      this.width,
      this.height
    );
    this.alphaMask = new Uint8Array(imageDataWithTerrainHole.data.length / 4);
    for (let i = 0; i < this.alphaMask.length; i++) {
      this.alphaMask[i] = imageDataWithTerrainHole.data[i * 4 + 3];
    }

    // Base colors for the pixel bloom effect.
    /** @type {[number, number, number][]} */
    const baseColors = [
      [255, 255, 255],
      [240, 240, 255],
      [255, 255, 250],
    ];

    // Base background colors.
    const getBackgroundColor = () => {
      if (this.mode < TERRAIN_MODE_NIGHT) {
        return WATER_BACKGROUND_DAY;
      } else {
        return WATER_BACKGROUND_NIGHT;
      }
    };

    /**
     * @type {Array<{x: number, y: number, phase: number, color: [number, number, number], speed: number}>}
     */
    const pixels = [];
    const cols = Math.ceil(this.width / (WATER_PIXEL_SIZE + WATER_PIXEL_GAP));
    const rows = Math.ceil(this.height / (WATER_PIXEL_SIZE + WATER_PIXEL_GAP));

    // Generate pixels for the pixel bloom effect.
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (Math.random() > WATER_PIXEL_DENSITY) continue;

        const x = col * (WATER_PIXEL_SIZE + WATER_PIXEL_GAP);
        const y = row * (WATER_PIXEL_SIZE + WATER_PIXEL_GAP);

        // Skip pixel if outside the canvas bounds.
        if (!(x >= 0 && x < this.width && y >= 0 && y < this.height)) {
          continue;
        }

        // Skip pixel if location is in a transparent area (land).
        const pixelIdx = y * this.width + x;
        if (
          pixelIdx >= 0 &&
          pixelIdx < this.alphaMask.length &&
          this.alphaMask[pixelIdx] === 0
        ) {
          continue;
        }

        // Skip pixel if too close to terrain.
        if (this.isNearTerrain(x, y)) {
          continue;
        }

        // Calculate pixel phase and color.
        const phase = Math.random() * Math.PI * 2;
        const color = baseColors[Math.floor(Math.random() * baseColors.length)];
        const speedVariation = 0.5 + Math.random() * 1.0;
        const finalSpeed =
          WATER_CYCLE_SPEED_RADIANS_PER_SECOND * speedVariation;

        // Calculate pixel position in the grid based on size and gap
        // parameters.
        const gridSpacing = WATER_PIXEL_SIZE + (WATER_PIXEL_GAP || 1);
        const currentGroup = Math.floor(
          (x / gridSpacing + y / gridSpacing) * 0.5
        );

        // Calculate a group phase so pixels in the same grid area have some
        // shared periodicity.
        const groupPhase = (currentGroup % 8) * 0.4;

        pixels.push({
          x,
          y,
          phase: phase + groupPhase,
          color,
          speed: finalSpeed,
        });
      }
    }

    // Pre-allocate bloom-specific `ImageData` for faster updates.
    const imageData = ctx.createImageData(this.width, this.height);
    const data = imageData.data;
    const totalPixels = this.width * this.height;

    // Create background buffer (pre-filled with background color).
    // Alpha is set to 0 for terrain areas to preserve transparency.
    const backgroundBuffer = new Uint8ClampedArray(totalPixels * 4);
    const updateBackgroundBuffer = () => {
      const bg = getBackgroundColor();
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        backgroundBuffer[idx] = bg.r;
        backgroundBuffer[idx + 1] = bg.g;
        backgroundBuffer[idx + 2] = bg.b;
        backgroundBuffer[idx + 3] =
          this.alphaMask && this.alphaMask[i] === 0 ? 0 : 255;
      }
    };
    updateBackgroundBuffer();

    // Pre-compute pixel indices for faster access.
    const pixelIndices = pixels.map((pixel) => {
      const pixelIdx = Math.floor(pixel.y) * this.width + Math.floor(pixel.x);
      return {
        x: pixel.x,
        y: pixel.y,
        phase: pixel.phase,
        color: pixel.color,
        speed: pixel.speed,
        pixelIdx: pixelIdx,
      };
    });

    // We use a pattern here where all animation methods are bound to the canvas
    // itself and manipulated externally via the `WaterCanvasElement` interface
    // (Cursor thought this would be a good idea and I rolled with it).
    const canvasWithState = /** @type {WaterCanvasElement} */ (this.canvas);
    canvasWithState.pixelIndices = pixelIndices;

    // Animation state (captured by the `drawPixels` closure).
    let frameCount = 0;
    let animationStarted = false;
    /** @type {number | null} */
    let animationFrameId = null;
    let isPaused = false; // Pause state during map interactions.
    let animationStartTime = 0;
    let totalPausedDuration = 0;
    let pauseStartTime = 0;

    /**
     * Draws the pixel bloom effect using direct `ImageData` manipulation. The
     * primary callback for the animation loop.
     */
    const drawPixels = () => {
      if (!animationStarted || isPaused) {
        // Still schedule next frame even when paused, but don't render.
        animationFrameId = requestAnimationFrame(drawPixels);
        return;
      }
      frameCount++;

      // Fast-copy background buffer as the render base.
      data.set(backgroundBuffer);

      // Draw each pixel with animated intensity directly into `ImageData`.
      // Use time-based animation (not frame-based) for consistent speed.
      // Account for any pause duration to continue from the same state.
      const currentTime = Date.now();
      const elapsedTimeMs =
        currentTime - animationStartTime - totalPausedDuration;
      const timeSeconds = elapsedTimeMs * 0.001;

      for (let i = 0; i < pixelIndices.length; i++) {
        const pixel = pixelIndices[i];
        // Compute a base intensity value for the pixel based on its phase
        // and speed.
        const baseIntensity =
          WATER_PIXEL_MIN_INTENSITY +
          (WATER_PIXEL_MAX_INTENSITY - WATER_PIXEL_MIN_INTENSITY) *
            (0.5 + 0.5 * Math.sin(timeSeconds * pixel.speed + pixel.phase));
        // Calculate a directional intensity value for the pixel based on its
        // position and the sun's position (not really directional so much as
        // distance-based right now).
        const directionalIntensity = this.calculateDirectionalIntensity(
          pixel.x,
          pixel.y
        );
        let intensity = baseIntensity * directionalIntensity;
        // Enforce a minimum brightness to prevent pixels from being too dark.
        intensity = Math.max(WATER_PIXEL_MIN_BRIGHTNESS, intensity);

        // When the sun is low in the sky and some pixels are quite dark, affect
        // the contrast curve to make low-lit pixels more visibly distinct from
        // each other.
        const lowElevationFactor = Math.max(
          0,
          Math.min(1, (this.sunElevation - 45) / 45)
        );
        const contrastExponent = 0.5 + lowElevationFactor * 0.2;
        intensity = Math.pow(intensity, contrastExponent);

        // Blend between background and pixel color based on intensity.
        // When intensity is at minimum, use background; at maximum, use pixel
        // color.
        const normalizedIntensity = Math.max(0, Math.min(1, intensity));
        const bg = getBackgroundColor();
        const r = pixel.color[0];
        const g = pixel.color[1];
        const b = pixel.color[2];
        const finalR = Math.round(bg.r + (r - bg.r) * normalizedIntensity);
        const finalG = Math.round(bg.g + (g - bg.g) * normalizedIntensity);
        const finalB = Math.round(bg.b + (b - bg.b) * normalizedIntensity);

        // Draw logical pixel (which may consist of multiple canvas pixels).
        const px = pixel.x;
        const py = pixel.y;
        for (let dy = 0; dy < WATER_PIXEL_DRAW_SIZE; dy++) {
          for (let dx = 0; dx < WATER_PIXEL_DRAW_SIZE; dx++) {
            const drawX = Math.round(px + dx);
            const drawY = Math.round(py + dy);
            if (
              drawX >= 0 &&
              drawX < this.width &&
              drawY >= 0 &&
              drawY < this.height
            ) {
              const drawIdx = (drawY * this.width + drawX) * 4;
              if (
                this.alphaMask &&
                this.alphaMask[drawY * this.width + drawX] > 0
              ) {
                data[drawIdx] = finalR;
                data[drawIdx + 1] = finalG;
                data[drawIdx + 2] = finalB;
                data[drawIdx + 3] = 255;
              }
            }
          }
        }
      }

      // Update canvas and schedule next frame.
      ctx.putImageData(imageData, 0, 0);
      animationFrameId = requestAnimationFrame(drawPixels);
    };

    // Bind animation lifecycle methods to the canvas element.
    canvasWithState.startPixelBloom = () => {
      if (!animationStarted) {
        animationStarted = true;
        animationStartTime = Date.now();
        totalPausedDuration = 0;
        drawPixels();
      }
    };
    canvasWithState.stopPixelBloom = () => {
      animationStarted = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };
    canvasWithState.pausePixelBloom = () => {
      if (!isPaused && animationStarted) {
        isPaused = true;
        pauseStartTime = Date.now();
      }
    };
    canvasWithState.resumePixelBloom = () => {
      if (isPaused && animationStarted) {
        // Add the duration of this pause to the total paused duration.
        const pauseDuration = Date.now() - pauseStartTime;
        totalPausedDuration += pauseDuration;
        isPaused = false;
      }
    };

    // Store `updateBackgroundBuffer` for externally-driven updates to the
    // background color.
    canvasWithState.updateBackgroundBuffer = updateBackgroundBuffer;
  }

  /**
   * Checks if a water pixel is within `WATER_TERRAIN_MAX_PROXIMITY_PIXELS`
   * pixels of terrain (land) in the cardinal directions.
   *
   * @param {number} waterX - X coordinate in water canvas
   * @param {number} waterY - Y coordinate in water canvas
   * @returns {boolean} True if pixel is within proximity distance of terrain
   * @private
   */
  isNearTerrain(waterX, waterY) {
    if (WATER_TERRAIN_MAX_PROXIMITY_PIXELS <= 0 || !this.alphaMask) {
      return false;
    }

    const directions = [
      { dx: 0, dy: -1 }, // Up.
      { dx: 0, dy: 1 }, // Down.
      { dx: -1, dy: 0 }, // Left.
      { dx: 1, dy: 0 }, // Right.
    ];

    for (const direction of directions) {
      for (let dist = 1; dist <= WATER_TERRAIN_MAX_PROXIMITY_PIXELS; dist++) {
        const checkX = Math.round(waterX + direction.dx * dist);
        const checkY = Math.round(waterY + direction.dy * dist);

        if (
          checkX >= 0 &&
          checkX < this.width &&
          checkY >= 0 &&
          checkY < this.height
        ) {
          const idx = checkY * this.width + checkX;
          // If alpha is 0 (transparent), we expect terrain.
          if (this.alphaMask[idx] === 0) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Calculates lighting intensity based on distance from sun to pixel.
   *
   * Pixels closer to the sun are brighter and pixels farther away are darker.
   *
   * @param {number} canvasX - X coordinate in water canvas
   * @param {number} canvasY - Y coordinate in water canvas
   * @returns {number} Intensity value (0-1)
   * @private
   */
  calculateDirectionalIntensity(canvasX, canvasY) {
    // If we don't have sun position, fall back to even lighting.
    if (this.sunLon === null || this.sunLat === null) {
      return 1.0;
    }

    // Convert canvas pixel to longitude and latitude.
    const pixelLon =
      this.minLon + (canvasX / this.width) * (this.maxLon - this.minLon);
    const pixelLat =
      this.maxLat - (canvasY / this.height) * (this.maxLat - this.minLat);

    // Account for latitude scaling; longitude distances vary with latitude
    const averageLat = (this.sunLat + pixelLat) / 2;
    const latScaleFactor = Math.cos((averageLat * Math.PI) / 180);

    // Calculate distance from sun to pixel.
    const dx = (pixelLon - this.sunLon) * latScaleFactor;
    const dy = pixelLat - this.sunLat;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate maximum possible distance within the water canvas bounds.
    // This is the diagonal distance from one corner to the opposite corner.
    const maxDx = (this.maxLon - this.minLon) * latScaleFactor;
    const maxDy = this.maxLat - this.minLat;
    const maxDistance = Math.sqrt(maxDx * maxDx + maxDy * maxDy);

    // Normalize distance to 0-1 range (0 = closest to sun and 1 = farthest).
    const normalizedDistance = maxDistance > 0 ? distance / maxDistance : 0;

    // Invert: Closer to sun (small distance) = brighter (high intensity).
    // Farther from sun (large distance) = darker (low intensity).
    let distanceIntensity = 1.0 - normalizedDistance;

    // Apply quick fall-off curve so brightness drops off quickly with distance.
    // In night mode, use an even stronger dropoff for more dramatic lighting.
    const fallOffExponent = this.mode < 2 ? 2.0 : 8.0;
    distanceIntensity = Math.pow(distanceIntensity, fallOffExponent);
    return distanceIntensity;
  }

  /**
   * Starts the pixel bloom animation (creates new animation state).
   */
  startAnimation() {
    const ctx = this.canvas.getContext("2d");
    if (!(ctx instanceof CanvasRenderingContext2D)) {
      throw new Error("CanvasRenderingContext2D not supported");
    }

    const canvasWithState = /** @type {WaterCanvasElement} */ (this.canvas);
    if (canvasWithState.startPixelBloom) {
      canvasWithState.startPixelBloom();
    }
  }

  /**
   * Stops the pixel bloom animation (resets the animation state).
   */
  stopAnimation() {
    const canvasWithCleanup = /** @type {WaterCanvasElement} */ (this.canvas);
    if (canvasWithCleanup.stopPixelBloom) {
      canvasWithCleanup.stopPixelBloom();
    }
  }

  /**
   * Pauses the pixel bloom animation (preserves the animation state).
   */
  pauseAnimation() {
    const canvasWithState = /** @type {WaterCanvasElement} */ (this.canvas);
    if (canvasWithState.pausePixelBloom) {
      canvasWithState.pausePixelBloom();
    }
  }

  /**
   * Resumes the pixel bloom animation (continues from the paused state).
   */
  resumeAnimation() {
    const canvasWithState = /** @type {WaterCanvasElement} */ (this.canvas);
    if (canvasWithState.resumePixelBloom) {
      canvasWithState.resumePixelBloom();
    }
  }

  /**
   * Updates the sun position, which is used by the canvas render loop to
   * calculate directional intensity values for each pixel.
   *
   * @param {number} azimuth - Sun azimuth in degrees (0-360; clockwise from North)
   * @param {number} elevation - Sun elevation in degrees (0-90; above horizon)
   * @param {number} [sunLon] - Sun's actual longitude (for proper directional lighting)
   * @param {number} [sunLat] - Sun's actual latitude (for proper directional lighting)
   */
  setSunPosition(azimuth, elevation, sunLon, sunLat) {
    this.sunAzimuth = azimuth;
    this.sunElevation = elevation;

    if (sunLon !== undefined) {
      this.sunLon = sunLon;
    }
    if (sunLat !== undefined) {
      this.sunLat = sunLat;
    }
  }

  /**
   * Sets the sun mode, which is used by the canvas render loop to determine the
   * background color.
   *
   * Since the background color is part of a pre-allocated buffer, updates to it
   * need to be signaled manually and are not pulled by the render loop.
   *
   * @param {SunMode} mode - Mode value (0, 1, or 2)
   */
  setSunMode(mode) {
    this.mode = mode;
    const canvasWithState = /** @type {WaterCanvasElement} */ (this.canvas);
    if (canvasWithState.updateBackgroundBuffer) {
      canvasWithState.updateBackgroundBuffer();
    }
  }
}
