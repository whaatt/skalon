import {
  CLASS_AURAFONT_CARD_FLIPPED,
  CLASS_AURAFONT_CONTROLS_BUTTON_ACTIVE,
  CLASS_AURAFONT_CONTROLS_BUTTON_CLICKED,
  CLASS_AURAFONT_KEYBOARD_BUTTON_ACTIVE,
  CLASS_AURAFONT_KEYBOARD_HIDDEN,
  CONTROLS_BUTTON_CANVAS_SYMBOL,
  CONTROLS_BUTTON_CONTROLS_SYMBOL,
  STORAGE_KEY_CONTROL_PANEL_VISIBLE,
  STORAGE_KEY_KEYBOARD_VISIBLE,
  TERMINATOR_PARAGRAPH,
} from "./modules/constants.js";
import { EntityManager } from "./modules/manager.js";
import { Glyph } from "./modules/model.js";
import { GlyphInflationTransformer } from "./modules/transformer/glyphInflation.js";
import { GlyphIntervalColorizer } from "./modules/transformer/glyphIntervalColorizer.js";

/**
 * Determines if the device may not have a hardware keyboard.
 *
 * @returns {boolean}
 */
const isLikelyMobile = () => {
  return "maxTouchPoints" in navigator && navigator.maxTouchPoints > 0;
};

const capture = /** @type{HTMLInputElement} */ (
  document.getElementById("capture")
);
const card = /** @type{HTMLDivElement} */ (
  document.getElementById("aurafont-card")
);
const canvas = /** @type{HTMLDivElement} */ (
  document.getElementById("aurafont-manager")
);
const controlsButton = /** @type{HTMLSpanElement} */ (
  document.getElementById("aurafont-controls-button")
);
const keyboardButton = /** @type{HTMLSpanElement} */ (
  document.getElementById("aurafont-keyboard-button")
);
const keyboard = /** @type{HTMLDivElement} */ (
  document.getElementById("keyboard")
);

const /** @type{Record<string, number>} */ keysDown = {};
const /** @type{Record<string, Glyph>} */ glyphForKeyDown = {};
let /** @type{string | null} */ lastNonRepeatKeyDown = null;

let /** @type{boolean} */ isKeyboardVisible =
    localStorage.getItem(STORAGE_KEY_KEYBOARD_VISIBLE) === "true" ||
    isLikelyMobile();
let /** @type{boolean} */ isControlPanelVisible =
    localStorage.getItem(STORAGE_KEY_CONTROL_PANEL_VISIBLE) === "true";

const manager = new EntityManager(canvas);
manager.addTransformer(new GlyphInflationTransformer());
manager.addTransformer(new GlyphIntervalColorizer());
manager.startAnimation();

// Force all focus to the invisible input element:
window.addEventListener("focus", () => {
  capture.focus();
});

// See note above the `keyup` listener. Note also that we attach `keydown` and
// `keyup` listeners on the `window` so we can precisely control the interval in
// which we pick up actual text input (focus the input element on key down and
// blur it once we pick up text). This lets us avoid weird artifacts like the
// MacOS accent context menu while long-pressing a key.
window.addEventListener("keydown", (event) => {
  if (event.code === "Backspace") {
    // Use for debugging:
    // console.log("Invoked backspace");
    manager.backspace();
    return;
  }

  if (!keysDown[event.code]) {
    keysDown[event.code] = Date.now();
    lastNonRepeatKeyDown = event.code;
    capture.focus();
  }
});

// See note above the `keyup` listener.
capture.addEventListener("input", (event) => {
  if (isControlPanelVisible) {
    return;
  }

  const inputEvent = /** @type{InputEvent} */ (event);
  const inputType = inputEvent.inputType;
  if (lastNonRepeatKeyDown === null) {
    return;
  }

  if (inputType === "insertText" && inputEvent.data) {
    glyphForKeyDown[lastNonRepeatKeyDown] = manager.startGlyph(inputEvent.data);
    capture.blur();
  } else if (inputType === "insertFromComposition" && inputEvent.data) {
    glyphForKeyDown[lastNonRepeatKeyDown] = manager.startGlyph(inputEvent.data);
    capture.blur();
  } else if (inputType === "insertLineBreak") {
    glyphForKeyDown[lastNonRepeatKeyDown] =
      manager.startGlyph(TERMINATOR_PARAGRAPH);
    capture.blur();
  }
});

// Not guaranteed to execute after the related `input` event but before any
// other `input` events (since `keyup` events may be batched). So we queue
// `input` glyphs with their most recent `keydown`, then dequeue them the next
// time a `keyup` matches the same key as that `keydown`.
window.addEventListener("keyup", (event) => {
  // Use for debugging:
  // const timestamp = keysDown[event.code];

  delete keysDown[event.code];
  if (!glyphForKeyDown[event.code]) {
    return;
  }
  const glyph = glyphForKeyDown[event.code];
  glyph.release();
  delete glyphForKeyDown[event.code];

  // Use for debugging:
  // console.log(
  //   `Invoked [${glyph.element.innerHTML}] for ${
  //     Date.now() - timestamp
  //   } milliseconds`
  // );
});

const syncControlPanelState = (
  /** @type{boolean} */ isControlPanelVisible,
  /** @type{boolean} */ isInitialSync
) => {
  card.classList.toggle(CLASS_AURAFONT_CARD_FLIPPED, isControlPanelVisible);
  const syncControlsButtonContent = () => {
    controlsButton.classList.toggle(
      CLASS_AURAFONT_CONTROLS_BUTTON_ACTIVE,
      isControlPanelVisible
    );
    controlsButton.innerHTML = isControlPanelVisible
      ? CONTROLS_BUTTON_CANVAS_SYMBOL
      : CONTROLS_BUTTON_CONTROLS_SYMBOL;
  };
  if (isInitialSync) {
    syncControlsButtonContent();
  } else {
    controlsButton.addEventListener(
      "transitionend",
      () => {
        controlsButton.classList.remove(CLASS_AURAFONT_CONTROLS_BUTTON_CLICKED);
        syncControlsButtonContent();
        localStorage.setItem(
          STORAGE_KEY_CONTROL_PANEL_VISIBLE,
          isControlPanelVisible ? "true" : "false"
        );
      },
      { once: true }
    );
    controlsButton.classList.add(CLASS_AURAFONT_CONTROLS_BUTTON_CLICKED);
  }
};

// Initial control panel state sync:
syncControlPanelState(isControlPanelVisible, true);

// Card flip handler to get to controls or back to canvas:
controlsButton.addEventListener("click", () => {
  isControlPanelVisible = !isControlPanelVisible;
  syncControlPanelState(isControlPanelVisible, false);
});

const syncKeyboardState = (/** @type{boolean} */ isKeyboardVisible) => {
  keyboard.classList.toggle(CLASS_AURAFONT_KEYBOARD_HIDDEN, !isKeyboardVisible);
  keyboardButton.classList.toggle(
    CLASS_AURAFONT_KEYBOARD_BUTTON_ACTIVE,
    isKeyboardVisible
  );
  localStorage.setItem(
    STORAGE_KEY_KEYBOARD_VISIBLE,
    isKeyboardVisible ? "true" : "false"
  );
};

// Initial keyboard state sync:
syncKeyboardState(isKeyboardVisible);

// Keyboard button handler to show or hide the keyboard:
keyboardButton.addEventListener("click", () => {
  isKeyboardVisible = !isKeyboardVisible;
  syncKeyboardState(isKeyboardVisible);
});
