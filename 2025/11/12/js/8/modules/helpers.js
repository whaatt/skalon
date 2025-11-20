/** @typedef {import("./typings.js").BoundingBox} BoundingBox */
/** @typedef {import("./typings.js").DemCoords} DemCoords */
/** @typedef {import("./typings.js").LonLat} LonLat */

import { WATER_PADDING_LARGER_DIMENSION_PERCENT } from "./constants.js";

// Earth's radius (Web Mercator projection).
export const R = 6378137.0;

/**
 * Calculates water bounding box as the terrain bounding box plus padding.
 *
 * @param {BoundingBox} terrainBounds - Terrain bounding box
 * @returns {BoundingBox} Water bounding box with padding
 */
export const calculateWaterBounds = (terrainBounds) => {
  const averageLat = (terrainBounds.maxLat + terrainBounds.minLat) / 2;
  const latScaleFactor = Math.cos((averageLat * Math.PI) / 180);
  const deltaLon =
    (terrainBounds.maxLon - terrainBounds.minLon) * latScaleFactor;
  const deltaLat = terrainBounds.maxLat - terrainBounds.minLat;
  if (deltaLon > deltaLat) {
    // Longitude delta greater that latitude delta. Pad longitude delta to
    // specified percent and then pad latitude delta to create a square.
    const paddingLon =
      (deltaLon / 2) * (1 + WATER_PADDING_LARGER_DIMENSION_PERCENT);
    const paddingLat = (deltaLon - deltaLat) / 2 + paddingLon;
    console.log({
      minLon: terrainBounds.minLon - paddingLon,
      minLat: terrainBounds.minLat - paddingLat,
      maxLon: terrainBounds.maxLon + paddingLon,
      maxLat: terrainBounds.maxLat + paddingLat,
    });
    return {
      minLon: terrainBounds.minLon - paddingLon,
      minLat: terrainBounds.minLat - paddingLat,
      maxLon: terrainBounds.maxLon + paddingLon,
      maxLat: terrainBounds.maxLat + paddingLat,
    };
  } else {
    // Latitude delta greater that longitude delta. Pad latitude delta to
    // specified percent and then pad longitude to create a square.
    const paddingLat =
      (deltaLat / 2) * (1 + WATER_PADDING_LARGER_DIMENSION_PERCENT);
    const paddingLon = (deltaLat - deltaLon) / 2 + paddingLat;
    return {
      minLon: terrainBounds.minLon - paddingLon,
      minLat: terrainBounds.minLat - paddingLat,
      maxLon: terrainBounds.maxLon + paddingLon,
      maxLat: terrainBounds.maxLat + paddingLat,
    };
  }
};

/**
 * Convert longitude and latitude to meters in the Web Mercator projection.
 *
 * @param {number} lon - Longitude
 * @param {number} lat - Latitude
 * @returns {[number, number]} [x, y] in meters
 */
export const lonLatToMeters = (lon, lat) => {
  const x = (R * lon * Math.PI) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
  return [x, y];
};

/**
 * Convert meters in the Web Mercator projection to longitude and latitude.
 *
 * @param {number} x - X coordinate in meters
 * @param {number} y - Y coordinate in meters
 * @returns {[number, number]} [longitude, latitude]
 */
export const metersToLonLat = (x, y) => {
  const lon = ((x / R) * 180) / Math.PI;
  const lat = ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;
  return [lon, lat];
};

/**
 * Converts longitude/latitude to DEM row/column coordinates.
 *
 * @param {number} lon - Longitude
 * @param {number} lat - Latitude
 * @param {BoundingBox} bounds - Terrain bounding box
 * @param {number} xOrigin - X origin in meters
 * @param {number} yOrigin - Y origin in meters
 * @param {number} pixelSize - Pixel size in meters
 * @returns {DemCoords | null} Row and column, or null if out of bounds
 */
export const lonLatToDemCoords = (
  lon,
  lat,
  bounds,
  xOrigin,
  yOrigin,
  pixelSize
) => {
  if (
    lon < bounds.minLon ||
    lon > bounds.maxLon ||
    lat < bounds.minLat ||
    lat > bounds.maxLat
  ) {
    return null;
  }
  const [xMeters, yMeters] = lonLatToMeters(lon, lat);
  const column = Math.floor((xMeters - xOrigin) / pixelSize);
  const row = Math.floor((yOrigin - yMeters) / pixelSize);
  return { row, col: column };
};

/**
 * Converts DEM row/column coordinates to longitude/latitude.
 *
 * @param {number} row - Row index (0-based)
 * @param {number} col - Column index (0-based)
 * @param {number} width - DEM width
 * @param {number} height - DEM height
 * @param {number} xOrigin - X origin in meters
 * @param {number} yOrigin - Y origin in meters
 * @param {number} pixelSize - Pixel size in meters
 * @returns {LonLat | null} Longitude and latitude, or null if out of bounds
 */
export const demCoordsToLonLat = (
  row,
  col,
  width,
  height,
  xOrigin,
  yOrigin,
  pixelSize
) => {
  if (row < 0 || row >= height || col < 0 || col >= width) {
    return null;
  }
  const xMeters = xOrigin + col * pixelSize;
  const yMeters = yOrigin - row * pixelSize;
  const [lon, lat] = metersToLonLat(xMeters, yMeters);
  return { lon, lat };
};

/**
 * Converts a screen pixel radius to a DEM pixel radius at a given map position.
 *
 * @param {import("./typings.js").MapLibreMap} map - MapLibre map instance
 * @param {number} screenPixelRadius - Radius in screen pixels
 * @param {number} screenX - X position in screen coordinates (relative to map container)
 * @param {number} screenY - Y position in screen coordinates (relative to map container)
 * @param {number} pixelSize - Pixel size in meters
 * @returns {number} Radius in DEM pixels
 */
export const screenPixelsToDemPixels = (
  map,
  screenPixelRadius,
  screenX,
  screenY,
  pixelSize
) => {
  // Convert screen coordinates to longitude/latitude.
  const coords = map.unproject([screenX, screenY]);

  // Calculate a point that is screenPixelRadius pixels to the right.
  const rightPoint = map.unproject([screenX + screenPixelRadius, screenY]);

  // Convert both points to meters.
  const [xMeters, yMeters] = lonLatToMeters(coords.lng, coords.lat);
  const [rightXMeters, rightYMeters] = lonLatToMeters(
    rightPoint.lng,
    rightPoint.lat
  );

  // Calculate distance in meters.
  const distanceInMeters = Math.sqrt(
    Math.pow(rightXMeters - xMeters, 2) + Math.pow(rightYMeters - yMeters, 2)
  );

  // Convert to DEM pixel units.
  return distanceInMeters / pixelSize;
};

/**
 * Generates a flattened DEM (all elevations set to 0).
 *
 * @param {Float32Array} referenceDem - Reference DEM to check for no-data values
 * @param {number} width - DEM width
 * @param {number} height - DEM height
 * @param {number} noDataValue - No-data value
 * @returns {Float32Array} New DEM array with flattened terrain
 */
export const generateFlattenedDem = (
  referenceDem,
  width,
  height,
  noDataValue
) => {
  const flattenedDem = new Float32Array(width * height);
  for (let i = 0; i < flattenedDem.length; i++) {
    if (referenceDem[i] === noDataValue) {
      flattenedDem[i] = noDataValue;
    } else {
      flattenedDem[i] = 0;
    }
  }
  return flattenedDem;
};

/**
 * Calculates minimum/maximum elevation values from DEM data.
 *
 * @param {Float32Array} dem - DEM data
 * @param {number} noDataValue - No-data value
 * @returns {{minZ: number, maxZ: number}} Minimum and maximum elevation values
 */
export const calculateElevationRange = (dem, noDataValue) => {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < dem.length; i++) {
    const z = dem[i];
    if (z !== noDataValue && isFinite(z)) {
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!isFinite(minZ) || !isFinite(maxZ) || minZ === maxZ) {
    minZ = 0;
    maxZ = 100;
  }
  return { minZ, maxZ };
};

/**
 * Computes similarity score between two DEMs using MSE normalized by flat
 * terrain MSE.
 *
 * Both DEMs are normalized to 0-1 range using min-max normalization before
 * comparison.
 *
 * @param {Float32Array} currentDem - Current DEM data
 * @param {Float32Array} referenceDem - Reference DEM data
 * @param {number} noDataValue - No-data value to skip
 * @returns {number} Similarity score from 0 to 1
 */
export const computeDemSimilarity = (currentDem, referenceDem, noDataValue) => {
  const validCurrent = [];
  const validReference = [];
  const validIndices = [];

  // Gather valid values and indices.
  for (let i = 0; i < currentDem.length; i++) {
    const current = currentDem[i];
    const reference = referenceDem[i];
    // Skip no-data values.
    if (
      current === noDataValue ||
      reference === noDataValue ||
      !isFinite(current) ||
      !isFinite(reference)
    ) {
      continue;
    }
    validCurrent.push(current);
    validReference.push(reference);
    validIndices.push(i);
  }

  if (validIndices.length === 0) {
    // No valid data to compare.
    return 0;
  }

  // Compute minimum and maximum for current DEM.
  let minCurrent = Infinity;
  let maxCurrent = -Infinity;
  for (let i = 0; i < validCurrent.length; i++) {
    if (validCurrent[i] < minCurrent) minCurrent = validCurrent[i];
    if (validCurrent[i] > maxCurrent) maxCurrent = validCurrent[i];
  }
  const rangeCurrent = maxCurrent - minCurrent;

  // Compute minimum and maximum for reference DEM.
  let minReference = Infinity;
  let maxReference = -Infinity;
  for (let i = 0; i < validReference.length; i++) {
    if (validReference[i] < minReference) minReference = validReference[i];
    if (validReference[i] > maxReference) maxReference = validReference[i];
  }
  const rangeReference = maxReference - minReference;

  // Normalize both DEMs to 0-1 range (min-max normalization).
  const normalizedCurrent = new Float32Array(validCurrent.length);
  const normalizedReference = new Float32Array(validReference.length);

  for (let i = 0; i < validCurrent.length; i++) {
    // Normalize: `(value - min) / (max - min)`.
    normalizedCurrent[i] =
      rangeCurrent > 0 ? (validCurrent[i] - minCurrent) / rangeCurrent : 0;
    normalizedReference[i] =
      rangeReference > 0
        ? (validReference[i] - minReference) / rangeReference
        : 0;
  }

  // Compute MSE between normalized values.
  let sumSquaredError = 0;
  let sumSquaredErrorFlat = 0;

  for (let i = 0; i < normalizedCurrent.length; i++) {
    // MSE between normalized current and normalized reference.
    const error = normalizedCurrent[i] - normalizedReference[i];
    sumSquaredError += error * error;

    // MSE between normalized reference and flat terrain (0).
    // This is just the squared normalized reference values.
    sumSquaredErrorFlat += normalizedReference[i] * normalizedReference[i];
  }

  const mse = sumSquaredError / validIndices.length;
  const flatMse = sumSquaredErrorFlat / validIndices.length;

  if (flatMse === 0) {
    // If the reference DEM is flat (all same value), we return a perfect score
    // by default.
    return mse === 0 ? 1 : 0;
  }

  // Normalize: `1 - (MSE / flat_terrain_MSE)`.
  // This gives 0% when MSE equals the flat MSE (as bad as flat terrain) and
  // 100% when MSE is 0 (perfect match).
  // Clamp to 0-1 range (if MSE > flat MSE, result can go negative).
  const score = 1 - mse / flatMse;
  return Math.max(0, Math.min(1, score));
};

/**
 * Computes the accuracy percentage from a DEM similarity score.
 *
 * @param {number} score - The DEM similarity score
 * @returns {number} The accuracy percentage
 */
export const computeAccuracyPercentage = (score) => {
  return Math.pow(score, 0.5) * 100;
};

/**
 * Converts a percentage (e.g. a DEM similarity score) to a letter grade.
 *
 * @param {number} percentage - The percentage to convert
 * @returns {string} The letter grade
 */
export const getLetterGrade = (percentage) => {
  // Convert percentage to a letter grade
  let letterGrade;
  if (percentage >= 92) {
    letterGrade = "A+";
  } else if (percentage >= 87) {
    letterGrade = "A";
  } else if (percentage >= 82) {
    letterGrade = "A-";
  } else if (percentage >= 77) {
    letterGrade = "B+";
  } else if (percentage >= 72) {
    letterGrade = "B";
  } else if (percentage >= 63) {
    letterGrade = "B-";
  } else if (percentage >= 54) {
    letterGrade = "C+";
  } else if (percentage >= 45) {
    letterGrade = "C";
  } else if (percentage >= 36) {
    letterGrade = "C-";
  } else if (percentage >= 27) {
    letterGrade = "D+";
  } else if (percentage >= 18) {
    letterGrade = "D";
  } else if (percentage >= 9) {
    letterGrade = "D-";
  } else {
    letterGrade = "F";
  }
  return letterGrade;
};

/**
 * Samples points along a line at regular intervals.
 *
 * @param {number} x0 - Start column
 * @param {number} y0 - Start row
 * @param {number} x1 - End column
 * @param {number} y1 - End row
 * @param {number} stepSize - Distance between sampled points (in pixels)
 * @returns {Array<DemCoords>} Array of sampled points
 */
export const sampleLine = (x0, y0, x1, y1, stepSize = 3) => {
  const points = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < stepSize) {
    points.push({ row: y1, col: x1 });
    return points;
  }

  const numSteps = Math.ceil(distance / stepSize);
  const stepX = dx / numSteps;
  const stepY = dy / numSteps;

  for (let i = 0; i <= numSteps; i++) {
    const x = Math.round(x0 + stepX * i);
    const y = Math.round(y0 + stepY * i);
    points.push({ row: y, col: x });
  }

  return points;
};
