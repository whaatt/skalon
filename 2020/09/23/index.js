import { Synth } from "./modules/synth.js";

// Set up `AudioContext`.
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioContextClass();
audioContext.onstatechange = () => console.log("Resuming audio context");

// Set up SoundFont-based synthesizer.
let synth = null;
const fontPlayer = new WebAudioFontPlayer();
fontPlayer.loader.startLoad(
  audioContext,
  "https://surikov.github.io/webaudiofontdata/sound/0210_FluidR3_GM_sf2_file.js",
  "_tone_0210_FluidR3_GM_sf2_file" // FluidR3 accordion sound.
);
fontPlayer.loader.waitLoad(() => {
  console.log("Loaded SoundFont for accordion");
  synth = new Synth(audioContext, fontPlayer, _tone_0210_FluidR3_GM_sf2_file);
});

// Bind key presses to synth notes when the Start Audio button is clicked.
document.getElementById("start-audio").addEventListener(
  "click",
  () => {
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
    document.addEventListener("keydown", (event) => {
      if (synth === null) {
        return;
      }
      synth.playNote(event.key.charCodeAt() - 52);
    });
    document.addEventListener("keyup", (event) => {
      if (synth === null) {
        return;
      }
      synth.stopNote(event.key.charCodeAt() - 52);
    });
  },
  false
);

const FPS = 60;
const VIDEO_INPUT = document.getElementById("video-input");

// /**
//  * Main video capture loop.
//  */
// const runCapture = (width, height) => {
//   const frameBuffer = new cv.Mat(height, width, cv.CV_8UC4);
//   const videoCapture = new cv.VideoCapture(VIDEO_INPUT);
//   const flow = new Flow(width, height);

//   const processFrame = () => {
//     let begin = Date.now();
//     videoCapture.read(frameBuffer);

//     flow.step(frameBuffer);
//     if (flow.getSpeedY() > 1) {
//       console.log(flow.getSpeedX(), flow.getSpeedY());
//     }

//     const delay = 1000 / FPS - (Date.now() - begin);
//     setTimeout(processFrame, delay);
//   };

//   setTimeout(processFrame, 0);
// };

// // Prompt for webcam input.
// navigator.mediaDevices
//   .getUserMedia({ video: true, audio: false })
//   .then((stream) => {
//     VIDEO_INPUT.srcObject = stream;
//     VIDEO_INPUT.play();

//     // Set dimensions of `video` element based on input resolution.
//     const width = stream.getVideoTracks()[0].getSettings().width;
//     const height = stream.getVideoTracks()[0].getSettings().height;
//     console.log("Input Resolution:", width, height);
//     VIDEO_INPUT.width = width;
//     VIDEO_INPUT.height = height;

//     // Start the capture loop.
//     runCapture(width, height);
//   })
//   // TODO: Handle this case intelligently.
//   .catch((error) => console.error(error));
