// Map configuration.
export const MAP_MIN_ZOOM = 11;
export const MAP_MAX_ZOOM = 15;
export const MAP_PITCH = 0;

// Base map tile URL.
export const BASE_MAP_TILE_URL =
  "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png";

// Water canvas configuration.
export const WATER_PADDING_LARGER_DIMENSION_PERCENT = 1.0;
export const WATER_TERRAIN_MAX_PROXIMITY_PIXELS = 16;

// Water canvas background colors.
export const WATER_BACKGROUND_DAY = { r: 26, g: 77, b: 140 };
export const WATER_BACKGROUND_NIGHT = { r: 8, g: 12, b: 22 };

// Water general animation configuration.
export const WATER_RESUME_DEBOUNCE_MS = 100;

// Water pixel bloom configuration.
export const WATER_PIXEL_GAP = 8;
export const WATER_PIXEL_SIZE = 2;
export const WATER_PIXEL_DRAW_SIZE = 2;
export const WATER_PIXEL_DENSITY = 0.6;
export const WATER_PIXEL_MIN_INTENSITY = 0.3;
export const WATER_PIXEL_MAX_INTENSITY = 1.0;
export const WATER_PIXEL_MIN_BRIGHTNESS = 0.02;
export const WATER_CYCLE_SPEED_RADIANS_PER_SECOND = 2;

// Terrain mode values.
export const TERRAIN_MODE_DAY_HILLSHADE = 0;
export const TERRAIN_MODE_DAY_NO_HILLSHADE = 1;
export const TERRAIN_MODE_NIGHT = 2;

// Sun canvas configuration.
export const SUN_CANVAS_SIZE = 800;
export const SUN_RADIUS = 18;
export const SUN_GLOW_RADIUS = 36;
export const SUN_MARKER_SIZE = 120;
export const SUN_MAX_CONE_LENGTH = 200;
export const SUN_CONE_HALF_ANGLE_DEGREES = 45;
export const SUN_DOUBLE_TAP_DELAY_MS = 300;

// Sun position defaults.
export const SUN_ELEVATION_DEFAULT = 45;
export const SUN_AZIMUTH_DEFAULT = 75;

// Terraforming tool configuration.
export const TOOL_RADIUS_SCREEN_PIXELS = 25;
export const TOOL_DELTA_REPROCESSING_MS = 250;
export const TOOL_FULL_HEIGHT_SCALING_FRAMES = 75;
export const TOOL_INTENSITY_PER_FRAME = 1.0;
export const TOOL_MAX_QUEUE_SIZE = 500;

// DEM save configuration.
export const DEM_SAVE_DEBOUNCE_MS = 500;

// Tool names.
export const TOOL_PAN = "pan";
export const TOOL_UP = "up";
export const TOOL_DOWN = "down";

// Generation mode names.
export const GENERATION_MODE_RANDOM = "random";
export const GENERATION_MODE_FLAT = "flat";
export const GENERATION_MODE_ACTUAL = "actual";

// IndexedDB configuration.
export const DB_VERSION = 1;
export const STORE_NAME = "dem_data";

// Export badge configuration.
export const BADGE_PADDING = 16;
export const BADGE_FONT_SIZE = 40;

// Diamond-square algorithm configuration.
export const DIAMOND_SQUARE_ROUGHNESS = 0.8;
export const DIAMOND_SQUARE_MIN_HEIGHT = 0;
export const DIAMOND_SQUARE_BLUR_RADIUS = 4;

// DOM element identifiers.
export const HIDDEN_CLASS = "hidden";
export const LOADING_OVERLAY_ID = "loading-overlay";
export const MAP_CONTAINER_ID = "map";
export const SCORE_BUTTON_ID = "score-button";
export const SHARE_BUTTON_ID = "share-button";
export const SIDEBAR_ID = "sidebar";
export const SIDEBAR_TOGGLE_ID = "sidebar-toggle";
export const SUN_MARKER_CLASS = "sun-marker";
export const TOOL_ACTIVE_CLASS = "tool-active";
export const TOOL_INDICATOR_ID = "tool-indicator";

// MapLibre source identifiers.
export const MAP_SOURCE_BASE = "base";
export const MAP_SOURCE_BOUNDARY = "boundary";
export const MAP_SOURCE_DEM_CANVAS = "dem-canvas";
export const MAP_SOURCE_SUN_CANVAS = "sun-canvas";
export const MAP_SOURCE_WATER_CANVAS = "water-canvas";

// MapLibre layer identifiers.
export const MAP_LAYER_BASE = "base";
export const MAP_LAYER_DEM = "dem-layer";
export const MAP_LAYER_SUN = "sun-layer";
export const MAP_LAYER_WATER = "water-layer";
