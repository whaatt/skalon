// Geographic/Coordinate Types:
export type BoundingBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export type LonLat = {
  lon: number;
  lat: number;
};

export type LngLat = {
  lng: number;
  lat: number;
};

export type DemCoords = {
  row: number;
  col: number;
};

// DEM (Digital Elevation Model) Types:
export type DemMetadata = {
  crs: string;
  xOrigin: number;
  yOrigin: number;
  pixelSize: number;
  width: number;
  height: number;
  noDataValue: number;
  bounds: BoundingBox;
};

export type DemConversionParams = {
  bounds: BoundingBox;
  xOrigin: number;
  yOrigin: number;
  pixelSize: number;
};

export type DemDimensions = {
  width: number;
  height: number;
};

// MapLibre/Map Library Types:
export type MapLibreMouseEvent = {
  lngLat: LngLat;
};

export type MapLibreKeyboard = {
  disable: () => void;
};

export type MapLibreDragRotate = {
  disable: () => void;
};

export type MapLibreTouchZoomRotate = {
  disableRotation: () => void;
};

export type MapLibreMap = {
  keyboard: MapLibreKeyboard;
  dragRotate: MapLibreDragRotate;
  touchZoomRotate: MapLibreTouchZoomRotate;
  getContainer: () => HTMLElement;
  project: (lngLat: LngLat) => { x: number; y: number };
  unproject: (point: [number, number]) => LngLat;
  triggerRepaint: () => void;
  on: (event: string, handler: () => void) => void;
  addSource: (id: string, source: MapLibreSource) => void;
  addLayer: (layer: MapLibreLayer) => void;
  getSource: (id: string) => MapLibreCanvasSource | null;
  getLayer: (id: string) => MapLibreLayer | null;
  moveLayer: (id: string) => void;
  removeLayer: (id: string) => void;
  removeSource: (id: string) => void;
  getCanvas: () => HTMLCanvasElement;
  fitBounds: (bounds: [[number, number], [number, number]]) => void;
};

export type MapLibreSource = {
  type: string;
  canvas?: HTMLCanvasElement;
  coordinates?: [
    [number, number],
    [number, number],
    [number, number],
    [number, number]
  ];
  tiles?: string[];
  tileSize?: number;
  attribution?: string;
  data?: {
    type: string;
    coordinates?: unknown;
    [key: string]: unknown;
  };
  animate?: boolean;
};

export type MapLibreLayer = {
  id: string;
  type: string;
  source: string;
  paint?: {
    "raster-opacity"?: number;
    "raster-resampling"?: string;
    "raster-fade-duration"?: number;
  };
};

export type MapLibreCanvasSource = {
  setCoordinates: (
    coords: [
      [number, number],
      [number, number],
      [number, number],
      [number, number]
    ]
  ) => void;
};

export type MapLibreMarker = {
  setLngLat: (lngLat: [number, number]) => MapLibreMarker;
  getLngLat: () => LngLat;
  addTo: (map: MapLibreMap) => MapLibreMarker;
  remove: () => void;
  on: (event: string, handler: () => void) => void;
};

// GeoJSON Types:
export type GeoJSONPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

export type GeoJSONMultiPolygon = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};

export type GeoJSONArea = GeoJSONPolygon | GeoJSONMultiPolygon;

// Canvas/Rendering Types:
/**
 * Sun mode enum.
 *
 * - Mode 0: Day mode with hillshade and cone
 * - Mode 1: Day mode without hillshade or cone
 * - Mode 2: Night mode without hillshade or cone (moon)
 */
export type SunMode = 0 | 1 | 2;

export type WaterPixelIndex = {
  x: number;
  y: number;
  phase: number;
  color: [number, number, number];
  speed: number;
  pixelIdx: number;
};

export interface WaterCanvasElement extends HTMLCanvasElement {
  pixelIndices: WaterPixelIndex[];
  startPixelBloom: () => void;
  stopPixelBloom: () => void;
  pausePixelBloom: () => void;
  resumePixelBloom: () => void;
  updateBackgroundBuffer: () => void;
}

// Controller Types:
export type SunController = {
  marker: MapLibreMarker | null;
  updateDEM: (dem: Float32Array) => void;
  remove: () => void;
};

// Storage Types:
export type StorageKeys = {
  dem: string;
  sunPosition: string;
  sunMode: string;
  tool: string;
};

// Algorithm/Generation Types:
export type DiamondSquareConfig = {
  roughness: number;
  minHeight: number;
  maxHeight: number;
  blurRadius?: number;
};

// External Library Declarations:
declare const maplibregl: {
  Map: new (options: unknown) => unknown;
  Marker: new (options: unknown) => unknown;
};
