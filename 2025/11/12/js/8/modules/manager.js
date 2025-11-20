import {
  DIAMOND_SQUARE_BLUR_RADIUS,
  DIAMOND_SQUARE_MIN_HEIGHT,
  DIAMOND_SQUARE_ROUGHNESS,
  GENERATION_MODE_ACTUAL,
  GENERATION_MODE_FLAT,
  GENERATION_MODE_RANDOM,
  TOOL_FULL_HEIGHT_SCALING_FRAMES,
} from "./constants.js";
import { generateFlattenedDem } from "./helpers.js";
import { generateDiamondSquareTerrain } from "./random.js";

/**
 * Manager for the current terrain DEM and the different ways of re-generating
 * terrain.
 */
export class TerrainManager {
  /**
   * @param {Float32Array} referenceDem - Reference DEM data
   * @param {number} width - DEM width
   * @param {number} height - DEM height
   * @param {number} noDataValue - No-data value
   * @param {number} pixelSize - Pixel size in meters
   * @param {number} referenceMaxZ - Maximum elevation in reference DEM
   * @param {function(Float32Array): void} onDemGenerated - Callback when DEM is generated (receives new DEM)
   * @param {function(): void} [onDemNeedsRender] - Callback when DEM needs to be re-rendered
   */
  constructor(
    referenceDem,
    width,
    height,
    noDataValue,
    pixelSize,
    referenceMaxZ,
    onDemGenerated,
    onDemNeedsRender
  ) {
    this.referenceDem = referenceDem;
    this.width = width;
    this.height = height;
    this.noDataValue = noDataValue;
    this.pixelSize = pixelSize;
    this.referenceMaxZ = referenceMaxZ;
    this.onDemGenerated = onDemGenerated;
    this.onDemNeedsRender = onDemNeedsRender;

    this.randomizeConfig = {
      roughness: DIAMOND_SQUARE_ROUGHNESS,
      minHeight: DIAMOND_SQUARE_MIN_HEIGHT,
      maxHeight: referenceMaxZ,
      blurRadius: DIAMOND_SQUARE_BLUR_RADIUS,
    };

    this.currentDem = null;
  }

  /**
   * Gets the current DEM.
   *
   * @returns {Float32Array | null} Current DEM or null
   */
  getCurrentDem() {
    return this.currentDem;
  }

  /**
   * Sets the current DEM.
   *
   * @param {Float32Array} dem - DEM to set
   */
  setCurrentDem(dem) {
    this.currentDem = dem;
  }

  /**
   * Generates a randomized DEM using the diamond-square algorithm.
   *
   * @returns {Float32Array} New DEM array with randomized terrain
   */
  generateRandomizedDem() {
    return generateDiamondSquareTerrain(
      this.width,
      this.height,
      this.referenceDem,
      this.noDataValue,
      this.randomizeConfig
    );
  }

  /**
   * Generates randomized terrain.
   */
  generateRandomized() {
    console.log("TerrainModeController: Generating randomized terrain");
    const randomizedDem = this.generateRandomizedDem();
    this.setCurrentDem(randomizedDem);
    this.onDemGenerated(randomizedDem);
  }

  /**
   * Generates flattened terrain (all elevations = 0).
   */
  generateFlattened() {
    console.log("TerrainModeController: Generating flattened terrain");
    const flattenedDem = generateFlattenedDem(
      this.referenceDem,
      this.width,
      this.height,
      this.noDataValue
    );
    this.setCurrentDem(flattenedDem);
    this.onDemGenerated(flattenedDem);
  }

  /**
   * Generates actual/reference terrain.
   */
  generateActual() {
    console.log("TerrainModeController: Generating actual terrain");
    const actualDem = new Float32Array(this.referenceDem);
    this.setCurrentDem(actualDem);
    this.onDemGenerated(actualDem);
  }

  /**
   * Handles generation mode button click.
   *
   * @param {"random" | "flat" | "actual"} mode - Mode name
   */
  handleGenerationModeRequest(mode) {
    if (mode === GENERATION_MODE_RANDOM) {
      this.generateRandomized();
    } else if (mode === GENERATION_MODE_FLAT) {
      this.generateFlattened();
    } else if (mode === GENERATION_MODE_ACTUAL) {
      this.generateActual();
    }
  }

  /**
   * Sets up generation mode button event listeners.
   *
   * @param {NodeListOf<Element>} generationModeButtons
   */
  setUpGenerationModeButtons(generationModeButtons) {
    generationModeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const htmlBtn = /** @type {HTMLElement} */ (btn);
        const mode = htmlBtn.dataset.generationMode;
        if (mode) {
          this.handleGenerationModeRequest(
            /** @type {"random" | "flat" | "actual"} */ (mode)
          );
        }
      });
    });
  }

  /**
   * Gets the elevation value at a specific coordinate.
   *
   * @param {number} row - Row index (0-based)
   * @param {number} col - Column index (0-based)
   * @returns {number|null} Elevation value or null if OOB or unavailable
   */
  getElevation(row, col) {
    const dem = this.getCurrentDem();
    if (!dem) {
      console.warn("getElevation: DEM data not available.");
      return null;
    }

    if (row < 0 || row >= this.height || col < 0 || col >= this.width) {
      return null;
    }

    const index = row * this.width + col;
    const value = dem[index];
    if (value === this.noDataValue || !isFinite(value)) {
      return null;
    }

    return value;
  }

  /**
   * Applies a Gaussian kernel to the DEM at a specific point.
   *
   * @param {number} centerRow - Row index of the center point (0-based)
   * @param {number} centerCol - Column index of the center point (0-based)
   * @param {number} radius - Radius of the Gaussian kernel in pixels
   * @param {number} intensity - Intensity multiplier for the kernel (positive for up; negative for down)
   * @param {boolean} [needsRender] - Whether to trigger render callback
   * @param {number} [deltaTime] - Time since last frame in seconds (for scaling)
   * @returns {number} Number of pixels modified
   */
  applyGaussianKernel(
    centerRow,
    centerCol,
    radius,
    intensity,
    needsRender = true,
    deltaTime = 1 / 60
  ) {
    const dem = this.getCurrentDem();
    if (!dem) {
      console.warn("TerrainManager: DEM data not available");
      return 0;
    }

    // Calculate frames at 60 FPS.
    const frames = deltaTime * 60;

    // Scale tool intensity per frame such that unit intensity will reach the
    // reference max height in `TOOL_FULL_HEIGHT_SCALING_FRAMES` frames.
    const heightRange = this.referenceMaxZ - 0;
    const scaledIntensity =
      intensity * (heightRange / TOOL_FULL_HEIGHT_SCALING_FRAMES) * frames;

    // Generate 2D Gaussian kernel with circular cutoff.
    const kernelSize = Math.ceil(radius * 2) + 1;
    const kernel = new Array(kernelSize);
    const sigma = radius / 3;
    const twoSigmaSquared = 2 * sigma * sigma;
    const radiusSquared = radius * radius;
    const centerCoordinate = Math.floor(kernelSize / 2);
    let centerValue = 0;

    for (let i = 0; i < kernelSize; i++) {
      kernel[i] = new Array(kernelSize);
      for (let j = 0; j < kernelSize; j++) {
        const dx = j - centerCoordinate;
        const dy = i - centerCoordinate;
        const distanceSquared = dx * dx + dy * dy;

        // Only include points within the circular cutoff.
        if (distanceSquared > radiusSquared) {
          kernel[i][j] = 0;
          continue;
        }

        const value = Math.exp(-distanceSquared / twoSigmaSquared);
        kernel[i][j] = value;

        // Store the center value for normalization.
        if (dx === 0 && dy === 0) {
          centerValue = value;
        }
      }
    }

    // Normalize kernel so its center height is always 1.
    if (centerValue > 0) {
      for (let i = 0; i < kernelSize; i++) {
        for (let j = 0; j < kernelSize; j++) {
          if (kernel[i][j] > 0) {
            kernel[i][j] /= centerValue;
          }
        }
      }
    }

    // Apply kernel to the DEM.
    let modifiedCount = 0;
    const halfSize = Math.floor(kernelSize / 2);

    for (let i = 0; i < kernelSize; i++) {
      for (let j = 0; j < kernelSize; j++) {
        // Skip application when kernel value is zero.
        if (kernel[i][j] === 0) {
          continue;
        }

        const row = centerRow + i - halfSize;
        const col = centerCol + j - halfSize;

        if (row < 0 || row >= this.height || col < 0 || col >= this.width) {
          continue;
        }

        const index = row * this.width + col;
        const currentValue = dem[index];
        if (currentValue === this.noDataValue || !isFinite(currentValue)) {
          // Skip unavailable values.
          continue;
        }

        // Apply kernel value multiplied by scaled intensity to get actual
        // DEM elevation change.
        const kernelValue = kernel[i][j];
        const elevationChange = kernelValue * scaledIntensity;
        let newValue = currentValue + elevationChange;

        // Clamp elevation to a valid range.
        // - Minimum: `min(reference_min, 0)` where `reference_min` is always 0
        // - Maximum: `max(reference_max * 1.25, 0)`
        const minElevation = 0;
        const maxElevation = Math.max(this.referenceMaxZ * 1.25, 0);

        // Persist modification to the DEM.
        newValue = Math.max(minElevation, Math.min(maxElevation, newValue));
        dem[index] = newValue;
        modifiedCount++;
      }
    }

    // Update global DEM if we modified any pixels.
    if (modifiedCount > 0) {
      this.setCurrentDem(dem);
    }

    // Trigger terrain rendering if needed (typically triggered by the last
    // point of a tool stroke).
    if (needsRender && modifiedCount > 0 && this.onDemNeedsRender) {
      this.onDemNeedsRender();
    }

    return modifiedCount;
  }
}
