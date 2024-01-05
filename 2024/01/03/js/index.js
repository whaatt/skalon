import { AsciiCanvas } from "./modules/canvas.js";

const CANVAS_ELEMENT = "canvas";
const COLOR_PICKER_ELEMENT = "color-picker";
const LETTER_PICKER_ELEMENT = "letter-picker";

const Modes = /** @type {const} */ ({
  SelectHtml: "SelectHtml",
  SelectRaw: "SelectRaw",
  Draw: "Draw",
});
/** @type {Modes[keyof Modes]} */
const currentMode = Modes.Draw;

const canvasElement = /** @type {HTMLPreElement} */ (
  document.getElementById(CANVAS_ELEMENT)
);
let activeCharacter = /** @type {HTMLInputElement} */ (
  document.getElementById(LETTER_PICKER_ELEMENT)
).value;
let activeColor = /** @type {HTMLInputElement} */ (
  document.getElementById(COLOR_PICKER_ELEMENT)
).value;

window.onload = () => {
  const canvas = new AsciiCanvas(canvasElement);
  Coloris({
    alpha: false,
  });
  document
    .getElementById(LETTER_PICKER_ELEMENT)
    .addEventListener("click", (event) =>
      /** @type {HTMLInputElement} */ (event.target).select()
    );
  document
    .getElementById(LETTER_PICKER_ELEMENT)
    .addEventListener("keyup", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      activeCharacter = target.value;
      target.select();
    });
  document
    .getElementById(COLOR_PICKER_ELEMENT)
    .addEventListener("change", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      activeColor = target.value;
    });
};

// TODO:
// 1. Implement mode-select
// 2. Implement click/touch-and-drag callbacks (press, enter, and release)
// 3. Implement draw mode
// 4. Implement erase mode (draw mode with space character)
// 5. Implement select mode (HTML with standardized output)
// 6. Implement select mode (raw text)
// 7. Implement undo/redo stack as un-flush operation
