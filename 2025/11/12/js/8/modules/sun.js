/** @typedef {import("./typings.js").MapLibreMap} MapLibreMap */
/** @typedef {import("./typings.js").MapLibreMarker} MapLibreMarker */
/** @typedef {import("./typings.js").MapLibreCanvasSource} MapLibreCanvasSource */
/** @typedef {import("./typings.js").BoundingBox} BoundingBox */
/** @typedef {import("./typings.js").LonLat} LonLat */
/** @typedef {import("./typings.js").SunMode} SunMode */
/** @typedef {import("./manager.js").TerrainManager} TerrainManager */

import {
  MAP_LAYER_SUN,
  MAP_SOURCE_SUN_CANVAS,
  SUN_AZIMUTH_DEFAULT,
  SUN_CANVAS_SIZE,
  SUN_CONE_HALF_ANGLE_DEGREES,
  SUN_DOUBLE_TAP_DELAY_MS,
  SUN_ELEVATION_DEFAULT,
  SUN_GLOW_RADIUS,
  SUN_MARKER_CLASS,
  SUN_MARKER_SIZE,
  SUN_MAX_CONE_LENGTH,
  SUN_RADIUS,
} from "./constants.js";
import { TerrainCanvas } from "./terrain.js";
import { WaterCanvas } from "./water.js";

/**
 * Class for managing a draggable sun that controls lighting.
 *
 * The sun's position relative to the bbox center defines azimuth/elevation
 * for both water and terrain hillshade rendering.
 *
 * Uses MapLibre's Marker API for native draggability (although the drag target
 * is a transparent proxy element instead of the sun itself).
 */
export class SunController {
  /**
   * @param {MapLibreMap} map - MapLibre map instance
   * @param {TerrainCanvas} terrainCanvas - `TerrainCanvas` instance
   * @param {WaterCanvas | null} waterCanvas - `WaterCanvas` instance (optional)
   * @param {TerrainManager} terrainManager - `TerrainManager` instance for accessing DEM
   * @param {BoundingBox} waterBbox - Bounding box of water canvas
   * @param {BoundingBox} terrainBbox - Bounding box of terrain
   * @param {LonLat} terrainCenter - Center point of terrain bbox
   * @param {function(number, number): void} savePosition - Callback to save sun position (longitude and latitude)
   * @param {function(SunMode): void} saveMode - Callback to save sun mode
   * @param {function(): void} onDragStart - Custom callback upon starting a drag
   * @param {function(): void} onDragEnd - Custom callback upon ending a drag
   * @param {LonLat | null} [initialPosition] - Initial sun position (optional; restored from `localStorage`)
   * @param {SunMode | null} [initialMode] - Initial sun mode (optional; restored from `localStorage`)
   */
  constructor(
    map,
    terrainCanvas,
    waterCanvas,
    terrainManager,
    waterBbox,
    terrainBbox,
    terrainCenter,
    savePosition,
    saveMode,
    onDragStart,
    onDragEnd,
    initialPosition = null,
    initialMode = null
  ) {
    this.map = map;
    this.terrainCanvas = terrainCanvas;
    this.waterCanvas = waterCanvas;
    this.terrainManager = terrainManager;
    this.waterBbox = waterBbox;
    this.terrainBbox = terrainBbox;
    this.terrainCenter = terrainCenter;
    this.saveSunPosition = savePosition;
    this.saveSunMode = saveMode;
    this.onDragStart = onDragStart;
    this.onDragEnd = onDragEnd;

    /** @type {SunMode} */
    this.mode = initialMode !== null ? initialMode : 0;
    this.terrainCanvas.setSunMode(this.mode);
    if (this.waterCanvas) {
      this.waterCanvas.setSunMode(this.mode);
    }

    // Initialize sun position (use saved position if available).
    this.sunPosition = initialPosition || this.calculateInitialSunPosition();

    // Create sun canvas and context for rendering sun/aura/cone.
    this.sunCanvas = this.createSunCanvas();
    const ctx = this.sunCanvas.getContext("2d");
    if (!(ctx instanceof CanvasRenderingContext2D)) {
      throw new Error("CanvasRenderingContext2D not supported");
    }
    this.sunCtx = ctx;

    // Add sun canvas as a MapLibre canvas source (positioned at sun location).
    this.addSunCanvasSource();

    // Create draggable marker (transparent element covering sun/aura area).
    this.markerElement = this.createTransparentMarker();
    this.marker = /** @type {MapLibreMarker} */ (
      // @ts-ignore
      new maplibregl.Marker({
        element: this.markerElement,
        draggable: true,
      })
    )
      .setLngLat([this.sunPosition.lon, this.sunPosition.lat])
      .addTo(map);

    // Set up drag event handlers (marker position proxies to canvas layer).
    this.setUpDragEventHandlers();

    // Initialize water and terrain canvases with sun position (don't save to
    // storage on initial load). This also re-draws the marker and sun canvas.
    this.renderSunAtPosition(this.sunPosition, false);

    // Update canvas coordinates on zoom- and move-end to maintain a consistent
    // screen size for the sun.
    this.map.on("zoomend", () => {
      this.updateSunCanvasCoordinates();
    });
    this.map.on("moveend", () => {
      this.updateSunCanvasCoordinates();
    });
  }

  /**
   * Creates the canvas for sun/aura/cone rendering (separate from the proxy
   * marker).
   *
   * @returns {HTMLCanvasElement}
   * @private
   */
  createSunCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = SUN_CANVAS_SIZE;
    canvas.height = SUN_CANVAS_SIZE;
    return canvas;
  }

  /**
   * Creates a transparent marker element that only covers the sun/aura area
   * (not the cone).
   *
   * This is the draggable MapLibre `Marker`.
   *
   * @returns {HTMLElement}
   * @private
   */
  createTransparentMarker() {
    const element = document.createElement("div");
    element.className = SUN_MARKER_CLASS;
    element.style.width = `${SUN_MARKER_SIZE}px`;
    element.style.height = `${SUN_MARKER_SIZE}px`;
    element.style.borderRadius = "50%";
    element.style.cursor = "pointer";
    element.style.position = "relative";
    element.style.backgroundColor = "transparent";
    element.style.border = "none";
    // GPU acceleration hints for smooth movement.
    element.style.willChange = "transform";
    element.style.transform = "translateZ(0)";
    return element;
  }

  /**
   * Adds the sun canvas as a MapLibre canvas source and layer.
   *
   * @private
   */
  addSunCanvasSource() {
    const corners = this.calculateCanvasCorners();

    // Add canvas source.
    this.map.addSource(MAP_SOURCE_SUN_CANVAS, {
      type: "canvas",
      canvas: this.sunCanvas,
      coordinates: corners,
      animate: true,
    });

    // Add layer (will be moved to top after all layers are added).
    this.map.addLayer({
      id: MAP_LAYER_SUN,
      type: "raster",
      source: MAP_SOURCE_SUN_CANVAS,
      paint: {
        "raster-opacity": 1.0,
        "raster-resampling": "linear",
        "raster-fade-duration": 0,
      },
    });

    // Store reference to source for updating coordinates.
    this.sunCanvasSource = this.map.getSource(MAP_SOURCE_SUN_CANVAS);
  }

  /**
   * Sets up drag event handlers.
   *
   * The marker position is proxied to update the sun canvas layer position.
   *
   * @private
   */
  setUpDragEventHandlers() {
    this.marker.on("drag", () => {
      // Get marker position (this is the draggable transparent marker).
      const coords = this.marker.getLngLat();
      // Validate coordinates and return if invalid.
      if (
        !coords ||
        !isFinite(coords.lng) ||
        !isFinite(coords.lat) ||
        isNaN(coords.lng) ||
        isNaN(coords.lat)
      ) {
        console.error(
          `SunController: Invalid marker coordinates during drag:`,
          coords
        );
        return;
      }

      const newPosition = { lon: coords.lng, lat: coords.lat };
      this.renderSunAtPosition(newPosition, false, true);
    });

    // Update cursor on drag start.
    this.marker.on("dragstart", () => {
      this.markerElement.style.cursor = "grabbing";
      this.onDragStart();
    });

    // Finalize position on drag end
    this.marker.on("dragend", () => {
      this.markerElement.style.cursor = "grab";

      // Get final marker position.
      const coords = this.marker.getLngLat();
      // Validate coordinates and reset position if necessary.
      if (
        !coords ||
        !isFinite(coords.lng) ||
        !isFinite(coords.lat) ||
        isNaN(coords.lng) ||
        isNaN(coords.lat)
      ) {
        console.error(
          `SunController: Invalid marker coordinates on \`dragend\`:`,
          coords
        );
        // Reset to default position using `renderSunAtPosition`.
        const defaultPos = this.calculateInitialSunPosition();
        this.renderSunAtPosition(defaultPos, true, false);
        return;
      }

      const newPosition = { lon: coords.lng, lat: coords.lat };
      this.renderSunAtPosition(newPosition, true, false);
      this.onDragEnd();
    });

    // Add double-click handler to cycle through modes (plus a touch-compatible
    // version of the handler).
    this.markerElement.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.cycleMode();
    });
    let lastTouchTime = 0;
    this.markerElement.addEventListener("touchstart", (event) => {
      const now = Date.now();
      if (now - lastTouchTime < SUN_DOUBLE_TAP_DELAY_MS) {
        event.stopPropagation();
        event.preventDefault();
        this.cycleMode();
      }
      lastTouchTime = now;
    });
  }

  /**
   * Calculates the maximum distance for elevation calculations (2X the diagonal
   * from terrain center to terrain corner).
   *
   * @returns {number}
   * @private
   */
  getMaxDistanceForElevation() {
    const terrainMaxDistLon = Math.max(
      Math.abs(this.terrainBbox.maxLon - this.terrainCenter.lon),
      Math.abs(this.terrainBbox.minLon - this.terrainCenter.lon)
    );
    const terrainMaxDistLat = Math.max(
      Math.abs(this.terrainBbox.maxLat - this.terrainCenter.lat),
      Math.abs(this.terrainBbox.minLat - this.terrainCenter.lat)
    );
    const terrainDiagonal = Math.sqrt(
      terrainMaxDistLon * terrainMaxDistLon +
        terrainMaxDistLat * terrainMaxDistLat
    );
    return 2 * terrainDiagonal;
  }

  /**
   * Calculates an initial sun position using default elevation and azimuth.
   *
   * @returns {LonLat}
   * @private
   */
  calculateInitialSunPosition() {
    const maxDist = this.getMaxDistanceForElevation();
    const normalizedDist = 1 - SUN_ELEVATION_DEFAULT / 90;
    const initialSunDistance = normalizedDist * maxDist;
    const initialSunAzimuthRadians = (SUN_AZIMUTH_DEFAULT * Math.PI) / 180;
    return {
      lon:
        this.terrainCenter.lon +
        initialSunDistance * Math.sin(initialSunAzimuthRadians),
      lat:
        this.terrainCenter.lat +
        initialSunDistance * Math.cos(initialSunAzimuthRadians),
    };
  }

  /**
   * Calculates azimuth and elevation from sun position relative to terrain
   * center.
   *
   * Elevation saturates to 0° when distance exceeds 2X the terrain diagonal
   * from center to corner.
   *
   * @param {LonLat} sunPosition
   * @returns {[number, number]} [azimuth, elevation] in degrees
   * @private
   */
  calculateSunAngles(sunPosition) {
    // Calculate direction from terrain center to sun.
    const dx = sunPosition.lon - this.terrainCenter.lon;
    const dy = sunPosition.lat - this.terrainCenter.lat;

    // Calculate azimuth (angle from north going clockwise).
    let azimuth = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (azimuth < 0) {
      // Rotate to 0-360 range.
      azimuth += 360;
    }

    // Calculate distance from terrain center and normalize by a maximum
    // distance value.
    const maxDistance = this.getMaxDistanceForElevation();
    const distance = Math.sqrt(dx * dx + dy * dy);
    const normalizedDistance = distance / maxDistance;

    // Map distance to elevation (center is 90° and `maxDistance` is 90°).
    const elevation =
      normalizedDistance >= 1.0 ? 0 : 90 * (1 - normalizedDistance);
    return [azimuth, elevation];
  }

  /**
   * Calculates the canvas corners in latitude/longitude coordinates based on
   * sun position as the center point.
   *
   * Uses map projection to accurately convert pixel dimensions to geographic
   * coordinates.
   *
   * @returns {[[number, number], [number, number], [number, number], [number, number]]}
   * @private
   */
  calculateCanvasCorners() {
    // Validate sun position before using it.
    if (
      !isFinite(this.sunPosition.lon) ||
      !isFinite(this.sunPosition.lat) ||
      isNaN(this.sunPosition.lon) ||
      isNaN(this.sunPosition.lat)
    ) {
      console.error(
        `SunController: Invalid sun position (${this.sunPosition.lon}, ${this.sunPosition.lat}); resetting to default`
      );
      const defaultPosition = this.calculateInitialSunPosition();
      // Use `renderSunAtPosition` to handle the reset properly.
      this.renderSunAtPosition(defaultPosition, false);
      // Recalculate with valid position.
      return this.calculateCanvasCorners();
    }

    const canvasWidthPixels = SUN_CANVAS_SIZE;
    const canvasHeightPixels = SUN_CANVAS_SIZE;

    // Use map projection to convert pixel distances to geographic coordinates.
    // Get the center point in pixels.
    const centerPoint = this.map.project({
      lng: this.sunPosition.lon,
      lat: this.sunPosition.lat,
    });

    // Calculate half dimensions in pixels.
    const halfWidthPixels = canvasWidthPixels / 2;
    const halfHeightPixels = canvasHeightPixels / 2;

    // Calculate corner points in pixel space.
    const topLeftPx = [
      centerPoint.x - halfWidthPixels,
      centerPoint.y - halfHeightPixels,
    ];
    const topRightPx = [
      centerPoint.x + halfWidthPixels,
      centerPoint.y - halfHeightPixels,
    ];
    const bottomRightPx = [
      centerPoint.x + halfWidthPixels,
      centerPoint.y + halfHeightPixels,
    ];
    const bottomLeftPx = [
      centerPoint.x - halfWidthPixels,
      centerPoint.y + halfHeightPixels,
    ];

    // Convert pixel coordinates back to latitude/longitude.
    const topLeft = this.map.unproject(
      /** @type {[number, number]} */ (topLeftPx)
    );
    const topRight = this.map.unproject(
      /** @type {[number, number]} */ (topRightPx)
    );
    const bottomRight = this.map.unproject(
      /** @type {[number, number]} */ (bottomRightPx)
    );
    const bottomLeft = this.map.unproject(
      /** @type {[number, number]} */ (bottomLeftPx)
    );

    return [
      [topLeft.lng, topLeft.lat], // Top-left corner.
      [topRight.lng, topRight.lat], // Top-right corner.
      [bottomRight.lng, bottomRight.lat], // Bottom-right corner.
      [bottomLeft.lng, bottomLeft.lat], // Bottom-left corner.
    ];
  }

  /**
   * Clamps sun coordinates to valid bounds within the water canvas.
   *
   * @param {LonLat} position
   * @returns {LonLat}
   * @private
   */
  clampSunPosition(position) {
    return {
      lon: Math.max(
        this.waterBbox.minLon,
        Math.min(this.waterBbox.maxLon, position.lon)
      ),
      lat: Math.max(
        this.waterBbox.minLat,
        Math.min(this.waterBbox.maxLat, position.lat)
      ),
    };
  }

  /**
   * Updates the logical sun position, marker position, and canvas coordinates.
   *
   * Recalculates lighting for water and terrain.
   *
   * @param {LonLat} newPosition
   * @param {boolean} [saveToStorage = true] - Whether to save to `localStorage`
   * @param {boolean} [renderTerrainInLowQuality = false] - Use low quality mode for faster terrain rendering
   */
  renderSunAtPosition(
    newPosition,
    saveToStorage = true,
    renderTerrainInLowQuality = false
  ) {
    // Validate input
    if (
      !newPosition ||
      !isFinite(newPosition.lon) ||
      !isFinite(newPosition.lat) ||
      isNaN(newPosition.lon) ||
      isNaN(newPosition.lat)
    ) {
      console.error(
        `SunController: Invalid sun position update (${newPosition?.lon}, ${newPosition?.lat}); ignoring`
      );
      return;
    }

    // Update both the sun marker position and coordinates of the actual canvas.
    this.sunPosition = this.clampSunPosition(newPosition);
    this.marker.setLngLat([this.sunPosition.lon, this.sunPosition.lat]);
    this.updateSunCanvasCoordinates();
    this.drawSunWithCone();

    // Calculate azimuth and elevation.
    const [azimuth, elevation] = this.calculateSunAngles(this.sunPosition);

    // Notify water canvas if available.
    if (this.waterCanvas) {
      this.waterCanvas.setSunPosition(
        azimuth,
        elevation,
        this.sunPosition.lon,
        this.sunPosition.lat
      );
    }

    // Notify terrain canvas.
    this.updateTerrain(azimuth, elevation, renderTerrainInLowQuality);

    // Save to `localStorage` if requested.
    if (saveToStorage && this.saveSunPosition) {
      this.saveSunPosition(this.sunPosition.lon, this.sunPosition.lat);
    }
  }

  /**
   * Updates the sun canvas source coordinates when the sun position changes.
   *
   * @private
   */
  updateSunCanvasCoordinates() {
    if (!this.sunCanvasSource) {
      console.error("SunController: Sun canvas source not found");
      return;
    }

    const corners = this.calculateCanvasCorners();
    this.sunCanvasSource.setCoordinates(corners);
    this.map.triggerRepaint();
  }

  /**
   * Updates terrain with new sun position.
   *
   * @param {number} azimuth
   * @param {number} elevation
   * @param {boolean} [lowQuality = false] - Use low quality mode for faster rendering
   * @private
   */
  updateTerrain(azimuth, elevation, lowQuality = false) {
    const dem = this.terrainManager.getCurrentDem();
    if (!dem) {
      console.warn("SunController: No DEM available from TerrainManager");
      return;
    }
    this.terrainCanvas.setQualityMode(lowQuality ? "low" : "high");
    this.terrainCanvas.setSunPosition(azimuth, elevation);
    this.terrainCanvas.render();
    this.map.triggerRepaint();
  }

  /**
   * Draws the sun with a glowing cone pointing toward the terrain center.
   *
   * Mode determines cone visibility and sun/moon appearance.
   *
   * @private
   */
  drawSunWithCone() {
    if (!this.sunCtx || !this.sunCanvas) {
      console.error("SunController: Sun context or canvas not found");
      return;
    }

    const ctx = this.sunCtx;
    const canvas = this.sunCanvas;

    // Clear canvas.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate direction and distance from sun to terrain center.
    const averageLat = (this.sunPosition.lat + this.terrainCenter.lat) / 2;
    const latScaleFactor = Math.cos((averageLat * Math.PI) / 180);
    const dx = (this.terrainCenter.lon - this.sunPosition.lon) * latScaleFactor;
    const dy = this.terrainCenter.lat - this.sunPosition.lat;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Normalize direction vector.
    // Note: In canvas coordinates, Y increases downward, but latitude increases
    // upward (north). So we need to flip the Y direction to have the correct
    // visual representation when drawing on the canvas.
    const dirX = distance > 0 ? dx / distance : 0;
    const dirY = distance > 0 ? -dy / distance : 0;

    // Determine mode-specific settings.
    const drawCone = this.mode === 0; // Only mode 0 has a cone.
    const isMoon = this.mode === 2; // Mode 2 displays as a moon.

    // Calculate elevation to determine cone end radius.
    const [_, elevation] = this.calculateSunAngles(this.sunPosition);
    const coneLength = SUN_MAX_CONE_LENGTH * (1 - elevation / 90);
    const coneHalfAngleRad = (SUN_CONE_HALF_ANGLE_DEGREES * Math.PI) / 180;
    const coneTan = Math.tan(coneHalfAngleRad);

    // Calculate the cone start position on the side of the sun away from the
    // terrain center.
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const coneStartOffset = SUN_GLOW_RADIUS * 0.45;
    const coneStartX = centerX - dirX * coneStartOffset;
    const coneStartY = centerY - dirY * coneStartOffset;

    // Calculate cone end position (extending toward the terrain center).
    const coneEndX = coneStartX + dirX * (coneLength + coneStartOffset);
    const coneEndY = coneStartY + dirY * (coneLength + coneStartOffset);

    // Draw the cone as a series of layers (if enabled).
    if (drawCone) {
      const numConeLayers = 12; // More layers for smoother blending.
      for (let layer = 0; layer < numConeLayers; layer++) {
        const t = layer / (numConeLayers - 1); // 0 to 1 from start to cone end.

        // Interpolate position from within aura to cone end.
        const layerX = coneStartX + (coneEndX - coneStartX) * t;
        const layerY = coneStartY + (coneEndY - coneStartY) * t;

        // Calculate layer radius (perpendicular to the distance vector).
        const distanceFromStart = (coneLength + coneStartOffset) * t;
        const startRadius = SUN_GLOW_RADIUS * 0.5; // Base has non-zero radius.
        const coneRadiusAtDistance = distanceFromStart * coneTan;
        const layerRadius = startRadius + coneRadiusAtDistance;

        // Create radial gradient for this layer with linear fade across layers.
        const layerAlpha = 1 - t;
        const layerGradient = ctx.createRadialGradient(
          layerX,
          layerY,
          0,
          layerX,
          layerY,
          layerRadius
        );
        layerGradient.addColorStop(0, `rgba(255, 255, 150, ${layerAlpha})`);
        layerGradient.addColorStop(
          0.4,
          `rgba(255, 255, 100, ${layerAlpha * 0.6})`
        );
        layerGradient.addColorStop(
          0.7,
          `rgba(255, 255, 50, ${layerAlpha * 0.3})`
        );
        layerGradient.addColorStop(1, `rgba(255, 255, 0, 0)`);

        // Draw circle for this layer.
        ctx.beginPath();
        ctx.arc(layerX, layerY, layerRadius, 0, Math.PI * 2);
        ctx.fillStyle = layerGradient;
        ctx.fill();
      }
    }

    // Draw the aura as a series of layers.
    const numAuraLayers = 6;
    for (let layer = 0; layer < numAuraLayers; layer++) {
      const t = layer / (numAuraLayers - 1);
      const auraRadius = SUN_GLOW_RADIUS * t;
      const layerAlpha = isMoon
        ? 0.5 * (1 - t * 0.5) // Dimmer aura for the moon.
        : 0.9 * (1 - t * 0.45); // Strong center aura that fades just a little.

      const auraGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        SUN_RADIUS,
        centerX,
        centerY,
        auraRadius
      );

      if (isMoon) {
        // Moon-like whiter colors.
        auraGradient.addColorStop(0, `rgba(200, 200, 220, ${layerAlpha})`);
        auraGradient.addColorStop(
          0.4,
          `rgba(180, 180, 200, ${layerAlpha * 0.6})`
        );
        auraGradient.addColorStop(
          0.7,
          `rgba(160, 160, 180, ${layerAlpha * 0.3})`
        );
        auraGradient.addColorStop(1, `rgba(140, 140, 160, 0)`);
      } else {
        // Sun-like warmer colors.
        auraGradient.addColorStop(0, `rgba(255, 255, 200, ${layerAlpha})`);
        auraGradient.addColorStop(
          0.4,
          `rgba(255, 255, 180, ${layerAlpha * 0.6})`
        );
        auraGradient.addColorStop(
          0.7,
          `rgba(255, 255, 160, ${layerAlpha * 0.3})`
        );
        auraGradient.addColorStop(1, `rgba(255, 255, 140, 0)`);
      }

      ctx.beginPath();
      ctx.arc(centerX, centerY, auraRadius, 0, Math.PI * 2);
      ctx.fillStyle = auraGradient;
      ctx.fill();
    }

    // Draw center body (moon has a few layers; sun is just a golden color).
    if (isMoon) {
      const moonGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        SUN_RADIUS
      );
      moonGradient.addColorStop(0, "#E8E8F0");
      moonGradient.addColorStop(0.7, "#C0C0D0");
      moonGradient.addColorStop(1, "#A0A0B0");
      ctx.fillStyle = moonGradient;
    } else {
      ctx.fillStyle = "#FFD700";
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, SUN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Cycles through the three modes: 0 -> 1 -> 2 -> 0.
   *
   * - Mode 0: Day mode with hillshade and cone
   * - Mode 1: Day mode without hillshade or cone
   * - Mode 2: Night mode without hillshade or cone (moon)
   *
   * @private
   */
  cycleMode() {
    /** @type {SunMode} */
    const newMode = /** @type {SunMode} */ ((this.mode + 1) % 3);
    this.mode = newMode;

    // Update terrain canvas mode.
    this.terrainCanvas.setSunMode(newMode);

    // Update water canvas mode (if water canvas is available).
    if (this.waterCanvas) {
      this.waterCanvas.setSunMode(newMode);
    }

    // Use `renderSunAtPosition` to re-draw everything at the current position.
    this.renderSunAtPosition(this.sunPosition, false, false);

    // Save to `localStorage` if requested.
    if (this.saveSunMode) {
      this.saveSunMode(newMode);
    }
  }
}
