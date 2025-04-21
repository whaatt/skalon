import { EntityManager, TERMINATOR_PARAGRAPH } from "./modules/manager.js";
import { Glyph } from "./modules/model.js";

/**
 * Notes:
 * - Only use `insertText` and `insertFromComposition for glyph creation
 *   as append-only (plus `insertLineBreak`)
 * - Add backspace input type?
 * - Dwell time for combining characters is still determined from most recent
 *   key down (maybe the actual `InputEvent` with data) to key up
 * - Interface itself will have cursor movement + selection ability
 * - Can clear entire canvas OR apply "white-out" from cursor position
 */

const capture = /** @type{HTMLInputElement} */ (
  document.getElementById("capture")
);
const canvas = /** @type{HTMLDivElement} */ (
  document.getElementById("aurafont-canvas")
);

const /** @type{Record<string, number>} */ keysDown = {};
const /** @type{Record<string, Glyph>} */ glyphForKeyDown = {};
let /** @type{string | null} */ lastNonRepeatKeyDown = null;

const manager = new EntityManager(canvas);
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
    console.log("Invoked backspace");
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
  const timestamp = keysDown[event.code];

  delete keysDown[event.code];
  if (!glyphForKeyDown[event.code]) {
    return;
  }
  const glyph = glyphForKeyDown[event.code];
  glyph.release();
  delete glyphForKeyDown[event.code];

  // Use for debugging:
  console.log(
    `Invoked [${glyph.element.innerHTML}] for ${
      Date.now() - timestamp
    } milliseconds`
  );
});
