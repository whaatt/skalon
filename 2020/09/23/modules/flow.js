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

// Articulation parameters.
const FRAMES_PER_SECOND = 60;
const HALF_LIFE_SAMPLES_ACCELERATION = FRAMES_PER_SECOND / 10;
const SIGMOID_SCALING_FACTOR = 0.25;

// Empty matrix constant.
const NONE = new cv.Mat();

/**
 * A class to manage computation of optical flow and good features to track.
 *
 * Exposes interesting values derived from instantaneous displacement vectors.
 */
class Flow {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.lastFrame = null;
    this.lastFrameTime = -1;
    this.framesSeen = 0;

    // Computed flow values.
    this.absoluteAverageFlowX = 0;
    this.absoluteAverageFlowY = 0;

    // Derived values (involving a smoothing constant).
    this.accelerationY = 0;
    this.articulation = 0;

    // Pre-allocated Shi-Tomasi and Lucas-Kanade matrices.
    this.pointsToTrack = new cv.Mat();
    this.pointsAfterFlow = new cv.Mat();
    this.flowStatuses = new cv.Mat();
    this.flowErrors = new cv.Mat();
  }

  destroy() {
    if (this.lastFrame !== null) {
      this.lastFrame.delete();
    }
    this.pointsToTrack.delete();
    this.pointsAfterFlow.delete();
    this.flowStatuses.delete();
    this.flowErrors.delete();
  }

  step(frame, frameTime) {
    // Update points to track every `RESET_AFTER_FRAMES` frames or immediately
    // if we have no points to track.
    if (
      (this.framesSeen % RESET_AFTER_FRAMES === 0 ||
        this.pointsToTrack.rows === 0) &&
      this.lastFrame !== null
    ) {
      this.updatePointsToTrack();
    }
    const nextFrame = new cv.Mat();
    cv.cvtColor(frame, nextFrame, cv.COLOR_RGB2GRAY);
    if (this.pointsToTrack.rows > 0 && this.lastFrame !== null) {
      this.updateFlowValues(nextFrame, frameTime);
    }

    // Swap frames and de-allocate the old one.
    const oldLastFrame = this.lastFrame;
    this.lastFrame = nextFrame;
    this.lastFrameTime = frameTime;
    if (oldLastFrame !== null) {
      oldLastFrame.delete();
    }
    this.framesSeen += 1;
  }

  getArticulation() {
    return this.articulation;
  }

  /*
   * Private Methods
   */

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

  updateFlowValues(nextFrame, nextFrameTime) {
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

    // Compute absolute value of average deviations.
    let nextAbsoluteAverageFlowX =
      validPointsCount > 0 ? Math.abs(totalDifferenceX / validPointsCount) : 0;
    let nextAbsoluteAverageFlowY =
      validPointsCount > 0 ? Math.abs(totalDifferenceY / validPointsCount) : 0;

    // Normalize by width and height.
    nextAbsoluteAverageFlowX /= this.width;
    nextAbsoluteAverageFlowY /= this.height;

    // Compute derived values.
    this.updateDerivedValues(nextAbsoluteAverageFlowY, nextFrameTime);

    // Save new flow values.
    this.absoluteAverageFlowX = nextAbsoluteAverageFlowX;
    this.absoluteAverageFlowY = nextAbsoluteAverageFlowY;
  }

  updateDerivedValues(nextAbsoluteAverageFlowY, nextFrameTime) {
    const deltaSeconds = (nextFrameTime - this.lastFrameTime) / 1000;

    // Compute new smoothed acceleration.
    const accelerationYInstant = Math.abs(
      (nextAbsoluteAverageFlowY - this.absoluteAverageFlowY) / deltaSeconds
    );
    const alphaAcceleration =
      1 - Math.exp(Math.log(0.5) / HALF_LIFE_SAMPLES_ACCELERATION);
    const newAccelerationY =
      alphaAcceleration * accelerationYInstant +
      (1 - alphaAcceleration) * this.accelerationY;
    this.accelerationY = newAccelerationY;

    // Compute the new articulation value, which represents the channel volume
    // of the accordion instrument. We take the unbounded positive acceleration
    // value and squash to [0, 1] using a modified sigmoid function.
    const sigmoidSquashed = (1 / (1 + Math.exp(-this.accelerationY))) * 2 - 1;
    // Scale the sigmoid since a maximum gain of 1.0 is aggro.
    this.articulation = sigmoidSquashed * SIGMOID_SCALING_FACTOR;
  }
}

export { Flow, FRAMES_PER_SECOND };
