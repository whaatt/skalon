/** @typedef {import("./typings").DemMetadata} DemMetadata */

const LOCATION_SPECIFIER_DEFAULT = "sf";
export const LOCATION_SPECIFIER = (() => {
  if (window?.location?.search) {
    const params = new URLSearchParams(window.location.search);
    const queryCity = params.get("city");
    if (typeof queryCity === "string" && /^[a-z]{2,}$/i.test(queryCity)) {
      return queryCity.toLowerCase();
    }
  }
  return LOCATION_SPECIFIER_DEFAULT;
})();

// Disable the location button for the current location.
document.querySelectorAll(".location").forEach((btn) => {
  const htmlBtn = /** @type {HTMLElement} */ (btn);
  if (htmlBtn.dataset.location === LOCATION_SPECIFIER) {
    htmlBtn.setAttribute("disabled", "");
    htmlBtn.removeAttribute("href");
  }
});

const DEM_BIN_URL = `./scripts/dem_${LOCATION_SPECIFIER}.bin`;
const DEM_METADATA_URL = `./scripts/dem_${LOCATION_SPECIFIER}_metadata.json`;
const GEOJSON_URL = `./scripts/boundary_${LOCATION_SPECIFIER}.geojson`;

/** @type {[DemMetadata, ArrayBuffer, Object]} */
export const [demMetadata, demBuffer, boundary] = await Promise.all([
  fetch(DEM_METADATA_URL).then((response) => response.json()),
  fetch(DEM_BIN_URL).then((response) => response.arrayBuffer()),
  fetch(GEOJSON_URL).then((response) => response.json()),
]);
