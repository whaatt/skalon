/** @typedef {import("./typings.js").MapLibreMap} MapLibreMap */
/** @typedef {import("./typings.js").BoundingBox} BoundingBox */
/** @typedef {import("./typings.js").DemCoords} DemCoords */
/** @typedef {import("./manager.js").TerrainManager} TerrainManager */

import {
  DEM_SAVE_DEBOUNCE_MS,
  SUN_MARKER_CLASS,
  TOOL_ACTIVE_CLASS,
  TOOL_DELTA_REPROCESSING_MS,
  TOOL_DOWN,
  TOOL_INDICATOR_ID,
  TOOL_INTENSITY_PER_FRAME,
  TOOL_MAX_QUEUE_SIZE,
  TOOL_RADIUS_SCREEN_PIXELS,
  TOOL_UP,
} from "./constants.js";
import {
  demCoordsToLonLat,
  lonLatToDemCoords,
  sampleLine,
  screenPixelsToDemPixels,
} from "./helpers.js";

/**
 * Controller for handling terrain elevation modifications.
 */
export class TerraformController {
  /**
   * @param {MapLibreMap} map - Map instance
   * @param {TerrainManager} terrainManager - Terrain manager instance
   * @param {HTMLElement} mapContainer - Map container element
   * @param {BoundingBox} bounds - Terrain bounds
   * @param {number} xOrigin - DEM X origin
   * @param {number} yOrigin - DEM Y origin
   * @param {number} pixelSize - Pixel size in meters
   * @param {number} width - DEM width
   * @param {number} height - DEM height
   * @param {function(Float32Array): void} saveDem - Callback to save DEM
   * @param {function(): void} onStrokeStart - Callback upon starting a new stroke
   */
  constructor(
    map,
    terrainManager,
    mapContainer,
    bounds,
    xOrigin,
    yOrigin,
    pixelSize,
    width,
    height,
    saveDem,
    onStrokeStart
  ) {
    this.map = map;
    this.terrainManager = terrainManager;
    this.mapContainer = mapContainer;
    this.bounds = bounds;
    this.xOrigin = xOrigin;
    this.yOrigin = yOrigin;
    this.pixelSize = pixelSize;
    this.width = width;
    this.height = height;
    this.onSaveDem = saveDem;
    this.onStrokeStart = onStrokeStart;

    this.currentTool = null;
    this.isPointerDown = false;
    this.currentRow = -1;
    this.currentCol = -1;
    this.prevRow = -1;
    this.prevCol = -1;

    /** @type {Array<DemCoords>} */
    this.toolPointQueue = [];
    /** @type {Map<string, number>} */
    this.processedPointsInStroke = new Map();
    /** @type {number | null} */
    this.strokeStartTime = null;
    /** @type {number | null} */
    this.saveTimeout = null;
    /** @type {number | null} */
    this.animationFrameId = null;
    /** @type {number | null} */
    this.lastFrameTime = null;
    this.isSunDragging = false;

    this.toolIndicator = document.createElement("div");
    this.toolIndicator.id = TOOL_INDICATOR_ID;
    this.mapContainer.appendChild(this.toolIndicator);
    this.setUpEventListeners();
  }

  /**
   * Sets the current tool.
   *
   * @param {string} tool - Tool name
   */
  setTool(tool) {
    this.currentTool = tool;
    if (tool !== TOOL_UP && tool !== TOOL_DOWN) {
      this.toolIndicator.style.display = "none";
      this.mapContainer.classList.remove(TOOL_ACTIVE_CLASS);
    }
  }

  /**
   * Sets whether the sun is being dragged (which temporarily disables the
   * terraforming tool).
   *
   * @param {boolean} isDragging - Whether the sun is being dragged
   */
  setSunDragging(isDragging) {
    this.isSunDragging = isDragging;
    if (isDragging) {
      this.toolIndicator.style.display = "none";
      this.mapContainer.classList.remove(TOOL_ACTIVE_CLASS);
    }
  }

  /**
   * Checks if coordinates are within terrain bounds.
   *
   * @param {number} lon - Longitude
   * @param {number} lat - Latitude
   * @returns {boolean}
   */
  isWithinTerrainBounds(lon, lat) {
    return (
      lon >= this.bounds.minLon &&
      lon <= this.bounds.maxLon &&
      lat >= this.bounds.minLat &&
      lat <= this.bounds.maxLat
    );
  }

  /**
   * Checks if coordinates are over valid terrain data (not `noDataValue`).
   *
   * @param {number} lon - Longitude
   * @param {number} lat - Latitude
   * @returns {boolean}
   */
  isInTerrain(lon, lat) {
    if (!this.isWithinTerrainBounds(lon, lat)) {
      return false;
    }

    if (!this.terrainManager.getCurrentDem()) {
      return false;
    }

    const coords = lonLatToDemCoords(
      lon,
      lat,
      this.bounds,
      this.xOrigin,
      this.yOrigin,
      this.pixelSize
    );
    if (!coords) {
      return false;
    }

    const elevation = this.terrainManager.getElevation(coords.row, coords.col);
    return elevation !== null;
  }

  /**
   * Cleans up old entries from `processedPointsInStroke` so that those points
   * may be re-processed and so that new accumulated elevation of the stroke
   * divides over a rolling window of points.
   *
   * @param {number} currentTimeMs
   */
  cleanupOldProcessedPoints(currentTimeMs) {
    for (const [key, timestamp] of this.processedPointsInStroke.entries()) {
      if (currentTimeMs - timestamp > TOOL_DELTA_REPROCESSING_MS) {
        this.processedPointsInStroke.delete(key);
      }
    }
  }

  /**
   * Gets the effective stroke start time, which is the minimum timestamp
   * in `processedPointsInStroke` after removing old points OR the original
   * `strokeStartTime` if no points have been processed yet.
   *
   * Only `null` if called outside the context of a stroke.
   *
   * @returns {number | null}
   */
  getEffectiveStrokeStartTime() {
    if (this.processedPointsInStroke.size === 0) {
      return this.strokeStartTime;
    }
    const timestamps = Array.from(this.processedPointsInStroke.values());
    const minTimestamp = Math.min(...timestamps);
    return minTimestamp;
  }

  /**
   * Calculates the total stroke time and time per point during a stroke.
   *
   * @param {number} currentTimeMs
   * @param {number} deltaTime
   * @param {number} totalUniquePoints
   * @returns {{totalStrokeTime: number, timePerPoint: number}}
   */
  calculateStrokeTime(currentTimeMs, deltaTime, totalUniquePoints) {
    const effectiveStartTime = this.getEffectiveStrokeStartTime();
    let totalStrokeTime = deltaTime;
    if (effectiveStartTime !== null) {
      totalStrokeTime = (currentTimeMs - effectiveStartTime) / 1000;
    }
    const timePerPoint = totalStrokeTime / totalUniquePoints;
    return { totalStrokeTime, timePerPoint };
  }

  /**
   * Processes a single point by applying elevation modification.
   *
   * @param {number} row
   * @param {number} col
   * @param {string} tool
   * @param {number} timePerPoint
   * @param {boolean} isLastPoint
   * @param {number} currentTimeMs
   * @returns {boolean} Whether the point was processed successfully
   */
  processPoint(row, col, tool, timePerPoint, isLastPoint, currentTimeMs) {
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) {
      return false;
    }

    // Check if point has already been processed.
    const key = `${row},${col}`;
    if (this.processedPointsInStroke.has(key)) {
      return false;
    }
    this.processedPointsInStroke.set(key, currentTimeMs);

    // Get the radius of DEM pixels to modify for the Gaussian kernel.
    const coords = demCoordsToLonLat(
      row,
      col,
      this.width,
      this.height,
      this.xOrigin,
      this.yOrigin,
      this.pixelSize
    );
    if (!coords) {
      return false;
    }
    let demPixelRadius = TOOL_RADIUS_SCREEN_PIXELS;
    const screenPosition = this.map.project({
      lng: coords.lon,
      lat: coords.lat,
    });
    demPixelRadius = screenPixelsToDemPixels(
      this.map,
      TOOL_RADIUS_SCREEN_PIXELS,
      screenPosition.x,
      screenPosition.y,
      this.pixelSize
    );

    // Apply elevation modification (only triggers render callback if
    // `isLastPoint` is `true`).
    const sign = tool === "up" ? 1 : -1;
    const intensity = TOOL_INTENSITY_PER_FRAME * sign;
    this.terrainManager.applyGaussianKernel(
      row,
      col,
      demPixelRadius,
      intensity,
      isLastPoint,
      timePerPoint
    );
    return true;
  }

  /**
   * Applies elevation modification at the passed positions.
   *
   * @param {string} tool - Tool name ("up" or "down")
   * @param {number} deltaTime - Time since last frame in seconds
   * @param {Array<{row: number, col: number}>} points - Array of points
   * @param {number} currentTimeMs - Current timestamp in milliseconds
   * @returns {number} Number of passed points that have been processed
   */
  applyElevationModification(tool, deltaTime, points, currentTimeMs) {
    // Remove old points from the processed set.
    this.cleanupOldProcessedPoints(currentTimeMs);

    // Filter out points that have already been processed.
    let pointsToProcess = [];
    pointsToProcess = points.filter((point) => {
      const key = `${point.row},${point.col}`;
      return !this.processedPointsInStroke.has(key);
    });
    if (pointsToProcess.length === 0) {
      return points.length;
    }

    // Calculate the total number of unique points to process.
    const totalUniquePoints =
      this.processedPointsInStroke.size + pointsToProcess.length;
    const { timePerPoint } = this.calculateStrokeTime(
      currentTimeMs,
      deltaTime,
      totalUniquePoints
    );

    // Process each point with the calculated time per point.
    let processedCount = 0;
    for (let i = 0; i < pointsToProcess.length; i++) {
      const point = pointsToProcess[i];
      const isLastPoint = i === pointsToProcess.length - 1;
      if (
        this.processPoint(
          point.row,
          point.col,
          tool,
          timePerPoint,
          isLastPoint,
          currentTimeMs
        )
      ) {
        processedCount++;
      }
    }

    this.saveDemDebounced();
    return processedCount;
  }

  /**
   * Saves DEM to disk after a debounce period.
   */
  saveDemDebounced() {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      const dem = this.terrainManager.getCurrentDem();
      if (dem) {
        this.onSaveDem(dem);
      }
      this.saveTimeout = null;
    }, DEM_SAVE_DEBOUNCE_MS);
  }

  /**
   * Saves DEM to disk immediately.
   */
  saveDemImmediate() {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    const dem = this.terrainManager.getCurrentDem();
    if (dem) {
      this.onSaveDem(dem);
    }
  }

  /**
   * Checks if an event target is the sun marker or a child of the sun marker.
   *
   * @param {EventTarget | null} target - Event target
   * @returns {boolean} Whether the target is the sun marker or its child
   */
  isSunMarkerElement(target) {
    if (!target || !(target instanceof HTMLElement)) {
      return false;
    }
    let element = target;
    while (element) {
      if (element.classList && element.classList.contains(SUN_MARKER_CLASS)) {
        return true;
      }
      const parent = element.parentElement;
      if (!parent) {
        break;
      }
      element = parent;
    }
    return false;
  }

  /**
   * Updates tool indicator visibility and position.
   *
   * @param {number} clientX - Mouse X position in screen coordinates
   * @param {number} clientY - Mouse Y position in screen coordinates
   * @param {boolean} isOverTerrain - Whether mouse is over valid terrain
   */
  updateToolIndicator(clientX, clientY, isOverTerrain) {
    const isToolActive =
      this.currentTool === TOOL_UP || this.currentTool === TOOL_DOWN;

    if (isToolActive && isOverTerrain && !this.isPointerDown) {
      const radiusInScreenPixels = TOOL_RADIUS_SCREEN_PIXELS;
      const rect = this.mapContainer.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      this.toolIndicator.style.width = `${radiusInScreenPixels * 2 - 10}px`;
      this.toolIndicator.style.height = `${radiusInScreenPixels * 2 - 10}px`;
      this.toolIndicator.style.left = `${x}px`;
      this.toolIndicator.style.top = `${y}px`;
      this.toolIndicator.style.display = "block";
      this.mapContainer.classList.add(TOOL_ACTIVE_CLASS);
    } else {
      this.toolIndicator.style.display = "none";
      if (isToolActive && isOverTerrain) {
        this.mapContainer.classList.add(TOOL_ACTIVE_CLASS);
      } else {
        this.mapContainer.classList.remove(TOOL_ACTIVE_CLASS);
      }
    }
  }

  /**
   * Starts the update loop for continuous elevation modifications.
   */
  startUpdateLoop() {
    if (this.animationFrameId !== null) {
      return;
    }

    this.lastFrameTime = null;
    const updateLoop = (/** @type {number} */ currentTime) => {
      if (
        this.isPointerDown &&
        (this.currentTool === TOOL_UP || this.currentTool === TOOL_DOWN)
      ) {
        const deltaTime =
          this.lastFrameTime !== null
            ? (currentTime - this.lastFrameTime) / 1000
            : 1 / 60;

        // Apply elevation modification to the tool point queue on each frame.
        if (this.toolPointQueue.length > 0) {
          const pointsProcessed = this.applyElevationModification(
            this.currentTool,
            deltaTime,
            this.toolPointQueue,
            currentTime
          );
          this.toolPointQueue = this.toolPointQueue.slice(pointsProcessed);
        }

        this.lastFrameTime = currentTime;
        this.animationFrameId = requestAnimationFrame(updateLoop);
      } else {
        this.animationFrameId = null;
        this.lastFrameTime = null;
        this.toolPointQueue = [];
      }
    };

    this.animationFrameId = requestAnimationFrame(updateLoop);
  }

  /**
   * Handles pointer down events.
   *
   * @param {MouseEvent | TouchEvent} event - Pointer event
   */
  handlePointerDown(event) {
    const rect = this.mapContainer.getBoundingClientRect();
    const clientX =
      "touches" in event ? event.touches[0]?.clientX : event.clientX;
    const clientY =
      "touches" in event ? event.touches[0]?.clientY : event.clientY;
    if (clientX === undefined || clientY === undefined) {
      return;
    }

    // Update tool visibility depending on sun drag state.
    const isOverSunMarker = this.isSunMarkerElement(event.target);
    if (isOverSunMarker || this.isSunDragging) {
      this.updateToolIndicator(clientX, clientY, false);
      return;
    }

    // Update tool visibility depending on hover position.
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const mapCoords = this.map.unproject([x, y]);
    const isInValidTerrain = this.isInTerrain(mapCoords.lng, mapCoords.lat);
    this.updateToolIndicator(clientX, clientY, isInValidTerrain);

    // Start a new stroke if we're over valid terrain.
    if (
      (this.currentTool === TOOL_UP || this.currentTool === TOOL_DOWN) &&
      isInValidTerrain
    ) {
      // Don't let the map pan or zoom when the tool is active.
      event.preventDefault();
      event.stopPropagation();
      this.onStrokeStart();

      const coords = lonLatToDemCoords(
        mapCoords.lng,
        mapCoords.lat,
        this.bounds,
        this.xOrigin,
        this.yOrigin,
        this.pixelSize
      );
      if (coords) {
        this.isPointerDown = true;
        this.toolIndicator.style.display = "none";
        this.mapContainer.classList.add(TOOL_ACTIVE_CLASS);
        this.currentRow = coords.row;
        this.currentCol = coords.col;
        this.prevRow = coords.row;
        this.prevCol = coords.col;
        this.toolPointQueue = [{ row: coords.row, col: coords.col }];
        this.processedPointsInStroke = new Map();
        this.strokeStartTime = performance.now();
        this.startUpdateLoop();
      }
    }
  }

  /**
   * Handles pointer move events.
   *
   * @param {MouseEvent | TouchEvent} event - Pointer event
   */
  handlePointerMove(event) {
    const rect = this.mapContainer.getBoundingClientRect();
    const clientX =
      "touches" in event ? event.touches[0]?.clientX : event.clientX;
    const clientY =
      "touches" in event ? event.touches[0]?.clientY : event.clientY;
    if (clientX === undefined || clientY === undefined) {
      return;
    }

    // Update tool visibility depending on hover position and sun drag state.
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const mapCoords = this.map.unproject([x, y]);
    const isOverSunMarker = this.isSunMarkerElement(event.target);
    const isInValidTerrain =
      this.isInTerrain(mapCoords.lng, mapCoords.lat) &&
      !(isOverSunMarker || this.isSunDragging);
    this.updateToolIndicator(clientX, clientY, isInValidTerrain);

    // Add the current position to the tool point queue if we're over valid terrain.
    if (
      this.isPointerDown &&
      (this.currentTool === TOOL_UP || this.currentTool === TOOL_DOWN) &&
      isInValidTerrain
    ) {
      // Don't let the map pan or zoom when the tool is active.
      event.preventDefault();
      event.stopPropagation();

      const coords = lonLatToDemCoords(
        mapCoords.lng,
        mapCoords.lat,
        this.bounds,
        this.xOrigin,
        this.yOrigin,
        this.pixelSize
      );
      if (coords) {
        // If the previous position is valid, sample points along a line between
        // the previous and current positions.
        if (this.prevRow >= 0 && this.prevCol >= 0) {
          const sampledPoints = sampleLine(
            this.prevCol,
            this.prevRow,
            coords.col,
            coords.row,
            6
          );
          if (sampledPoints.length > 1) {
            this.toolPointQueue.push(...sampledPoints.slice(1));
          } else {
            this.toolPointQueue.push(...sampledPoints);
          }

          // Limit the tool point queue size in case there are any unexpected
          // processing delays.
          if (this.toolPointQueue.length > TOOL_MAX_QUEUE_SIZE) {
            console.warn("TerraformController: Limiting tool point queue size");
            this.toolPointQueue = this.toolPointQueue.slice(
              -TOOL_MAX_QUEUE_SIZE
            );
          }
        } else {
          this.toolPointQueue.push({ row: coords.row, col: coords.col });
        }

        this.prevRow = coords.row;
        this.prevCol = coords.col;
        this.currentRow = coords.row;
        this.currentCol = coords.col;
      }
    } else if (!isInValidTerrain) {
      // Stop accumulating elevation and reset stroke state if we go out of the
      // valid terrain area.
      this.toolPointQueue = [];
      this.processedPointsInStroke = new Map();
      this.strokeStartTime = null;
    }
  }

  /**
   * Handles pointer up events.
   *
   * @param {MouseEvent | TouchEvent} event - Pointer event
   */
  handlePointerUp(event) {
    const rect = this.mapContainer.getBoundingClientRect();
    const clientX =
      "touches" in event
        ? event.touches?.[0]?.clientX ?? event.changedTouches?.[0]?.clientX
        : event.clientX;
    const clientY =
      "touches" in event
        ? event.touches?.[0]?.clientY ?? event.changedTouches?.[0]?.clientY
        : event.clientY;

    if (clientX !== undefined && clientY !== undefined) {
      // Update tool visibility depending on hover position and sun drag state.
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const mapCoords = this.map.unproject([x, y]);
      const isInValidTerrain =
        this.isInTerrain(mapCoords.lng, mapCoords.lat) &&
        !this.isSunMarkerElement(event.target);
      this.updateToolIndicator(clientX, clientY, isInValidTerrain);

      if (
        this.isPointerDown &&
        (this.currentTool === TOOL_UP || this.currentTool === TOOL_DOWN)
      ) {
        if (isInValidTerrain) {
          // Don't let the map pan or zoom when the tool is active.
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }

    // End stroke and clear state.
    this.isPointerDown = false;
    this.currentRow = -1;
    this.currentCol = -1;
    this.prevRow = -1;
    this.prevCol = -1;
    this.toolPointQueue = [];
    this.processedPointsInStroke = new Map();
    this.strokeStartTime = null;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(/** @type {number} */ (this.animationFrameId));
      this.animationFrameId = null;
    }
    this.lastFrameTime = null;

    // Save DEM immediately on stroke completion.
    this.saveDemImmediate();
  }

  /**
   * Sets up event listeners for pointer events.
   */
  setUpEventListeners() {
    this.mapContainer.addEventListener(
      "mousedown",
      (event) => this.handlePointerDown(event),
      true
    );
    this.mapContainer.addEventListener(
      "mousemove",
      (event) => this.handlePointerMove(event),
      true
    );
    this.mapContainer.addEventListener(
      "mouseup",
      (event) => this.handlePointerUp(event),
      true
    );
    this.mapContainer.addEventListener(
      "mouseleave",
      (/** @type {MouseEvent} */ event) => {
        this.toolIndicator.style.display = "none";
        if (this.currentTool !== TOOL_UP && this.currentTool !== TOOL_DOWN) {
          this.mapContainer.classList.remove(TOOL_ACTIVE_CLASS);
        }
        this.handlePointerUp(event);
      }
    );
    this.mapContainer.addEventListener(
      "touchstart",
      (event) => this.handlePointerDown(event),
      true
    );
    this.mapContainer.addEventListener(
      "touchmove",
      (event) => this.handlePointerMove(event),
      true
    );
    this.mapContainer.addEventListener(
      "touchend",
      (event) => this.handlePointerUp(event),
      true
    );
  }
}
