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

const /** @type{Record<string, number>} */ keysDown = {};
const /** @type{Record<string, string>} */ glyphForKeyDown = {};
let /** @type{string | null} */ lastNonRepeatKeyDown = null;

window.addEventListener("focus", () => {
  capture.focus();
});

// See note above the `keyup` listener. Note also that we attach `keydown` and
// `keyup` listeners on the `window` so we can precisely control the interval in
// which we pick up actual text input (focus the input element on key down and
// blur it once we pick up text). This lets us avoid weird artifacts like the
// MacOS accent context menu while long-pressing a key.
window.addEventListener("keydown", (event) => {
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
    glyphForKeyDown[lastNonRepeatKeyDown] = inputEvent.data;
    capture.blur();
  } else if (inputType === "insertFromComposition" && inputEvent.data) {
    glyphForKeyDown[lastNonRepeatKeyDown] = inputEvent.data;
    capture.blur();
  } else if (inputType === "insertLineBreak") {
    glyphForKeyDown[lastNonRepeatKeyDown] = "Enter";
    capture.blur();
  }
});

// Not guaranteed to execute after the related `input` event but before any
// other `input` events (since `keyup` events may be batched). So we queue
// `input` glyphs with their most recent `keydown`, then dequeue them the next
// time a `keyup` matches the same key as that `keydown`.
window.addEventListener("keyup", (event) => {
  const timestamp = keysDown[event.code];
  delete keysDown[event.code];
  if (!glyphForKeyDown[event.code]) {
    return;
  }
  const glyph = glyphForKeyDown[event.code];
  delete glyphForKeyDown[event.code];
  console.log(glyph, Date.now() - timestamp);
});
