import { Flow, FRAMES_PER_SECOND } from "./modules/flow.js";
import { Mapper } from "./modules/mapper.js";
import { Synth } from "./modules/synth.js";

// Global audio constants:
const DEFAULT_VOLUME = 0.1;
const TOGGLE_AUDIO_BUTTON = document.getElementById("toggle-audio");
const SONG_PICKER_SELECT = document.getElementById("song-picker");
const ROOT_PICKER_SELECT = document.getElementById("root-picker");
const SCALE_PICKER_SELECT = document.getElementById("scale-picker");
const START_ACCORDION_AUDIO = "Start Laptop Accordion";
const STOP_ACCORDION_AUDIO = "Stop Laptop Accordion";

// Global audio state:
let startedOnce = false;
let audioRunning = false;
let synth = null;
let keysDown = {};
const mapper = new Mapper();

/**
 * Accordion key-down listener.
 */
const keyDownListener = (event) => {
  if (keysDown[event.key]) {
    return;
  }
  keysDown[event.key] = true;
  const keyElement = document.querySelector(
    '.key[data-key="' + event.key + '"]'
  );
  if (keyElement !== null) {
    keyElement.style["background-color"] = keyElement.style["border-color"];
    keyElement.style.color = "transparent";
  }
  // TODO: Implement song mode.
  if (synth === null || !audioRunning || !Mapper.getKeys().has(event.key)) {
    return;
  }
  synth.playNote(mapper.getMidiNote(event.key));
};

/**
 * Accordion key-up listener.
 */
const keyUpListener = (event) => {
  keysDown[event.key] = false;
  const keyElement = document.querySelector(
    '.key[data-key="' + event.key + '"]'
  );
  if (keyElement !== null) {
    keyElement.style["background-color"] = "transparent";
    keyElement.style.color = "#eee";
  }
  if (synth === null || !audioRunning || !Mapper.getKeys().has(event.key)) {
    return;
  }
  synth.stopNote(mapper.getMidiNote(event.key));
};

/**
 * Sets up accordion audio.
 */
const startAudio = () => {
  audioRunning = true;
  TOGGLE_AUDIO_BUTTON.innerHTML = STOP_ACCORDION_AUDIO;
  if (!startedOnce) {
    startVideo();
    startedOnce = true;
  }
};

/**
 * Tears down accordion audio.
 */
const stopAudio = () => {
  audioRunning = false;
  synth.clearNotes();
  keysDown = {};
  TOGGLE_AUDIO_BUTTON.innerHTML = START_ACCORDION_AUDIO;
};

// Global video constants.
const TOGGLE_VIDEO_BUTTON = document.getElementById("toggle-video");
const VIDEO_INPUT = document.getElementById("video-input");
const START_ACCORDION_VIDEO = "Start Webcam Dynamics Control";
const STOP_ACCORDION_VIDEO = "Stop Webcam Dynamics Control";

// Global video state:
let videoRunning = false;
let shouldStopVideo = false;

/**
 * Runs the main video capture loop.
 */
const runCaptureLoop = (width, height) => {
  const frameBuffer = new cv.Mat(height, width, cv.CV_8UC4);
  const videoCapture = new cv.VideoCapture(VIDEO_INPUT);
  const flow = new Flow(width, height);

  const processFrame = () => {
    if (shouldStopVideo) {
      // Pause video element and stop video capture.
      VIDEO_INPUT.pause();
      VIDEO_INPUT.srcObject.getVideoTracks().forEach((track) => track.stop());

      // Destroy flow calculator to avoid memory leakage.
      flow.destroy();

      // Set new video state.
      TOGGLE_VIDEO_BUTTON.innerHTML = START_ACCORDION_VIDEO;
      TOGGLE_VIDEO_BUTTON.disabled = false;
      shouldStopVideo = false;
      videoRunning = false;
      return;
    }

    let begin = Date.now();
    videoCapture.read(frameBuffer);

    // Update and retrieve new articulation value.
    flow.step(frameBuffer, Date.now());
    if (synth !== null) {
      synth.setVolume(flow.getArticulation());
    }

    const delay = 1000 / FRAMES_PER_SECOND - (Date.now() - begin);
    setTimeout(processFrame, delay);
  };

  setTimeout(processFrame, 0);
};

/**
 * Sets up video capture.
 */
const startVideo = () => {
  // Disable toggle until success or failure.
  TOGGLE_VIDEO_BUTTON.disabled = true;

  // Prompt for webcam input.
  navigator.mediaDevices
    .getUserMedia({ video: true, audio: false })
    .then((stream) => {
      VIDEO_INPUT.srcObject = stream;
      VIDEO_INPUT.play();

      // Set dimensions of `video` element based on input resolution.
      const width = stream.getVideoTracks()[0].getSettings().width;
      const height = stream.getVideoTracks()[0].getSettings().height;
      console.log("Input Resolution:", width, height);
      VIDEO_INPUT.width = width;
      VIDEO_INPUT.height = height;

      // Run the capture loop.
      runCaptureLoop(width, height);

      // Set new video state.
      TOGGLE_VIDEO_BUTTON.innerHTML = STOP_ACCORDION_VIDEO;
      TOGGLE_VIDEO_BUTTON.disabled = false;
      videoRunning = true;
    })
    .catch((error) => {
      console.log("Not starting video due to error");
      console.error(error);
      TOGGLE_VIDEO_BUTTON.disabled = false;
    });
};

/**
 * Tears down video capture.
 */
const stopVideo = () => {
  // Disable toggle until completion.
  TOGGLE_VIDEO_BUTTON.disabled = true;
  shouldStopVideo = true;
  synth.setVolume(DEFAULT_VOLUME);
};

// Set up `AudioContext`.
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioContextClass();
audioContext.onstatechange = () => console.log("Resuming audio context");

// Set up SoundFont-based synthesizer.
const fontPlayer = new WebAudioFontPlayer();
fontPlayer.loader.startLoad(
  audioContext,
  "https://surikov.github.io/webaudiofontdata/sound/0210_FluidR3_GM_sf2_file.js",
  "_tone_0210_FluidR3_GM_sf2_file" // FluidR3 accordion sound.
);
fontPlayer.loader.waitLoad(() => {
  console.log("Loaded SoundFont for accordion");
  synth = new Synth(audioContext, fontPlayer, _tone_0210_FluidR3_GM_sf2_file);
  synth.setVolume(DEFAULT_VOLUME);
});

// Set up key listeners.
document.addEventListener("keydown", keyDownListener);
document.addEventListener("keyup", keyUpListener);

// Set up listener on audio toggle button.
TOGGLE_AUDIO_BUTTON.innerHTML = START_ACCORDION_AUDIO;
TOGGLE_AUDIO_BUTTON.addEventListener(
  "click",
  () => (audioRunning ? stopAudio() : startAudio()),
  false
);

// Set up listener on video toggle button.
TOGGLE_VIDEO_BUTTON.innerHTML = START_ACCORDION_VIDEO;
TOGGLE_VIDEO_BUTTON.addEventListener(
  "click",
  () => (videoRunning ? stopVideo() : startVideo()),
  false
);

// Re-style keyboard opacities.
const keyElements = document.getElementsByClassName("key");
console.log(keyElements);
for (let i = 0; i < keyElements.length; i++) {
  keyElements[i].style["border-color"] =
    "hsl(" + ((300 + 6 * i) % 360) + ", 54%, 55%)";
}

// Set up inputs and input listeners.
ROOT_PICKER_SELECT.innerHTML = "";
for (const root of Mapper.getRoots()) {
  const option = document.createElement("option");
  option.value = root;
  option.innerHTML = root;
  ROOT_PICKER_SELECT.appendChild(option);
}

SCALE_PICKER_SELECT.innerHTML = "";
for (const scale of Mapper.getScales()) {
  const option = document.createElement("option");
  option.value = scale;
  option.innerHTML = scale;
  SCALE_PICKER_SELECT.appendChild(option);
}
