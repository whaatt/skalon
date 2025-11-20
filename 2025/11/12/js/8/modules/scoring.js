/** @typedef {import("./manager.js").TerrainManager} TerrainManager */

import {
  computeAccuracyPercentage,
  computeDemSimilarity,
  getLetterGrade,
} from "./helpers.js";

/**
 * Terrain scoring controller for computing and displaying terrain accuracy.
 */
export class ScoringController {
  /**
   * @param {TerrainManager} terrainManager - Terrain manager instance
   * @param {Float32Array} referenceDem - Reference DEM data
   * @param {number} width - DEM width
   * @param {number} height - DEM height
   * @param {number} noDataValue - No-data value
   * @param {HTMLElement | null} scoreButton - Score button element
   */
  constructor(
    terrainManager,
    referenceDem,
    width,
    height,
    noDataValue,
    scoreButton = null
  ) {
    this.terrainManager = terrainManager;
    this.referenceDem = referenceDem;
    this.width = width;
    this.height = height;
    this.noDataValue = noDataValue;
    this.scoreButton = scoreButton;
    this.isScoreComputed = false;
    this.setUpScoreButton();
  }

  getScoreComputed() {
    return this.isScoreComputed;
  }

  /**
   * Resets the score button to its initial state.
   */
  resetScoreButton() {
    if (!this.scoreButton) {
      console.error("ScoringController: Score button not available");
      return;
    }

    this.isScoreComputed = false;
    this.scoreButton.textContent = "Grade My Terrain Accuracy";
    this.scoreButton.removeAttribute("disabled");
  }

  /**
   * Computes and displays terrain accuracy score.
   */
  computeTerrainAccuracy() {
    if (!this.scoreButton || this.isScoreComputed) {
      return;
    }

    const currentDem = this.terrainManager.getCurrentDem();
    if (!currentDem) {
      console.error("ScoringController: DEM data not available");
      return;
    }

    const score = computeDemSimilarity(
      currentDem,
      this.referenceDem,
      this.noDataValue
    );
    const accuracyPercentage = computeAccuracyPercentage(score);
    const percentageDisplayed = accuracyPercentage.toFixed(2);
    const letterGrade = getLetterGrade(accuracyPercentage);

    this.scoreButton.innerHTML = `Grade:&nbsp;<span>${percentageDisplayed}% = ${letterGrade}</span>`;
    this.scoreButton.setAttribute("disabled", "");
    this.isScoreComputed = true;
  }

  /**
   * Sets up the score button event listener.
   */
  setUpScoreButton() {
    if (!this.scoreButton) {
      console.error("ScoringController: Score button not available");
      return;
    }

    this.scoreButton.addEventListener("click", () => {
      if (!this.isScoreComputed) {
        this.computeTerrainAccuracy();
      }
    });
  }
}
