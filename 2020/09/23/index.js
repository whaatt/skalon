// TODO: Use a framework to drastically simplify the data flow and reduce the
// probability of bugs...

import { Flow, FRAMES_PER_SECOND } from "./modules/flow.js";
import { Mapper } from "./modules/mapper.js";
import { Song } from "./modules/song.js";
import { Synth } from "./modules/synth.js";

// Audio elements:
const TOGGLE_AUDIO_BUTTON = document.getElementById("toggle-audio-button");
const CUSTOM_SONG_BUTTON = document.getElementById("custom-song-button");
const CUSTOM_SONG_BUTTON_TEXT = document.getElementById(
  "custom-song-button-text"
);
const CUSTOM_SONG_BUTTON_ERROR_TEXT = document.getElementById(
  "custom-song-button-error-text"
);
const CUSTOM_SONG_DIALOG = document.getElementById("custom-song-dialog");
const SONG_PICKER_SELECT = document.getElementById("song-picker-select");
const ROOT_PICKER_SELECT = document.getElementById("root-picker-select");
const SCALE_PICKER_SELECT = document.getElementById("scale-picker-select");

// Audio constants:
const DEFAULT_VOLUME = 0.1;
const ARTICULATION_SCALE_FACTOR = 0.25;
const START_ACCORDION_AUDIO = "Start Laptop Accordion";
const STOP_ACCORDION_AUDIO = "Stop Laptop Accordion";
const SELECT_CUSTOM_MIDI_FILE_ERROR = "[read error]";
const SELECT_CUSTOM_MIDI_FILE_LOADED = "Loaded MIDI:";
const SONG_OPTION_FREE_PLAY = "Free Play";
const SONG_OPTION_CUSTOM_MIDI = "Custom MIDI";
const SONG_OPTION_CUSTOM_MIDI_ID = "song-option-custom-midi";

// General audio state:
let audioManagingVideo = true;
let audioRunning = false;
let synth = null;

// Maps key values to notes triggered by the given keys. If a key is not present
// in this map, it is not pressed.
let keysDownNotes = {};

// Note-related state:
const mapper = new Mapper();
let currentSongNotes = null;
let currentSongPosition = 0;
let customSongNotes = null;

// Video elements.
const TOGGLE_VIDEO_BUTTON = document.getElementById("toggle-video-button");
const VIDEO_INPUT = document.getElementById("video-input");

// Video constants.
const START_ACCORDION_VIDEO = "Start Webcam Motion Tracking";
const STOP_ACCORDION_VIDEO = "Stop Webcam Motion Tracking";

// General video state:
let videoRunning = false;
let shouldStopVideo = false;

/**
 * Returns a `Promise` that resolves after `time` milliseconds.
 */
const sleep = (time) =>
  new Promise((resolve) => setTimeout(() => resolve(undefined), time));

/**
 * Helper to change the UI to free play mode.
 */
const setFreePlayMode = () => {
  currentSongNotes = null;
  currentSongPosition = 0;

  SONG_PICKER_SELECT.value = SONG_OPTION_FREE_PLAY;
  ROOT_PICKER_SELECT.disabled = false;
  SCALE_PICKER_SELECT.disabled = false;
};

/**
 * Handles key-down events for the accordion.
 */
const keyDownListener = (event) => {
  // Ignore keys we don't care about.
  if (
    !Mapper.getKeys().has(event.key) &&
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight"
  ) {
    return;
  }

  // Debounce repeated presses.
  if (
    keysDownNotes[event.key] !== undefined &&
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight"
  ) {
    return;
  }

  // Allow quick scrubbing with left and right arrow keys by stopping notes when
  // the key is held for repeated presses.
  if (
    (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
    keysDownNotes[event.key] !== undefined &&
    synth !== null
  ) {
    for (const note of keysDownNotes[event.key]) {
      synth.stopNote(note);
    }
  }

  // Associate this key press to any notes played.
  keysDownNotes[event.key] = [];

  // Light up visual keyboard.
  const keyElement = document.querySelector(
    '.key[data-key="' + event.key + '"]'
  );
  if (keyElement !== null) {
    keyElement.style["background-color"] = keyElement.style["border-color"];
    keyElement.style.color = "transparent";
  }

  // Make sure the synth is running before we try to play notes.
  if (synth === null || !audioRunning) {
    return;
  }

  if (currentSongNotes === null) {
    // Free play mode:
    if (!Mapper.getKeys().has(event.key)) {
      return;
    }
    const note = mapper.getMidiNote(event.key);
    keysDownNotes[event.key].push(note);
    synth.playNote(note);
  } else {
    // Song mode:
    // Turn on all notes at the current song position.
    for (const note of currentSongNotes[currentSongPosition]) {
      keysDownNotes[event.key].push(note);
      synth.playNote(note);
    }

    // Advance song unless we are scrubbing backwards.
    if (event.key === "ArrowLeft") {
      if (currentSongPosition > 0) {
        currentSongPosition -= 1;
      }
    } else {
      currentSongPosition += 1;
    }

    // When a song is finished, return to free play mode.
    if (currentSongPosition >= currentSongNotes.length) {
      setFreePlayMode();
    }
  }
};

/**
 * Handles key-up events for the accordion.
 */
const keyUpListener = (event) => {
  // Remember the notes played for this key and then reset the key state.
  const notesToRemove = keysDownNotes[event.key] || [];
  if (keysDownNotes[event.key] !== undefined) {
    delete keysDownNotes[event.key];
  }

  // Turn off visual keyboard lighting.
  const keyElement = document.querySelector(
    '.key[data-key="' + event.key + '"]'
  );
  if (keyElement !== null) {
    keyElement.style["background-color"] = "transparent";
    keyElement.style.color = "#eee";
  }

  // Make sure the synth is running before we try to stop notes.
  if (synth === null) {
    return;
  }

  // Turn off all notes associated with this key.
  for (const note of notesToRemove) {
    synth.stopNote(note);
  }
};

/**
 * Sets up accordion audio.
 */
const startAudio = async () => {
  // Set up audio button.
  TOGGLE_AUDIO_BUTTON.blur();
  TOGGLE_AUDIO_BUTTON.innerHTML = STOP_ACCORDION_AUDIO;
  TOGGLE_AUDIO_BUTTON.classList.add("running");

  // Set up audio state.
  audioRunning = true;
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  // Try to start video.
  if (audioManagingVideo) {
    // Force a redraw of the audio button before starting video.
    await sleep(50);
    startVideo();
  } else {
    // Normally this is handled within `startVideo` (in the managed setting).
    TOGGLE_VIDEO_BUTTON.disabled = false;
  }
};

/**
 * Tears down accordion audio.
 */
const stopAudio = async () => {
  // Reset audio button.
  TOGGLE_AUDIO_BUTTON.blur();
  TOGGLE_AUDIO_BUTTON.innerHTML = START_ACCORDION_AUDIO;
  TOGGLE_AUDIO_BUTTON.classList.remove("running");

  // Reset audio state.
  audioRunning = false;
  synth.clearNotes();
  keysDownNotes = {};
  currentSongPosition = 0;

  // Try to stop video.
  if (audioManagingVideo && videoRunning) {
    // Force a redraw of the audio button before stopping video.
    await sleep(50);
    stopVideo(true);
  } else {
    // Normally this is handled within `stopVideo` if video is running (since
    // the button is disabled as soon as the stop is requested).
    TOGGLE_VIDEO_BUTTON.disabled = true;
  }
};

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

      // Reset video button.
      TOGGLE_VIDEO_BUTTON.innerHTML = START_ACCORDION_VIDEO;
      TOGGLE_VIDEO_BUTTON.classList.remove("running");
      TOGGLE_VIDEO_BUTTON.disabled = !audioRunning;

      // Reset video state.
      shouldStopVideo = false;
      videoRunning = false;
      return;
    }

    let begin = Date.now();
    videoCapture.read(frameBuffer);

    // Update and retrieve new articulation value.
    flow.step(frameBuffer, Date.now());
    if (synth !== null) {
      // Set accordion volume based on articulation.
      const articulation = flow.getArticulation();
      synth.setVolume(articulation * ARTICULATION_SCALE_FACTOR);
    }

    // Ensure that we grab frames no faster than 60 FPS.
    const delay = 1000 / FRAMES_PER_SECOND - (Date.now() - begin);
    setTimeout(processFrame, delay);
  };

  setTimeout(processFrame, 0);
};

/**
 * Sets up video capture.
 */
const startVideo = async () => {
  TOGGLE_VIDEO_BUTTON.blur();
  // Disable toggle until success or failure.
  TOGGLE_VIDEO_BUTTON.disabled = true;
  // Force a redraw so the button is disabled before we attempt to start video.
  await sleep(50);

  // Prompt for webcam input.
  // These calls to `setTimeout` force the DOM to
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

      // Set up video button.
      TOGGLE_VIDEO_BUTTON.classList.add("running");
      TOGGLE_VIDEO_BUTTON.innerHTML = STOP_ACCORDION_VIDEO;
      TOGGLE_VIDEO_BUTTON.disabled = false;

      // Set up video state.
      audioManagingVideo = true;
      videoRunning = true;
    })
    .catch((error) => {
      console.log("Not starting video due to error");
      console.error(error);
      audioManagingVideo = false;
      TOGGLE_VIDEO_BUTTON.disabled = false;
    });
};

/**
 * Tears down video capture.
 *
 * The `isManagedCall` parameter specifies whether or not the call to
 * `stopVideo` was actually triggered by the audio button.
 */
const stopVideo = (isManagedCall) => {
  TOGGLE_VIDEO_BUTTON.blur();
  // Disable toggle until completion.
  TOGGLE_VIDEO_BUTTON.disabled = true;
  // Manual click on `stopVideo` (audio should no longer manage video).
  if (!isManagedCall) {
    audioManagingVideo = false;
  }
  shouldStopVideo = true;
  synth.setVolume(DEFAULT_VOLUME);
};

/**
 * Handles loading custom songs from disk.
 */
const selectCustomSongFile = async (event) => {
  const files = event.target.files;
  if (files.length > 0) {
    const file = files[0];
    try {
      customSongNotes = await Song.getNotesForLocalFile(file);
    } catch (error) {
      // Could not parse file.
      console.error(error);
      // Add the error suffix to the button if it's not already there.
      if (
        CUSTOM_SONG_BUTTON_ERROR_TEXT.innerHTML.indexOf(
          SELECT_CUSTOM_MIDI_FILE_ERROR
        ) === -1
      ) {
        CUSTOM_SONG_BUTTON_ERROR_TEXT.innerHTML += SELECT_CUSTOM_MIDI_FILE_ERROR;
      }
      return;
    }

    // Parsed file; set file text to current song.
    CUSTOM_SONG_BUTTON_TEXT.innerHTML =
      SELECT_CUSTOM_MIDI_FILE_LOADED +
      " " +
      file.name.split(".").slice(0, -1).join(".");
    CUSTOM_SONG_BUTTON_ERROR_TEXT.innerHTML = "";
    SONG_PICKER_SELECT.value = SONG_OPTION_CUSTOM_MIDI;
    currentSongNotes = customSongNotes;
    currentSongPosition = 0;
  }
};

/**
 * Handles song selection events.
 */
const selectSong = async (event) => {
  SONG_PICKER_SELECT.blur();
  if (event.target.value === SONG_OPTION_FREE_PLAY) {
    setFreePlayMode();
  } else if (event.target.value === SONG_OPTION_CUSTOM_MIDI) {
    if (customSongNotes === null) {
      // No custom MIDI loaded; switch back to free play.
      setFreePlayMode();
      return;
    }

    currentSongNotes = customSongNotes;
    currentSongPosition = 0;
    ROOT_PICKER_SELECT.disabled = true;
    SCALE_PICKER_SELECT.disabled = true;
  } else {
    currentSongNotes = await Song.getNotesForPreset(event.target.value);
    currentSongPosition = 0;
    ROOT_PICKER_SELECT.disabled = true;
    SCALE_PICKER_SELECT.disabled = true;
  }
};

/*
 * Main Code
 */

// Style keyboard border colors.
const keyElements = document.getElementsByClassName("key");
for (let i = 0; i < keyElements.length; i++) {
  keyElements[i].style["border-color"] =
    "hsl(" + ((300 + 6 * i) % 360) + ", 54%, 55%)";
}

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
  () => (videoRunning ? stopVideo(false) : startVideo()),
  false
);

// Set up custom song picker button.
CUSTOM_SONG_BUTTON.addEventListener("click", () => CUSTOM_SONG_DIALOG.click());

// Set up custom song dialog.
CUSTOM_SONG_DIALOG.addEventListener("change", selectCustomSongFile);

// Set up song picker.
SONG_PICKER_SELECT.innerHTML = "";
const songOptions = [SONG_OPTION_FREE_PLAY, SONG_OPTION_CUSTOM_MIDI].concat(
  Song.getPresets()
);
for (const songOption of songOptions) {
  const option = document.createElement("option");
  if (songOption === SONG_OPTION_CUSTOM_MIDI) {
    option.id = SONG_OPTION_CUSTOM_MIDI_ID;
  }
  option.value = songOption;
  option.innerHTML = songOption;
  SONG_PICKER_SELECT.appendChild(option);
}
document.getElementById(SONG_OPTION_CUSTOM_MIDI_ID).style.display = "none";
SONG_PICKER_SELECT.addEventListener("change", selectSong);

// Set up root picker.
ROOT_PICKER_SELECT.innerHTML = "";
for (const root of Mapper.getRoots()) {
  const option = document.createElement("option");
  option.value = root;
  option.innerHTML = root;
  ROOT_PICKER_SELECT.appendChild(option);
}
ROOT_PICKER_SELECT.addEventListener("change", (event) => {
  ROOT_PICKER_SELECT.blur();
  mapper.setRoot(event.target.value);
});

// Set up scale picker.
SCALE_PICKER_SELECT.innerHTML = "";
for (const scale of Mapper.getScales()) {
  const option = document.createElement("option");
  option.value = scale;
  option.innerHTML = scale;
  SCALE_PICKER_SELECT.appendChild(option);
}
SCALE_PICKER_SELECT.addEventListener("change", (event) => {
  SCALE_PICKER_SELECT.blur();
  mapper.setScale(event.target.value);
});

// Set up key listeners.
document.addEventListener("keydown", keyDownListener);
document.addEventListener("keyup", keyUpListener);

// Set up fake key presses for keyboard (useful on mobile).
document.querySelectorAll(".key").forEach((keyElement) => {
  const key = keyElement.getAttribute("data-key");
  keyElement.addEventListener("touchstart", (event) => {
    event.preventDefault();
    document.dispatchEvent(new KeyboardEvent("keydown", { key }));
  });
  keyElement.addEventListener("mousedown", (event) => {
    event.preventDefault();
    document.dispatchEvent(new KeyboardEvent("keydown", { key }));
  });
  keyElement.addEventListener("touchend", (event) => {
    event.preventDefault();
    document.dispatchEvent(new KeyboardEvent("keyup", { key }));
  });
  keyElement.addEventListener("mouseup", (event) => {
    event.preventDefault();
    document.dispatchEvent(new KeyboardEvent("keyup", { key }));
  });
  keyElement.addEventListener("mouseleave", () =>
    document.dispatchEvent(new KeyboardEvent("keyup", { key }))
  );
});
