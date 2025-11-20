/** @typedef {import("./modules/typings.js").MapLibreMap} MapLibreMap */
/** @typedef {import("./modules/typings.js").SunMode} SunMode */

import {
  boundary as boundaryRaw,
  demBuffer,
  demMetadata,
} from "./modules/assets.js";
import {
  BASE_MAP_TILE_URL,
  HIDDEN_CLASS,
  LOADING_OVERLAY_ID,
  MAP_CONTAINER_ID,
  MAP_LAYER_BASE,
  MAP_LAYER_DEM,
  MAP_LAYER_SUN,
  MAP_LAYER_WATER,
  MAP_MAX_ZOOM,
  MAP_PITCH,
  MAP_SOURCE_BASE,
  MAP_SOURCE_BOUNDARY,
  MAP_SOURCE_DEM_CANVAS,
  MAP_SOURCE_WATER_CANVAS,
  SCORE_BUTTON_ID,
  SHARE_BUTTON_ID,
  SIDEBAR_ID,
  SIDEBAR_TOGGLE_ID,
  TOOL_ACTIVE_CLASS,
  TOOL_UP,
  WATER_RESUME_DEBOUNCE_MS,
} from "./modules/constants.js";
import { exportMapImage } from "./modules/export.js";
import {
  calculateElevationRange,
  calculateWaterBounds,
  generateFlattenedDem,
} from "./modules/helpers.js";
import { TerrainManager } from "./modules/manager.js";
import { ScoringController } from "./modules/scoring.js";
import {
  getSavedSidebarCollapsed,
  getSavedSunMode,
  getSavedSunPosition,
  getSelectedTool,
  loadDemFromIndexedDb,
  saveDemToIndexedDb,
  saveSelectedTool,
  saveSidebarCollapsed,
  saveSunMode,
  saveSunPosition,
} from "./modules/storage.js";
import { SunController } from "./modules/sun.js";
import { TerraformController } from "./modules/terraform.js";
import { TerrainCanvas } from "./modules/terrain.js";
import { WaterCanvas } from "./modules/water.js";

const boundary = /** @type {import("./modules/typings.js").GeoJSONArea} */ (
  boundaryRaw
);

const {
  xOrigin,
  yOrigin,
  pixelSize,
  width,
  height,
  noDataValue,
  bounds: terrainBbox,
} = demMetadata;
const { minLon, minLat, maxLon, maxLat } = terrainBbox;

/**
 * Saves DEM data to IndexedDB (wrapper for storage module).
 *
 * @param {Float32Array} dem - DEM data to save
 */
const saveDem = async (dem) => {
  await saveDemToIndexedDb(
    dem,
    width,
    height,
    noDataValue,
    pixelSize,
    terrainBbox
  );
};

/**
 * Loads DEM data from IndexedDB (wrapper for storage module).
 *
 * @returns {Promise<Float32Array|null>} Loaded DEM data or `null` if not found/invalid
 */
const loadDem = async () => {
  return await loadDemFromIndexedDb(width, height);
};

// Initialize helpful globals based on the reference DEM and terrain GeoJSON.
const referenceDem = new Float32Array(demBuffer);
const { minZ: referenceMinZ, maxZ: referenceMaxZ } = calculateElevationRange(
  referenceDem,
  noDataValue
);
const terrainCenterLon = (minLon + maxLon) / 2;
const terrainCenterLat = (minLat + maxLat) / 2;
const terrainCenter = {
  lon: terrainCenterLon,
  lat: terrainCenterLat,
};
const terrainCorners =
  /** @type {[[number, number], [number, number], [number, number], [number, number]]} */ ([
    [minLon, maxLat],
    [maxLon, maxLat],
    [maxLon, minLat],
    [minLon, minLat],
  ]);
const waterBbox = calculateWaterBounds(terrainBbox);
const {
  minLon: waterMinLon,
  minLat: waterMinLat,
  maxLon: waterMaxLon,
  maxLat: waterMaxLat,
} = waterBbox;
const waterCorners =
  /** @type {[[number, number], [number, number], [number, number], [number, number]]} */ ([
    [waterMinLon, waterMaxLat],
    [waterMaxLon, waterMaxLat],
    [waterMaxLon, waterMinLat],
    [waterMinLon, waterMinLat],
  ]);
const waterCanvasWidth = Math.ceil(
  // Calculate water canvas dimensions based on a padded terrain bounding box.
  ((waterMaxLon - waterMinLon) / (maxLon - minLon)) * width
);
const waterCanvasHeight = Math.ceil(
  ((waterMaxLat - waterMinLat) / (maxLat - minLat)) * height
);

// Create water canvas and start animation
const waterCanvas = new WaterCanvas(
  waterCanvasWidth,
  waterCanvasHeight,
  waterMinLon,
  waterMinLat,
  waterMaxLon,
  waterMaxLat,
  boundary
);
waterCanvas.startAnimation();

// Initialize terrain manager (which has deferred dependencies on the scoring
// controller and terrain canvas as a callback).
/** @type {ScoringController | undefined} */
let scoringController;
/** @type {TerrainCanvas | undefined} */
let terrainCanvas;
const terrainManager = new TerrainManager(
  referenceDem,
  width,
  height,
  noDataValue,
  pixelSize,
  referenceMaxZ,
  (/** @type {Float32Array} */ newDem) => {
    // Callback when DEM is newly-generated.
    terrainManager.setCurrentDem(newDem);
    saveDem(newDem);
    if (terrainCanvas) {
      terrainCanvas.render();
    }
    if (scoringController) {
      scoringController.resetScoreButton();
    }
  },
  () => {
    // Callback when DEM needs to be re-rendered.
    if (terrainCanvas) {
      terrainCanvas.render();
    }
  }
);

// Initialize terrain manager with flattened DEM (updated later on if a saved
// DEM exists).
let initialDem = generateFlattenedDem(referenceDem, width, height, noDataValue);
terrainManager.setCurrentDem(initialDem);

// Create terrain canvas pulling from the terrain manager.
terrainCanvas = new TerrainCanvas(width, height, terrainManager);
terrainCanvas.setReferenceMinMax(referenceMinZ, referenceMaxZ);

// Initialize scoring controller (used by the terrain manager callback).
const scoreButton = document.getElementById(SCORE_BUTTON_ID);
scoringController = new ScoringController(
  terrainManager,
  referenceDem,
  width,
  height,
  noDataValue,
  scoreButton
);

// Restore sun position and mode from `localStorage`.
const savedSunPosition = getSavedSunPosition(waterBbox);
if (savedSunPosition) {
  console.log("Restored sun position from localStorage:", savedSunPosition);
}
const savedSunMode = getSavedSunMode();
if (savedSunMode !== null) {
  console.log("Restored sun mode from localStorage:", savedSunMode);
}

// Load saved DEM if available and render (async).
(async () => {
  const loadedDem = await loadDem();
  if (loadedDem) {
    terrainManager.setCurrentDem(loadedDem);
  }
  terrainCanvas.render();
})();

// Initialize map.
const map = /** @type {MapLibreMap} */ (
  // @ts-ignore
  new maplibregl.Map({
    attributionControl: false,
    container: MAP_CONTAINER_ID,
    style: {
      version: 8,
      sources: {
        [MAP_SOURCE_BASE]: {
          type: "raster",
          tiles: [BASE_MAP_TILE_URL],
          tileSize: 256,
          attribution: "© OpenStreetMap",
        },
        [MAP_SOURCE_BOUNDARY]: {
          type: "geojson",
          data: boundary,
        },
      },
      layers: [{ id: MAP_LAYER_BASE, type: "raster", source: MAP_SOURCE_BASE }],
    },
    center: [terrainCenterLon, terrainCenterLat],
    // minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    pitch: MAP_PITCH,
    maxBounds: [
      [waterMinLon, waterMinLat],
      [waterMaxLon, waterMaxLat],
    ],
  })
);
map.keyboard.disable();
map.dragRotate.disable();
map.touchZoomRotate.disableRotation();
map.fitBounds([
  [waterMinLon, waterMinLat],
  [waterMaxLon, waterMaxLat],
]);

// Add layers to map upon load and initialize event listeners.
map.on("load", () => {
  // Set up water canvas layer (not managed by `WaterCanvas` since the
  // coordinates never need to change).
  map.addSource(MAP_SOURCE_WATER_CANVAS, {
    type: "canvas",
    canvas: waterCanvas.canvas,
    coordinates: waterCorners,
    animate: true,
  });
  map.addLayer({
    id: MAP_LAYER_WATER,
    type: "raster",
    source: MAP_SOURCE_WATER_CANVAS,
    paint: {
      "raster-opacity": 1.0,
      "raster-resampling": "nearest",
      "raster-fade-duration": 0,
    },
  });
  console.log("Map: Water canvas layer added and animation started");

  // Set up terrain canvas layer.
  map.addSource(MAP_SOURCE_DEM_CANVAS, {
    type: "canvas",
    canvas: terrainCanvas.canvas,
    coordinates: terrainCorners,
    animate: true,
  });
  map.addLayer({
    id: MAP_LAYER_DEM,
    type: "raster",
    source: MAP_SOURCE_DEM_CANVAS,
    paint: {
      "raster-opacity": 0.7,
      "raster-resampling": "nearest",
      "raster-fade-duration": 0,
    },
  });
  console.log("Map: Terrain canvas layer added");

  // Initialize terraforming controller.
  const mapContainer = map.getContainer();
  const terraformingController = new TerraformController(
    map,
    terrainManager,
    mapContainer,
    terrainBbox,
    xOrigin,
    yOrigin,
    pixelSize,
    width,
    height,
    saveDem,
    () => scoringController.resetScoreButton()
  );

  // Set up sun controller (manages map source and layer internally).
  new SunController(
    map,
    terrainCanvas,
    waterCanvas,
    terrainManager,
    waterBbox,
    terrainBbox,
    terrainCenter,
    (lon, lat) => saveSunPosition(lon, lat),
    (mode) => saveSunMode(mode),
    () => {
      terraformingController.setSunDragging(true);
      mapContainer.classList.remove(TOOL_ACTIVE_CLASS);
    },
    () => {
      terraformingController.setSunDragging(false);
    },
    savedSunPosition,
    savedSunMode
  );
  console.log("Map: Sun controller added");

  // Move sun layer to be above all other layers.
  if (map.getLayer(MAP_LAYER_SUN)) {
    try {
      map.moveLayer(MAP_LAYER_SUN);
    } catch (error) {
      console.warn("Map: Could not move sun layer to top:", error);
    }
  }

  /** @type {number | null} */
  let interactionTimeout = null;

  const pauseAnimation = () => {
    waterCanvas.pauseAnimation();
    if (interactionTimeout) {
      clearTimeout(interactionTimeout);
    }
  };

  const resumeAnimation = () => {
    if (interactionTimeout) {
      clearTimeout(interactionTimeout);
    }
    interactionTimeout = setTimeout(() => {
      waterCanvas.resumeAnimation();
    }, WATER_RESUME_DEBOUNCE_MS);
  };

  // Add event listeners to pause water animation during map interactions.
  map.on("movestart", pauseAnimation);
  map.on("zoomstart", pauseAnimation);
  map.on("rotatestart", pauseAnimation);
  map.on("pitchstart", pauseAnimation);

  // Add event listeners to resume water animation after map interactions end.
  map.on("moveend", resumeAnimation);
  map.on("zoomend", resumeAnimation);
  map.on("rotateend", resumeAnimation);
  map.on("pitchend", resumeAnimation);

  // Add event listener to the sidebar toggle button.
  const sidebarToggle = document.getElementById(SIDEBAR_TOGGLE_ID);
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (sidebarToggle && sidebar) {
    const updateToggleText = () => {
      if (sidebar.classList.contains(HIDDEN_CLASS)) {
        sidebarToggle.textContent = "▶ Sidebar";
      } else {
        sidebarToggle.textContent = "▼ Sidebar";
      }
    };

    // Attempt to restore sidebar collapsed state from `localStorage`.
    const savedCollapsed = getSavedSidebarCollapsed(false);
    if (savedCollapsed) {
      sidebar.classList.add(HIDDEN_CLASS);
    }
    updateToggleText();
    sidebarToggle.addEventListener("click", (event) => {
      event.preventDefault();
      sidebar.classList.toggle(HIDDEN_CLASS);
      const isCollapsed = sidebar.classList.contains(HIDDEN_CLASS);
      saveSidebarCollapsed(isCollapsed);
      updateToggleText();
    });
  }

  // Add event listeners to generation mode buttons.
  const generationModeButtons = document.querySelectorAll(".generation-mode");
  terrainManager.setUpGenerationModeButtons(generationModeButtons);

  // Function to sync tool button state with the DOM.
  const updateToolButtons = (/** @type {string} */ selectedTool) => {
    const toolButtons = document.querySelectorAll(".tool");
    toolButtons.forEach((btn) => {
      const htmlBtn = /** @type {HTMLElement} */ (btn);
      const tool = htmlBtn.dataset.tool;
      if (tool === selectedTool) {
        htmlBtn.setAttribute("disabled", "");
      } else {
        htmlBtn.removeAttribute("disabled");
      }
    });
  };

  // Initialize current tool (possibly from `localStorage`) and save it (back)
  // to `localStorage`.
  let currentTool = getSelectedTool(TOOL_UP);
  saveSelectedTool(currentTool);
  updateToolButtons(currentTool);
  terraformingController.setTool(currentTool);

  // Add event listeners to tool buttons.
  const toolButtons = document.querySelectorAll(".tool");
  toolButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const htmlBtn = /** @type {HTMLElement} */ (btn);
      const tool = htmlBtn.dataset.tool;
      if (tool && tool !== currentTool) {
        currentTool = tool;
        saveSelectedTool(currentTool);
        updateToolButtons(currentTool);
        terraformingController.setTool(currentTool);
      }
    });
  });

  // Add event listener to share button.
  const shareButton = document.getElementById(SHARE_BUTTON_ID);
  if (shareButton) {
    shareButton.addEventListener("click", async () => {
      await exportMapImage(
        map,
        terrainManager,
        scoringController,
        referenceDem,
        noDataValue,
        shareButton
      );
    });
  }

  // Add window resize handler.
  window.addEventListener("resize", () => {
    map.fitBounds([
      [waterMinLon, waterMinLat],
      [waterMaxLon, waterMaxLat],
    ]);
  });

  // Loading complete; show map.
  const loadingOverlay = document.getElementById(LOADING_OVERLAY_ID);
  if (loadingOverlay) {
    loadingOverlay.style.opacity = "0";
    loadingOverlay.style.pointerEvents = "none";
    setTimeout(() => {
      loadingOverlay.style.display = "none";
    }, 300);
  }
});
