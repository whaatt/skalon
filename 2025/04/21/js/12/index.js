import {
  ACTION_BACKSPACE,
  ACTION_CAPS,
  ATTRIBUTE_DATA_ACTION,
  ATTRIBUTE_DATA_KEY,
  ATTRIBUTE_DATA_KEY_VALUE_ENTER,
  ATTRIBUTE_DATA_TRANSFORMER_OPTION,
  ATTRIBUTE_DATA_TRANSFORMER_OPTION_VALUE_EMOJI,
  BUTTON_CONTROLS_SYMBOL_CANVAS,
  BUTTON_CONTROLS_SYMBOL_CONTROLS,
  CLASS_AURAFONT_CARD_FLIPPED,
  CLASS_AURAFONT_CONTROLS_BUTTON_ACTIVE,
  CLASS_AURAFONT_CONTROLS_BUTTON_CLICKED,
  CLASS_AURAFONT_KEYBOARD_BUTTON_ACTIVE,
  CLASS_AURAFONT_KEYBOARD_HIDDEN,
  CLASS_AURAFONT_TRANSFORMER_OPTION,
  CLASS_AURAFONT_TRANSFORMER_OPTION_NOT_CONFIGURED,
  CLASS_AURAFONT_TRANSFORMER_OPTION_SELECTED,
  CLASS_KEY,
  CLASS_KEY_ACTIVE,
  ELEMENT_ID_AURAFONT_CAPTURE,
  ELEMENT_ID_AURAFONT_CARD,
  ELEMENT_ID_AURAFONT_COMPLETIONS_CONFIG_BUTTON,
  ELEMENT_ID_AURAFONT_CONTROLS_BUTTON,
  ELEMENT_ID_AURAFONT_KEYBOARD,
  ELEMENT_ID_AURAFONT_KEYBOARD_BUTTON,
  ELEMENT_ID_AURAFONT_MANAGER,
  LABEL_API_CONFIGURED,
  LABEL_CONFIGURE_API,
  STORAGE_KEY_COMPLETIONS_CONFIG,
  STORAGE_KEY_CONTROL_PANEL_VISIBLE,
  STORAGE_KEY_KEYBOARD_VISIBLE,
  STORAGE_KEY_SELECTED_TRANSFORMERS,
  TERMINATOR_PARAGRAPH,
} from "./modules/constants.js";
import { EntityManager } from "./modules/manager.js";
import { Glyph } from "./modules/model.js";
import { EmojiTransformer } from "./modules/transformer/emojiTransformer.js";
import {
  DEFAULT_COMPLETIONS_CONFIG,
  DEFAULT_TRANSFORMERS,
  Registry,
  TRANSFORMER_APPLICATION_SORT_ORDER,
} from "./modules/transformer/index.js";

/**
 * Determines if the device has touch support.
 *
 * @returns {boolean}
 */
const hasTouchSupport = () => {
  return "maxTouchPoints" in navigator && navigator.maxTouchPoints !== 0;
};

/*
 * Global State
 */

const capture = /** @type{HTMLInputElement} */ (
  document.getElementById(ELEMENT_ID_AURAFONT_CAPTURE)
);
const card = /** @type{HTMLDivElement} */ (
  document.getElementById(ELEMENT_ID_AURAFONT_CARD)
);
const canvas = /** @type{HTMLDivElement} */ (
  document.getElementById(ELEMENT_ID_AURAFONT_MANAGER)
);
const controlsButton = /** @type{HTMLSpanElement} */ (
  document.getElementById(ELEMENT_ID_AURAFONT_CONTROLS_BUTTON)
);
const keyboardButton = /** @type{HTMLSpanElement} */ (
  document.getElementById(ELEMENT_ID_AURAFONT_KEYBOARD_BUTTON)
);
const keyboard = /** @type{HTMLDivElement} */ (
  document.getElementById(ELEMENT_ID_AURAFONT_KEYBOARD)
);
const emojiTransformerOption = /** @type{HTMLDivElement} */ (
  document.querySelector(
    `[${ATTRIBUTE_DATA_TRANSFORMER_OPTION}="${ATTRIBUTE_DATA_TRANSFORMER_OPTION_VALUE_EMOJI}"]`
  )
);
const completionsConfigButton = /** @type{HTMLDivElement} */ (
  document.getElementById(ELEMENT_ID_AURAFONT_COMPLETIONS_CONFIG_BUTTON)
);

const /** @type{Record<string, number>} */ keysDown = {};
const /** @type{Record<string, Glyph>} */ glyphForKeyDown = {};
let /** @type{string | null} */ lastNonRepeatKeyDown = null;
let /** @type{boolean} */ gotKeyDown = false;
let /** @type{boolean} */ isVirtualCapsLockActive = false;

const safeParse = (/** @type{any} */ value) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

let /** @type{boolean} */ isKeyboardVisible =
    localStorage.getItem(STORAGE_KEY_KEYBOARD_VISIBLE) === "true" ||
    (localStorage.getItem(STORAGE_KEY_KEYBOARD_VISIBLE) === null &&
      hasTouchSupport());
let /** @type{boolean} */ isControlPanelVisible =
    localStorage.getItem(STORAGE_KEY_CONTROL_PANEL_VISIBLE) === "true";
let /** @type{Array<keyof typeof Registry>} */ selectedTransformers =
    safeParse(localStorage.getItem(STORAGE_KEY_SELECTED_TRANSFORMERS)) ||
    DEFAULT_TRANSFORMERS;
let /** @type{typeof DEFAULT_COMPLETIONS_CONFIG} */ completionsConfig =
    safeParse(localStorage.getItem(STORAGE_KEY_COMPLETIONS_CONFIG)) ||
    DEFAULT_COMPLETIONS_CONFIG;

// Initialize the rendering manager with a root container element:
const manager = new EntityManager(canvas);
manager.startAnimation();

/*
 * Input Capture Logic
 */

// Force all focus to the invisible input element (if we have likely hardware
// keyboard support):
window.addEventListener("focus", () => {
  if (gotKeyDown || !hasTouchSupport()) {
    capture.focus();
  }
});

// Record the last press time of each key, and save the most recent non-repeated
// key press to associate with the next `input` event. Note also that we attach
// `keydown` and `keyup` listeners on the `window` so we can precisely control
// the interval in which we pick up actual text input (focus a capture element
// on `keydown` and blur it once we pick up text via `input`). This lets us
// avoid weird artifacts like the MacOS accent menu while long-pressing a key:
window.addEventListener("keydown", (event) => {
  gotKeyDown = true;
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

// Start a glyph for the latest input within the hidden capture element. Note
// that we associate that glyph with the most recent `keydown` key, which may
// not be the literal key value (in cases like multi-press composition):
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

// Release a glyph for the latest `keyup` event. Note that we do not always
// receive this event after the related `input` event but before any other
// `input` events (since `keyup` events may be batched). So we queue `input`
// glyphs with their most recent `keydown`, then dequeue them the next time a
// `keyup` matches the same key as that `keydown` (as described above):
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

/*
 * UI Sync Logic
 */

const syncControlPanelState = (
  /** @type{boolean} */ isControlPanelVisible,
  /** @type{boolean} */ isInitialSync
) => {
  card.classList.toggle(CLASS_AURAFONT_CARD_FLIPPED, isControlPanelVisible);
  localStorage.setItem(
    STORAGE_KEY_CONTROL_PANEL_VISIBLE,
    isControlPanelVisible ? "true" : "false"
  );
  if (isControlPanelVisible) {
    manager.stopAnimation();
  } else {
    manager.startAnimation();
  }
  const syncControlsButtonContent = () => {
    controlsButton.classList.toggle(
      CLASS_AURAFONT_CONTROLS_BUTTON_ACTIVE,
      isControlPanelVisible
    );
    controlsButton.innerHTML = isControlPanelVisible
      ? BUTTON_CONTROLS_SYMBOL_CANVAS
      : BUTTON_CONTROLS_SYMBOL_CONTROLS;
  };
  if (isInitialSync) {
    syncControlsButtonContent();
  } else {
    controlsButton.addEventListener(
      "transitionend",
      () => {
        controlsButton.classList.remove(CLASS_AURAFONT_CONTROLS_BUTTON_CLICKED);
        syncControlsButtonContent();
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
  if (isKeyboardVisible) {
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    // @ts-ignore
    document.body.style.msUserSelect = "none";
  } else {
    document.body.style.userSelect = "auto";
    document.body.style.webkitUserSelect = "auto";
    // @ts-ignore
    document.body.style.msUserSelect = "auto";
  }
};

// Initial keyboard state sync:
syncKeyboardState(isKeyboardVisible);

// Keyboard button handler to show or hide the keyboard:
keyboardButton.addEventListener("click", () => {
  isKeyboardVisible = !isKeyboardVisible;
  syncKeyboardState(isKeyboardVisible);
});

const syncTransformerSelectionState = (
  /** @type{Array<keyof typeof Registry>} */ selectedTransformers
) => {
  manager.syncTransformers(
    selectedTransformers.map((name) => {
      const transformer = new Registry[name]();
      if (transformer instanceof EmojiTransformer) {
        transformer.setCompletionsConfig(
          completionsConfig.baseUrl,
          completionsConfig.model,
          completionsConfig.apiKey
        );
      }
      return transformer;
    })
  );
  Array.from(
    document.getElementsByClassName(CLASS_AURAFONT_TRANSFORMER_OPTION)
  ).forEach((option) => {
    const optionSelected = selectedTransformers.includes(
      /** @type{keyof typeof Registry} */ (
        option.getAttribute(ATTRIBUTE_DATA_TRANSFORMER_OPTION)
      )
    );
    option.classList.toggle(
      CLASS_AURAFONT_TRANSFORMER_OPTION_SELECTED,
      optionSelected
    );
  });
  localStorage.setItem(
    STORAGE_KEY_SELECTED_TRANSFORMERS,
    JSON.stringify(selectedTransformers)
  );
};

// Initial transformer selection state sync:
selectedTransformers.sort(
  (a, b) =>
    TRANSFORMER_APPLICATION_SORT_ORDER[a] -
    TRANSFORMER_APPLICATION_SORT_ORDER[b]
);
syncTransformerSelectionState(selectedTransformers);

// Transformer selection handler:
Array.from(
  document.getElementsByClassName(CLASS_AURAFONT_TRANSFORMER_OPTION)
).forEach((option) => {
  option.addEventListener("click", () => {
    const newSelectedTransformers = selectedTransformers.filter(
      (name) => name !== option.getAttribute(ATTRIBUTE_DATA_TRANSFORMER_OPTION)
    );
    if (
      !option.classList.contains(CLASS_AURAFONT_TRANSFORMER_OPTION_SELECTED) &&
      !option.classList.contains(
        CLASS_AURAFONT_TRANSFORMER_OPTION_NOT_CONFIGURED
      )
    ) {
      newSelectedTransformers.push(
        /** @type{keyof typeof Registry} */ (
          option.getAttribute(ATTRIBUTE_DATA_TRANSFORMER_OPTION)
        )
      );
    }
    if (
      JSON.stringify(selectedTransformers) !==
      JSON.stringify(newSelectedTransformers)
    ) {
      // Re-apply transformer styles from a blank slate after changing which
      // ones are active:
      manager.resetStyle();
    }
    selectedTransformers = newSelectedTransformers;
    selectedTransformers.sort(
      (a, b) =>
        TRANSFORMER_APPLICATION_SORT_ORDER[a] -
        TRANSFORMER_APPLICATION_SORT_ORDER[b]
    );
    // Yes; I'm re-creating React semantics here (event on element updates the
    // state, which in turn updates the UI).
    syncTransformerSelectionState(selectedTransformers);
  });
});

const syncEmojiTransformerOption = () => {
  const isConfigured = Object.values(completionsConfig).every((value) => value);
  completionsConfigButton.innerHTML = isConfigured
    ? LABEL_API_CONFIGURED
    : LABEL_CONFIGURE_API;

  emojiTransformerOption.classList.toggle(
    CLASS_AURAFONT_TRANSFORMER_OPTION_NOT_CONFIGURED,
    !isConfigured
  );
};

// Initial emoji transformer option state sync:
syncEmojiTransformerOption();

// Emoji transformer completions config button handler:
completionsConfigButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const currentConfig = completionsConfig;
  const newBaseUrl = window.prompt(
    "Enter completions API Base URL (or hit OK to keep current):",
    currentConfig.baseUrl
  );
  if (!newBaseUrl) {
    return;
  }
  const newModel = window.prompt(
    "Enter completions Model (or hit OK to keep current):",
    currentConfig.model
  );
  if (!newModel) {
    return;
  }
  const newApiKey = window.prompt(
    "Enter completions API Key (or hit OK to keep current; use an empty value to clear). " +
      "Stored in local storage and only used to query the LLM provider at your specified URL " +
      "(but you will be trusting my code by entering it here):",
    currentConfig.apiKey ? "********" : ""
  );
  if (newApiKey === null) {
    return;
  }
  completionsConfig = {
    baseUrl: newBaseUrl || currentConfig.baseUrl,
    model: newModel || currentConfig.model,
    apiKey:
      newApiKey === ""
        ? ""
        : newApiKey === "********"
        ? currentConfig.apiKey
        : newApiKey,
  };

  syncEmojiTransformerOption();
  localStorage.setItem(
    STORAGE_KEY_COMPLETIONS_CONFIG,
    JSON.stringify(completionsConfig)
  );
  selectedTransformers.forEach((name) => {
    const transformer = new Registry[name]();
    if (transformer instanceof EmojiTransformer) {
      transformer.setCompletionsConfig(
        completionsConfig.baseUrl,
        completionsConfig.model,
        completionsConfig.apiKey
      );
    }
  });
});

/*
 * On-Screen Keyboard Logic
 */

// Touch event handler for on-screen keyboard (note that CSS :active state does
// not apply on touch so the relevant styles must be applied here):
const /** @type{Record<string, boolean>} */ activeActions = {};
Array.from(document.getElementsByClassName(CLASS_KEY)).forEach((key) => {
  const /** @type{Record<string, Glyph>} */ activeGlyphs = {};
  key.addEventListener("pointerdown", () => {
    if (isControlPanelVisible) {
      return;
    }
    // Handle glyph keys:
    let dataKey = key.getAttribute(ATTRIBUTE_DATA_KEY);
    if (dataKey === ATTRIBUTE_DATA_KEY_VALUE_ENTER) {
      dataKey = "\n";
    }
    if (dataKey) {
      key.classList.add(CLASS_KEY_ACTIVE);
      const glyph = isVirtualCapsLockActive ? dataKey.toUpperCase() : dataKey;
      activeGlyphs[dataKey] = manager.startGlyph(glyph);
    }
    // Handle action keys:
    const dataAction = key.getAttribute(ATTRIBUTE_DATA_ACTION);
    if (dataAction) {
      key.classList.add(CLASS_KEY_ACTIVE);
      activeActions[dataAction] = true;
    }
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((name) =>
    key.addEventListener(name, () => {
      // Handle glyph keys:
      let dataKey = key.getAttribute(ATTRIBUTE_DATA_KEY);
      if (dataKey === ATTRIBUTE_DATA_KEY_VALUE_ENTER) {
        dataKey = "\n";
      }
      if (dataKey && activeGlyphs[dataKey]) {
        key.classList.remove(CLASS_KEY_ACTIVE);
        activeGlyphs[dataKey].release();
        delete activeGlyphs[dataKey];
      }
      // Handle action keys:
      const dataAction = key.getAttribute(ATTRIBUTE_DATA_ACTION);
      if (dataAction && activeActions[dataAction]) {
        key.classList.remove(CLASS_KEY_ACTIVE);
        if (dataAction === ACTION_BACKSPACE) {
          manager.backspace();
        } else if (dataAction === ACTION_CAPS) {
          isVirtualCapsLockActive = !isVirtualCapsLockActive;
          key.classList.toggle(CLASS_KEY_ACTIVE, isVirtualCapsLockActive);
        }
        delete activeActions[dataAction];
      }
    })
  );
});
