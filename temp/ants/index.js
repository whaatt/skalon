const valueCollisions = document.getElementById("value-collisions");
const antsArea = document.getElementById("ants-area");
const valueLeftAnts = document.getElementById("value-left-ants");
const sliderLeftAnts = document.getElementById("slider-left-ants");
const valueRightAnts = document.getElementById("value-right-ants");
const sliderRightAnts = document.getElementById("slider-right-ants");

const CANVAS_WIDTH = antsArea.width;
const CANVAS_HEIGHT = antsArea.height;
const ANT_WIDTH = 12;
const ANT_HEIGHT = 6;
const ANT_BUFFER = 48;
const PIXELS_PER_TICK = 1;
const TIME_PER_TICK = 8;

// State:
const state = {
  leftAnts: 5,
  rightAnts: 8,
  speed: 15,
};

// Helpers:
const isAntOnScreen = (ant) => {
  const [x] = ant;
  if (x >= 0 && x <= CANVAS_WIDTH) {
    return true;
  }
  if (x + ANT_WIDTH >= 0 && x + ANT_WIDTH <= CANVAS_WIDTH) {
    return true;
  }
  return false;
};

// Animation:
let currentInstance = 0;
const runAnimation = () => {
  let ctx = antsArea.getContext("2d");
  currentInstance += 1;

  // Ant state setup:
  const ants = [];
  // Weird transformation....
  const leftAnts = state.leftAnts;
  const rightAnts = state.rightAnts;
  for (let i = 0; i < leftAnts; i += 1) {
    // Vector is [X, Y, dX / dt, color].
    // Speeds in pixels per tick.
    ants.push([
      -(ANT_WIDTH + ANT_BUFFER) * i - ANT_WIDTH,
      CANVAS_HEIGHT / 2 - ANT_HEIGHT / 2,
      PIXELS_PER_TICK,
      "blue",
    ]);
  }
  for (let i = 0; i < rightAnts; i += 1) {
    ants.push([
      CANVAS_WIDTH + (ANT_WIDTH + ANT_BUFFER) * i,
      CANVAS_HEIGHT / 2 - ANT_HEIGHT / 2,
      -PIXELS_PER_TICK,
      "green",
    ]);
  }

  // Animation loop:
  let collisions = 0;
  let lastTime = null;
  const thisInstance = currentInstance;
  const renderFrame = (time) => {
    if (thisInstance !== currentInstance) {
      return;
    }

    // Compute elapsed ticks.
    let elapsedTicks = 1;
    if (lastTime === null) {
      lastTime = time;
    } else {
      elapsedTicks = Math.round((time - lastTime) / TIME_PER_TICK);
      lastTime = time;
    }

    // Clear canvas.
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Run mutations per elapsed tick.
    for (let tick = 0; tick < elapsedTicks; tick += 1) {
      // Process all collisions per elapsed tick.
      for (let i = 0; i < ants.length; i += 1) {
        for (let j = i + 1; j < ants.length; j += 1) {
          const [ant, otherAnt] = [ants[i], ants[j]];
          const left = ant[0] < otherAnt[0] ? ant : otherAnt;
          const right = left === ant ? otherAnt : ant;
          // Discard off-screen collisions.
          if (!isAntOnScreen(left) || !isAntOnScreen(right)) {
            continue;
          }
          // Discard same-direction ants.
          if (left[2] >= 0 && right[2] >= 0) {
            continue;
          }
          // Discard same-direction ants.
          if (left[2] < 0 && right[2] < 0) {
            continue;
          }
          if (right[0] <= left[0] + ANT_WIDTH) {
            left[2] *= -1;
            right[2] *= -1;
            collisions += 1;
          }
        }
      }
      // Compute new positions per elapsed tick.
      for (const ant of ants) {
        ant[0] += ant[2];
      }
    }

    // Render ants after processing all elapsed ticks.
    valueCollisions.textContent = collisions.toString();
    let gotOnScreen = false;
    for (const ant of ants) {
      const [x, y, _, color] = ant;
      gotOnScreen ||= isAntOnScreen(ant);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, ANT_WIDTH, ANT_HEIGHT);
    }

    // Still have ants on screen; continue.
    if (gotOnScreen) {
      requestAnimationFrame(renderFrame);
    }
  };

  // Kick off animation loop.
  requestAnimationFrame(renderFrame);
};

// Render setup:
const renderState = () => {
  valueLeftAnts.textContent = state.leftAnts.toString();
  sliderLeftAnts.value = state.leftAnts;
  valueRightAnts.textContent = state.rightAnts.toString();
  sliderRightAnts.value = state.rightAnts;
  runAnimation();
};
renderState();

// UI listeners:
sliderLeftAnts.addEventListener("change", (event) => {
  state.leftAnts = parseInt(event.target.value);
  renderState();
});
sliderRightAnts.addEventListener("change", (event) => {
  state.rightAnts = parseInt(event.target.value);
  renderState();
});
