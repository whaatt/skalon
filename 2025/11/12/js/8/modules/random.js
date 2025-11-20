/*
 * Diamond-square algorithm for generating random fractal terrain. Based on
 * https://en.wikipedia.org/wiki/Diamond-square_algorithm.
 */

/** @typedef {import("./typings").DiamondSquareConfig} DiamondSquareConfig */

/**
 * Generates a randomized DEM using the diamond-square algorithm.
 * This produces natural-looking fractal terrain with smooth, organic features.
 *
 * @param {number} width - Width of the DEM
 * @param {number} height - Height of the DEM
 * @param {Float32Array} referenceDem - Reference DEM to respect no-data values
 * @param {number} noDataValue - No-data value to preserve
 * @param {DiamondSquareConfig} config - Configuration parameters
 * @returns {Float32Array} New DEM array with randomized terrain
 */
export function generateDiamondSquareTerrain(
  width,
  height,
  referenceDem,
  noDataValue,
  config
) {
  const randomizedDem = new Float32Array(width * height);

  // Initialize with `noDataValue`.
  for (let i = 0; i < randomizedDem.length; i++) {
    randomizedDem[i] = noDataValue;
  }

  // Find the largest power-of-2 size that fits within our dimensions.
  // We'll work with a grid that's at most our width/height.
  const size = Math.max(width, height);

  // Find the next power of 2 that's >= `size`, then use `size + 1` if needed.
  // For diamond-square, we need `2^n + 1` dimensions.
  let gridSize = 1;
  while (gridSize < size) {
    gridSize *= 2;
  }
  gridSize = gridSize + 1;

  // Create a working grid (may be larger than our actual DEM).
  const grid = new Array(gridSize);
  for (let i = 0; i < gridSize; i++) {
    grid[i] = new Array(gridSize);
    for (let j = 0; j < gridSize; j++) {
      grid[i][j] = null;
    }
  }

  // Initialize four corners with random values
  const cornerValue = () => Math.random() * config.maxHeight;
  grid[0][0] = cornerValue();
  grid[0][gridSize - 1] = cornerValue();
  grid[gridSize - 1][0] = cornerValue();
  grid[gridSize - 1][gridSize - 1] = cornerValue();

  // Diamond-square algorithm.
  let stepSize = gridSize - 1;
  let scale = config.maxHeight * 0.5; // Initial scale.

  while (stepSize > 1) {
    const halfStep = Math.floor(stepSize / 2);

    // Diamond step: Set midpoints of squares.
    for (let y = 0; y < gridSize - 1; y += stepSize) {
      for (let x = 0; x < gridSize - 1; x += stepSize) {
        const x1 = x;
        const y1 = y;
        const x2 = x + stepSize;
        const y2 = y + stepSize;
        const midX = x + halfStep;
        const midY = y + halfStep;

        // Average of four corners plus random offset.
        const average =
          (grid[y1][x1] + grid[y1][x2] + grid[y2][x1] + grid[y2][x2]) / 4;
        const randomOffset = (Math.random() * 2 - 1) * scale;
        grid[midY][midX] = average + randomOffset;
      }
    }

    // Square step: Set midpoints of diamonds.
    // Process edge midpoints and center points that form diamonds.
    for (let y = 0; y < gridSize; y += halfStep) {
      for (let x = 0; x < gridSize; x += halfStep) {
        // Skip points that were already set in the diamond step.
        if (grid[y][x] !== null) {
          continue;
        }

        let sum = 0;
        let count = 0;

        // Get the four diamond corner values (neighbors at `halfStep`
        // distance).
        // Top.
        if (y - halfStep >= 0) {
          const val = grid[y - halfStep][x];
          if (val !== null) {
            sum += val;
            count++;
          }
        }
        // Bottom.
        if (y + halfStep < gridSize) {
          const val = grid[y + halfStep][x];
          if (val !== null) {
            sum += val;
            count++;
          }
        }
        // Left.
        if (x - halfStep >= 0) {
          const val = grid[y][x - halfStep];
          if (val !== null) {
            sum += val;
            count++;
          }
        }
        // Right.
        if (x + halfStep < gridSize) {
          const val = grid[y][x + halfStep];
          if (val !== null) {
            sum += val;
            count++;
          }
        }

        // Average plus random offset (only set if we have neighbors)
        if (count > 0) {
          const avg = sum / count;
          const randomOffset = (Math.random() * 2 - 1) * scale;
          grid[y][x] = avg + randomOffset;
        }
      }
    }

    // Reduce step size and scale for next iteration.
    stepSize = halfStep;
    scale *= Math.pow(2, -config.roughness);
  }

  // Copy grid values to DEM, scaling to fit our actual dimensions and
  // respecting no-data values from reference
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;

      // Skip if this pixel is no-data in the reference DEM.
      if (referenceDem[idx] === noDataValue) {
        continue;
      }

      // Map our coordinates to grid coordinates.
      const gridRow = Math.floor((row / (height - 1)) * (gridSize - 1));
      const gridCol = Math.floor((col / (width - 1)) * (gridSize - 1));

      // Get value from grid.
      const gridValue = grid[gridRow][gridCol];
      if (gridValue !== null) {
        // Clamp to valid range.
        randomizedDem[idx] = Math.max(
          config.minHeight,
          Math.min(config.maxHeight, gridValue)
        );
      }
    }
  }

  // Normalize the DEM to use the full height range.
  // Find minimum and maximum of generated values.
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < randomizedDem.length; i++) {
    if (randomizedDem[i] !== noDataValue) {
      if (randomizedDem[i] < minVal) {
        minVal = randomizedDem[i];
      }
      if (randomizedDem[i] > maxVal) {
        maxVal = randomizedDem[i];
      }
    }
  }

  // Normalize to [0, `maxHeight`] range.
  if (maxVal > minVal) {
    const range = maxVal - minVal;
    const targetRange = config.maxHeight - config.minHeight;
    for (let i = 0; i < randomizedDem.length; i++) {
      if (randomizedDem[i] !== noDataValue) {
        const normalized = (randomizedDem[i] - minVal) / range;
        randomizedDem[i] = config.minHeight + normalized * targetRange;
      }
    }
  }

  // Apply Gaussian blur smoothing if requested.
  const blurRadius = config.blurRadius || 0;
  if (blurRadius > 0) {
    return applyGaussianBlur(
      randomizedDem,
      width,
      height,
      noDataValue,
      blurRadius
    );
  }

  return randomizedDem;
}

/**
 * Applies a Gaussian blur to the DEM while respecting no-data values.
 *
 * Uses a separable Gaussian kernel for efficiency.
 *
 * @param {Float32Array} dem - DEM array to blur
 * @param {number} width - Width of the DEM
 * @param {number} height - Height of the DEM
 * @param {number} noDataValue - No-data value to preserve
 * @param {number} radius - Blur radius in pixels
 * @returns {Float32Array} Blurred DEM array
 */
function applyGaussianBlur(dem, width, height, noDataValue, radius) {
  // Clamp radius to reasonable values.
  const clampedRadius = Math.max(0, Math.min(radius, 10));
  if (clampedRadius === 0) {
    return dem;
  }

  // Generate Gaussian kernel.
  const kernelSize = Math.ceil(clampedRadius * 2) + 1;
  const kernel = new Float32Array(kernelSize);
  const sigma = clampedRadius / 3; // Standard deviation.
  const twoSigmaSq = 2 * sigma * sigma;
  let sum = 0;

  const center = Math.floor(kernelSize / 2);
  for (let i = 0; i < kernelSize; i++) {
    const x = i - center;
    const value = Math.exp(-(x * x) / twoSigmaSq);
    kernel[i] = value;
    sum += value;
  }

  // Normalize kernel.
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }

  // Create output array.
  const blurred = new Float32Array(dem.length);
  const temp = new Float32Array(dem.length);

  // Horizontal pass.
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;

      // Skip no-data pixels.
      if (dem[idx] === noDataValue) {
        temp[idx] = noDataValue;
        continue;
      }

      let weightedSum = 0;
      let weightSum = 0;

      // Apply horizontal kernel.
      for (let k = 0; k < kernelSize; k++) {
        const offset = k - center;
        const x = col + offset;

        if (x >= 0 && x < width) {
          const neighborIdx = row * width + x;
          if (dem[neighborIdx] !== noDataValue) {
            weightedSum += dem[neighborIdx] * kernel[k];
            weightSum += kernel[k];
          }
        }
      }

      // Only set value if we have valid neighbors.
      if (weightSum > 0) {
        temp[idx] = weightedSum / weightSum;
      } else {
        // Fallback to original if no valid neighbors.
        temp[idx] = dem[idx];
      }
    }
  }

  // Vertical pass.
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;

      // Skip no-data pixels.
      if (temp[idx] === noDataValue) {
        blurred[idx] = noDataValue;
        continue;
      }

      let weightedSum = 0;
      let weightSum = 0;

      // Apply vertical kernel.
      for (let k = 0; k < kernelSize; k++) {
        const offset = k - center;
        const y = row + offset;

        if (y >= 0 && y < height) {
          const neighborIdx = y * width + col;
          if (temp[neighborIdx] !== noDataValue) {
            weightedSum += temp[neighborIdx] * kernel[k];
            weightSum += kernel[k];
          }
        }
      }

      // Only set value if we have valid neighbors.
      if (weightSum > 0) {
        blurred[idx] = weightedSum / weightSum;
      } else {
        // Fallback to previous pass if no valid neighbors.
        blurred[idx] = temp[idx];
      }
    }
  }

  return blurred;
}
