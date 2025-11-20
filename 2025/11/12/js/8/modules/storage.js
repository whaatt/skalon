/** @typedef {import("./typings.js").BoundingBox} BoundingBox */
/** @typedef {import("./typings.js").LonLat} LonLat */

import { LOCATION_SPECIFIER } from "./assets.js";
import { DB_VERSION, STORE_NAME } from "./constants.js";

// Base key names (will be suffixed with `LOCATION_SPECIFIER`).
const DEM_STORAGE_KEY_BASE = "saved_dem";
const SUN_POSITION_STORAGE_KEY_BASE = "sun_position";
const SUN_MODE_STORAGE_KEY_BASE = "sun_mode";
const TOOL_STORAGE_KEY_BASE = "selected_tool";
const SIDEBAR_COLLAPSED_STORAGE_KEY_BASE = "sidebar_collapsed";
const DB_NAME_BASE = "terrain_dem_db";

/**
 * Builds a storage key with location specifier.
 *
 * @param {string} baseKey - Base key name
 * @returns {string} Full storage key
 * @private
 */
const buildStorageKey = (baseKey) => `${baseKey}_${LOCATION_SPECIFIER}`;

/**
 * Builds a database name with location specifier.
 *
 * @param {string} baseName - Base database name
 * @returns {string} Full database name
 * @private
 */
const buildDbName = (baseName) => `${baseName}_${LOCATION_SPECIFIER}`;

/**
 * Opens an IndexedDB database.
 *
 * @param {string} dbName - Database name
 * @returns {Promise<IDBDatabase>}
 * @private
 */
const openDb = (dbName) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const target = /** @type {IDBOpenDBRequest} */ (event.target);
      const db = target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

/**
 * Loads DEM data from IndexedDB.
 *
 * @param {number} width - Expected DEM width
 * @param {number} height - Expected DEM height
 * @returns {Promise<Float32Array|null>} Loaded DEM data or null if not found/invalid
 */
export const loadDemFromIndexedDb = async (width, height) => {
  try {
    const dbName = buildDbName(DB_NAME_BASE);
    const storageKey = buildStorageKey(DEM_STORAGE_KEY_BASE);
    const db = await openDb(dbName);

    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(storageKey);

      request.onsuccess = () => {
        const data = request.result;
        if (!data) {
          console.log("loadDemFromIndexedDB: No saved DEM found in IndexedDB");
          resolve(null);
          return;
        }

        if (data.width !== width || data.height !== height) {
          console.warn(
            `loadDemFromIndexedDB: Saved DEM dimensions (${data.width} by ${data.height}) don't match current dimensions (${width} by ${height}); ignoring saved DEM`
          );
          resolve(null);
          return;
        }

        const dem = new Float32Array(data.data);
        console.log("loadDemFromIndexedDB: DEM loaded from IndexedDB");
        resolve(dem);
      };

      request.onerror = () => {
        console.error(
          "loadDemFromIndexedDB: Failed to load DEM from IndexedDB:",
          request.error
        );
        resolve(null);
      };
    });
  } catch (error) {
    console.error(
      "loadDemFromIndexedDB: Failed to load DEM from IndexedDB:",
      error
    );
    return null;
  }
};

/**
 * Saves DEM data to IndexedDB.
 *
 * @param {Float32Array} dem - DEM data to save
 * @param {number} width - DEM width
 * @param {number} height - DEM height
 * @param {number} noDataValue - No-data value
 * @param {number} pixelSize - Pixel size in meters
 * @param {BoundingBox} bounds - Bounding box
 * @returns {Promise<void>}
 */
export const saveDemToIndexedDb = async (
  dem,
  width,
  height,
  noDataValue,
  pixelSize,
  bounds
) => {
  try {
    const dbName = buildDbName(DB_NAME_BASE);
    const storageKey = buildStorageKey(DEM_STORAGE_KEY_BASE);
    const db = await openDb(dbName);
    const data = {
      data: Array.from(dem),
      width,
      height,
      noDataValue,
      pixelSize,
      bounds,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data, storageKey);

      request.onsuccess = () => {
        console.log("saveDemToIndexedDB: DEM saved to IndexedDB");
        resolve();
      };

      request.onerror = () => {
        console.error(
          "saveDemToIndexedDB: Failed to save DEM to IndexedDB:",
          request.error
        );
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(
      "saveDemToIndexedDB: Failed to save DEM to IndexedDB:",
      error
    );
  }
};

/**
 * Gets the saved sun position from `localStorage`.
 *
 * @param {BoundingBox} bounds - Valid bounds for position
 * @returns {LonLat | null} Saved sun position or null if not found/invalid
 */
export const getSavedSunPosition = (bounds) => {
  try {
    const storageKey = buildStorageKey(SUN_POSITION_STORAGE_KEY_BASE);
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.lon === "number" &&
      typeof parsed.lat === "number" &&
      !isNaN(parsed.lon) &&
      !isNaN(parsed.lat)
    ) {
      if (
        parsed.lon >= bounds.minLon &&
        parsed.lon <= bounds.maxLon &&
        parsed.lat >= bounds.minLat &&
        parsed.lat <= bounds.maxLat
      ) {
        return { lon: parsed.lon, lat: parsed.lat };
      }
    }

    return null;
  } catch (error) {
    console.warn(
      "getSavedSunPosition: Failed to load sun position from localStorage:",
      error
    );
    return null;
  }
};

/**
 * Saves the sun position to `localStorage`.
 *
 * @param {number} lon - Sun longitude
 * @param {number} lat - Sun latitude
 */
export const saveSunPosition = (lon, lat) => {
  try {
    const storageKey = buildStorageKey(SUN_POSITION_STORAGE_KEY_BASE);
    localStorage.setItem(storageKey, JSON.stringify({ lon, lat }));
    console.log("saveSunPosition: Saved sun position to `localStorage`:", {
      lon,
      lat,
    });
  } catch (error) {
    console.warn(
      "saveSunPosition: Failed to save sun position to `localStorage`:",
      error
    );
  }
};

/** @typedef {import("./typings.js").SunMode} SunMode */

/**
 * Gets the saved sun mode from localStorage.
 *
 * @returns {SunMode | null} Saved sun mode (0, 1, or 2) or null if not found/invalid
 */
export const getSavedSunMode = () => {
  try {
    const storageKey = buildStorageKey(SUN_MODE_STORAGE_KEY_BASE);
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return null;
    }

    const mode = parseInt(stored, 10);
    if (mode === 0 || mode === 1 || mode === 2) {
      return /** @type {SunMode} */ (mode);
    }

    return null;
  } catch (error) {
    console.warn(
      "getSavedSunMode: Failed to load sun mode from `localStorage`:",
      error
    );
    return null;
  }
};

/**
 * Saves the sun mode to `localStorage`.
 *
 * @param {SunMode} mode - Sun mode (0, 1, or 2)
 */
export const saveSunMode = (mode) => {
  try {
    const storageKey = buildStorageKey(SUN_MODE_STORAGE_KEY_BASE);
    localStorage.setItem(storageKey, mode.toString());
    console.log("saveSunMode: Saved sun mode to `localStorage`:", mode);
  } catch (error) {
    console.warn(
      "saveSunMode: Failed to save sun mode to `localStorage`:",
      error
    );
  }
};

/**
 * Gets the selected tool from localStorage or returns default.
 *
 * @param {string} defaultTool - Default tool name
 * @returns {string} Selected tool name
 */
export const getSelectedTool = (defaultTool) => {
  try {
    const storageKey = buildStorageKey(TOOL_STORAGE_KEY_BASE);
    const stored = localStorage.getItem(storageKey);
    return stored || defaultTool;
  } catch (error) {
    console.warn(
      "getSelectedTool: Failed to load selected tool from `localStorage`:",
      error
    );
    return defaultTool;
  }
};

/**
 * Saves the selected tool to `localStorage`.
 *
 * @param {string} tool - Tool name to save
 */
export const saveSelectedTool = (tool) => {
  try {
    const storageKey = buildStorageKey(TOOL_STORAGE_KEY_BASE);
    localStorage.setItem(storageKey, tool);
  } catch (error) {
    console.warn(
      "setSelectedTool: Failed to save selected tool to `localStorage`:",
      error
    );
  }
};

/**
 * Gets the saved sidebar collapsed state from localStorage.
 *
 * @param {boolean} defaultCollapsed - Default collapsed state
 * @returns {boolean} Saved sidebar collapsed state or default if not found
 */
export const getSavedSidebarCollapsed = (defaultCollapsed = false) => {
  try {
    const storageKey = buildStorageKey(SIDEBAR_COLLAPSED_STORAGE_KEY_BASE);
    const stored = localStorage.getItem(storageKey);
    if (stored === null) {
      return defaultCollapsed;
    }
    return stored === "true";
  } catch (error) {
    console.warn(
      "getSavedSidebarCollapsed: Failed to load sidebar collapsed state from `localStorage`:",
      error
    );
    return defaultCollapsed;
  }
};

/**
 * Saves the sidebar collapsed state to `localStorage`.
 *
 * @param {boolean} collapsed - Whether sidebar is collapsed
 */
export const saveSidebarCollapsed = (collapsed) => {
  try {
    const storageKey = buildStorageKey(SIDEBAR_COLLAPSED_STORAGE_KEY_BASE);
    localStorage.setItem(storageKey, collapsed.toString());
    console.log(
      "saveSidebarCollapsed: Saved sidebar collapsed state to `localStorage`:",
      collapsed
    );
  } catch (error) {
    console.warn(
      "saveSidebarCollapsed: Failed to save sidebar collapsed state to `localStorage`:",
      error
    );
  }
};
