const clickArea = document.getElementById("click-area");
const valueMinPan = document.getElementById("value-min-pan");
const valueMaxPan = document.getElementById("value-max-pan");
const panWidth = document.getElementById("pan-width");
const valueLowPass = document.getElementById("value-low-pass");
const lowPass = document.getElementById("low-pass");
const fileInputLabel = document.getElementById("file-input-label");
const fileInput = document.getElementById("file-input");

// Sound setup:
let filter = new Tone.Filter(1500, "lowpass").toDestination();
let panner = new Tone.Panner(0).connect(filter);
let click = new Tone.Sampler({
  urls: {
    A4: "trackpad.wav",
  },
  baseUrl: "",
}).connect(panner);
const runClick = async (pan, cutoff) => {
  // Tear down:
  panner.disconnect(filter);
  click.disconnect(panner);
  // Set up:
  filter = new Tone.Filter(cutoff, "lowpass").toDestination();
  panner = new Tone.Panner(pan).connect(filter);
  click.connect(panner);
  // Play:
  click.triggerAttackRelease(["A4"], 0.2, Tone.context.currentTime);
};

// Render setup:
const state = {
  panWidth: 0.5,
  lowPass: 10000,
};
const renderState = () => {
  valueMinPan.textContent = (-state.panWidth).toFixed(2);
  valueMaxPan.textContent = state.panWidth.toFixed(2);
  panWidth.value = state.panWidth;
  valueLowPass.textContent = state.lowPass.toFixed(2);
  lowPass.value = state.lowPass;
};
renderState();

// UI listeners:
panWidth.addEventListener("change", (event) => {
  state.panWidth = parseFloat(event.target.value);
  renderState();
});
lowPass.addEventListener("change", (event) => {
  state.lowPass = parseFloat(event.target.value);
  renderState();
});

// Click listener:
clickArea.addEventListener("click", async (event) => {
  const rect = event.target.getBoundingClientRect();
  const xDeviation = (event.clientX - rect.left) / (rect.width / 2) - 1;
  // const yDeviation = (event.clientY - rect.top) / (rect.height / 2) - 1;
  await Tone.start();
  await runClick(xDeviation * state.panWidth, state.lowPass);
});

// File listener:
fileInput.addEventListener("change", (event) => {
  fileInputLabel.textContent = event.target.files[0].name;
  const objectUrl = URL.createObjectURL(event.target.files[0]);
  click = new Tone.Sampler({
    urls: {
      A4: objectUrl,
    },
    baseUrl: "",
  }).connect(panner);
});
