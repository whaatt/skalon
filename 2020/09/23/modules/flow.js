// Consider making parameters configurable for performance.
// Parameters for stream processing.
const RESET_AFTER_FRAMES = 10;

// Parameters for Shi-Tomasi corner detection.
const MAX_CORNERS = 30;
const QUALITY_LEVEL = 0.3;
const MIN_DISTANCE = 7;
const BLOCK_SIZE = 7;

// Parameters for Lucas-Kanade optical flow.
const WINDOW_SIZE = new cv.Size(15, 15);
const MAX_LEVEL = 2;
const CRITERIA = new cv.TermCriteria(
  cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT,
  10,
  0.03
);

// Empty matrix constant.
const NONE = new cv.Mat();

/**
 * A class to manage computation of optical flow and good features to track.
 *
 * Exposes an instantaneous displacement or flow in the X and Y directions.
 */
class Flow {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.lastFrame = new cv.Mat(height, width, cv.CV_8UC1);
    this.framesSeen = 0;

    // Computed flow values.
    this.absoluteAverageFlowX = 0;
    this.absoluteAverageFlowY = 0;

    // Pre-allocated Shi-Tomasi and Lucas-Kanade matrices.
    this.pointsToTrack = new cv.Mat();
    this.pointsAfterFlow = new cv.Mat();
    this.flowStatuses = new cv.Mat();
    this.flowErrors = new cv.Mat();
  }

  destroy() {
    this.lastFrame.delete();
    this.pointsToTrack.delete();
    this.pointsAfterFlow.delete();
    this.flowStatuses.delete();
    this.flowErrors.delete();
  }

  reset() {
    // Swap frames and de-allocate the old one.
    const oldLastFrame = this.lastFrame;
    this.lastFrame = new cv.Mat(height, width, cv.CV_8UC1);
    oldLastFrame.delete();
    this.framesSeen = 0;

    // Reset computed flow values.
    this.absoluteAverageFlowX = 0;
    this.absoluteAverageFlowY = 0;
  }

  step(frame) {
    if (this.framesSeen % RESET_AFTER_FRAMES === 0) {
      this.updatePointsToTrack();
    }
    const nextFrame = new cv.Mat();
    cv.cvtColor(frame, nextFrame, cv.COLOR_RGB2GRAY);
    this.updateFlowValues(nextFrame);

    // Swap frames and de-allocate the old one.
    const oldLastFrame = this.lastFrame;
    this.lastFrame = nextFrame;
    oldLastFrame.delete();
    this.framesSeen += 1;
  }

  getFlowX() {
    return this.absoluteAverageFlowX;
  }

  getFlowY() {
    return this.absoluteAverageFlowY;
  }

  // Private:
  updatePointsToTrack() {
    cv.goodFeaturesToTrack(
      this.lastFrame,
      this.pointsToTrack,
      MAX_CORNERS,
      QUALITY_LEVEL,
      MIN_DISTANCE,
      NONE,
      BLOCK_SIZE
    );
  }

  updateFlowValues(nextFrame) {
    cv.calcOpticalFlowPyrLK(
      this.lastFrame,
      nextFrame,
      this.pointsToTrack,
      this.pointsAfterFlow,
      this.flowStatuses,
      this.flowErrors,
      WINDOW_SIZE,
      MAX_LEVEL,
      CRITERIA
    );

    let totalDifferenceX = 0;
    let totalDifferenceY = 0;
    let validPointsCount = 0;

    // Add up deviations in all of the tracked points (skipping points that
    // could not be evaluated).
    for (let i = 0; i < this.flowStatuses.rows; i += 1) {
      if (this.flowStatuses.data[i] !== 1) {
        continue;
      }

      validPointsCount += 1;
      const lastX = this.pointsToTrack.data32F[i * 2];
      const X = this.pointsAfterFlow.data32F[i * 2];
      totalDifferenceX += X - lastX;

      const lastY = this.pointsToTrack.data32F[i * 2 + 1];
      const Y = this.pointsAfterFlow.data32F[i * 2 + 1];
      totalDifferenceY += Y - lastY;
    }

    // Save absolute value of average deviations.
    this.absoluteAverageFlowX =
      validPointsCount > 0 ? Math.abs(totalDifferenceX / validPointsCount) : 0;
    this.absoluteAverageFlowY =
      validPointsCount > 0 ? Math.abs(totalDifferenceY / validPointsCount) : 0;

    // Normalize by width and height.
    this.absoluteAverageFlowX /= this.width;
    this.absoluteAverageFlowY /= this.height;
  }
}

export { Flow };
