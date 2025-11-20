/*
 * Utility functions for exporting map images.
 */

/** @typedef {import("./typings.js").MapLibreMap} MapLibreMap */
/** @typedef {import("./manager.js").TerrainManager} TerrainManager */

import { LOCATION_SPECIFIER } from "./assets.js";
import { BADGE_FONT_SIZE, BADGE_PADDING } from "./constants.js";
import {
  computeAccuracyPercentage,
  computeDemSimilarity,
  getLetterGrade,
} from "./helpers.js";
import { ScoringController } from "./scoring.js";

/**
 * Draws a badge with text on a canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {string} text - Badge text
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {"left" | "right"} align - Text alignment
 * @param {number} badgeFontSize - Font size in pixels
 */
export const drawBadge = (ctx, text, x, y, align, badgeFontSize) => {
  const badgePaddingX = badgeFontSize * 0.75;
  const badgePaddingY = badgeFontSize * 0.5;
  const cornerRadius = 8;

  ctx.font = `${badgeFontSize}px "Major Mono Display", monospace`;
  ctx.textAlign = /** @type {CanvasTextAlign} */ (align);
  ctx.textBaseline = "top";

  // Measure text to size the badge background,
  const textMetrics = ctx.measureText(text);
  const badgeWidth = textMetrics.width + badgePaddingX * 2;
  const badgeHeight = badgeFontSize + badgePaddingY * 2;

  // Calculate badge position based on alignment,
  let badgeLeftX, badgeRightX, textX;
  if (align === "right") {
    badgeRightX = x;
    badgeLeftX = x - badgeWidth;
    // For right-aligned text, `x` is where text ends, so subtract padding.
    textX = badgeRightX - badgePaddingX;
  } else {
    badgeLeftX = x;
    badgeRightX = x + badgeWidth;
    // For left-aligned text, `x` is where text starts, so add padding.
    textX = badgeLeftX + badgePaddingX;
  }

  // Draw badge background with rounded corners.
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.beginPath();
  ctx.moveTo(badgeLeftX + cornerRadius, y);
  ctx.lineTo(badgeRightX - cornerRadius, y);
  ctx.quadraticCurveTo(badgeRightX, y, badgeRightX, y + cornerRadius);
  ctx.lineTo(badgeRightX, y + badgeHeight - cornerRadius);
  ctx.quadraticCurveTo(
    badgeRightX,
    y + badgeHeight,
    badgeRightX - cornerRadius,
    y + badgeHeight
  );
  ctx.lineTo(badgeLeftX + cornerRadius, y + badgeHeight);
  ctx.quadraticCurveTo(
    badgeLeftX,
    y + badgeHeight,
    badgeLeftX,
    y + badgeHeight - cornerRadius
  );
  ctx.lineTo(badgeLeftX, y + cornerRadius);
  ctx.quadraticCurveTo(badgeLeftX, y, badgeLeftX + cornerRadius, y);
  ctx.closePath();
  ctx.fill();

  // Draw badge text at the correct position within the badge.
  ctx.fillStyle = "#fff";
  ctx.fillText(text, textX, y + badgePaddingY);
};

/**
 * Exports the map as a PNG image with badges.
 *
 * @param {MapLibreMap} map - Map instance
 * @param {TerrainManager} terrainManager - Terrain manager instance
 * @param {ScoringController} scoringController - Scoring controller instance
 * @param {Float32Array} referenceDem - Reference DEM for accuracy calculation
 * @param {number} noDataValue - No-data value
 * @param {HTMLElement | null} shareButton - Share button element (for disabling during export)
 */
export const exportMapImage = async (
  map,
  terrainManager,
  scoringController,
  referenceDem,
  noDataValue,
  shareButton = null
) => {
  try {
    if (shareButton) {
      shareButton.setAttribute("disabled", "");
    }

    map.triggerRepaint();
    await new Promise((resolve) =>
      requestAnimationFrame(() => resolve(undefined))
    );

    const mapCanvas = map.getCanvas();
    const mapWidth = mapCanvas.width;
    const mapHeight = mapCanvas.height;

    // Render map canvas to composite canvas.
    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = mapWidth;
    compositeCanvas.height = mapHeight;
    const ctx = compositeCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context");
    }
    ctx.drawImage(mapCanvas, 0, 0);

    // Compute accuracy percentage.
    let accuracyPercentage = 0;
    const currentDem = terrainManager.getCurrentDem();
    if (currentDem) {
      const score = computeDemSimilarity(currentDem, referenceDem, noDataValue);
      accuracyPercentage = computeAccuracyPercentage(score);
    }

    // Draw badges.
    const badgePadding = BADGE_PADDING;
    const badgeFontSize = BADGE_FONT_SIZE;
    const badgePaddingY = badgeFontSize * 0.5;
    const badgeHeight = badgeFontSize + badgePaddingY * 2;
    const letterGrade = getLetterGrade(accuracyPercentage);
    const percentageDisplayed = accuracyPercentage.toFixed(2);
    drawBadge(
      ctx,
      "hillshade by skalon.com",
      badgePadding,
      badgePadding,
      "left",
      badgeFontSize
    );
    if (scoringController.getScoreComputed()) {
      drawBadge(
        ctx,
        `grade: ${percentageDisplayed}% = ${letterGrade.toLowerCase()}`,
        mapWidth - badgePadding,
        mapHeight - badgePadding - badgeHeight,
        "right",
        badgeFontSize
      );
    }

    // Create blob and download image.
    compositeCanvas.toBlob(
      (blob) => {
        if (!blob) {
          console.error("Failed to create blob from canvas");
          if (shareButton) {
            shareButton.removeAttribute("disabled");
          }
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `hillshade-map-${LOCATION_SPECIFIER}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);

        if (shareButton) {
          shareButton.removeAttribute("disabled");
        }
      },
      "image/png",
      1.0
    );
  } catch (error) {
    console.error("Error exporting map:", error);
    alert("Failed to export map. Please try again.");
    if (shareButton) {
      shareButton.removeAttribute("disabled");
    }
  }
};
