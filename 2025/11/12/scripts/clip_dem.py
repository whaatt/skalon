# pyright: reportIgnoreCommentWithoutRule=false

import json
from typing import cast

import geopandas as gpd
import numpy as np
import pyproj
import rasterio  # pyright: ignore
from rasterio import features  # pyright: ignore
from rasterio.transform import from_origin  # pyright: ignore
from rasterio.warp import Resampling, reproject  # pyright: ignore

DEM_STEP_METERS = 30.0
DEM_STEP_STRING = f"{int(DEM_STEP_METERS)}m"
LOCATION_SPECIFIER = "nyc"
DEM_SRC = f"dem_{DEM_STEP_STRING}_{LOCATION_SPECIFIER}.tif"
BOUNDARY_SRC = f"boundary_{LOCATION_SPECIFIER}.geojson"

DEM_BIN_DST = f"dem_{LOCATION_SPECIFIER}.bin"
DEM_METADATA_DST = f"dem_{LOCATION_SPECIFIER}_metadata.json"

# This target CRS measures distances in meters (Mercator).
TARGET_CRS = "EPSG:3857"


def snap(value: float, step: float, up: bool = False) -> float:
    """Snaps the passed value to the nearest multiple of the step."""
    return cast(
        float, np.ceil(value / step) * step if up else np.floor(value / step) * step
    )


boundary_src_with_crs = gpd.read_file(BOUNDARY_SRC).to_crs(TARGET_CRS)  # pyright: ignore
min_x, min_y, max_x, max_y = cast(
    tuple[float, float, float, float], boundary_src_with_crs.bounds.iloc[0]
)
min_x, max_x = (
    snap(min_x, DEM_STEP_METERS, up=False),
    snap(max_x, DEM_STEP_METERS, up=True),
)
min_y, max_y = (
    snap(min_y, DEM_STEP_METERS, up=False),
    snap(max_y, DEM_STEP_METERS, up=True),
)

width = int(round((max_x - min_x) / DEM_STEP_METERS))
height = int(round((max_y - min_y) / DEM_STEP_METERS))
transform = cast(
    rasterio.Affine,
    from_origin(min_x, max_y, DEM_STEP_METERS, DEM_STEP_METERS),
)

# Project the DEM to a raster with the bounding box CRS and pixel transform.
with rasterio.open(DEM_SRC) as dem:  # pyright: ignore
    dst_profile = dem.profile.copy()  # pyright: ignore
    dst_profile.update(  # pyright: ignore
        {
            "driver": "GTiff",
            "dtype": "float32",
            "width": width,
            "height": height,
            "count": 1,
            "crs": TARGET_CRS,
            "transform": transform,
            "nodata": dem.nodata if dem.nodata is not None else -32768.0,  # pyright: ignore
        }
    )

    dem_projected = np.full((height, width), dst_profile["nodata"], dtype=np.float32)
    reproject(
        source=rasterio.band(dem, 1),  # pyright: ignore
        destination=dem_projected,
        src_transform=dem.transform,  # pyright: ignore
        src_crs=dem.crs,  # pyright: ignore
        dst_transform=transform,
        dst_crs=TARGET_CRS,
        resampling=Resampling.bilinear,
        dst_nodata=dst_profile["nodata"],  # pyright: ignore
    )

# Mask the projected DEM to the boundary shape.
mask = features.geometry_mask(  # pyright: ignore
    boundary_src_with_crs.geometry,
    out_shape=dem_projected.shape,
    transform=transform,
    invert=True,  # Makes the mask true for pixels that map inside geometries.
)
dem_projected[~mask] = dst_profile["nodata"]

# Write binary elevation data for raster pixels.
dem_projected.astype("<f4").tofile(DEM_BIN_DST)

# Compute some metadata about the latitude and longitude corresponding to the
# bounding box (using EPSG:4326 for the WGS84 datum).
projection = pyproj.Transformer.from_crs(TARGET_CRS, "EPSG:4326", always_xy=True)
(min_lon, min_lat) = cast(tuple[float, float], projection.transform(min_x, min_y))
(max_lon, max_lat) = cast(tuple[float, float], projection.transform(max_x, max_y))

# Save raster coordinate metadata.
metadata = {
    "crs": TARGET_CRS,
    "xOrigin": float(min_x),  # Left (in EPSG:3857 meters).
    "yOrigin": float(max_y),  # Top (in EPSG:3857 meters.
    "pixelSize": float(DEM_STEP_METERS),
    "width": int(width),
    "height": int(height),
    "noDataValue": float(dst_profile["nodata"]),  # pyright: ignore
    "bounds": {
        "minLon": min_lon,
        "minLat": min_lat,
        "maxLon": max_lon,
        "maxLat": max_lat,
    },
}
with open(DEM_METADATA_DST, "w") as dem_metadata_file:
    json.dump(metadata, dem_metadata_file, indent=2)
    print("", file=dem_metadata_file)
