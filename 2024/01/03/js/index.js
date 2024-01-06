// @ts-check
import {
  AsciiCanvas,
  SPACE_CHAR_CODE as CHAR_CODE_SPACE,
  SPACE_CHAR as CHAR_SPACE,
  EditMode,
  ord,
} from "./modules/canvas.js";

// DOM constants:
const CLASS_NAME_EDIT_MODE = "edit-mode";
const CLASS_NAME_FILL_MODE = "fill-mode";
const DATA_ATTRIBUTE_ACTIVE = "data-active";
const DATA_ATTRIBUTE_EDIT_MODE = "data-edit-mode";
const DATA_ATTRIBUTE_FILL_MODE = "data-fill-mode";
const ELEMENT_ID_CANVAS = "canvas";
const ELEMENT_ID_CHARACTER_PICKER = "character-picker";
const ELEMENT_ID_COLOR_PICKER = "color-picker";
const ELEMENT_ID_DRAW_OPTION_COLOR = "draw-option-color";
const ELEMENT_ID_RESET_CANVAS = "reset-canvas";

// Storage management for binary data:
const STORAGE_KEY_GRID_DATA = "gridData";
const STORAGE_KEY_COLOR_DATA = "colorData";
// @ts-ignore
const keyValueStorage = new IdbKvStore("canvas-storage");
const loadGridAndColor = async () => {
  /** @type {Uint8Array | null} */
  let grid = null;
  try {
    grid = (await keyValueStorage.get(STORAGE_KEY_GRID_DATA)) || null;
  } catch (error) {
    console.error(error);
  }
  /** @type {Uint32Array | null} */
  let color = null;
  try {
    color = (await keyValueStorage.get(STORAGE_KEY_COLOR_DATA)) || null;
  } catch (error) {
    console.error(error);
  }
  return { grid, color };
};
/** @type {(value: {grid: Uint8Array, color: Uint32Array}) => Promise<void>} */
const storeGridAndColor = async (value) => {
  try {
    await keyValueStorage.set(STORAGE_KEY_GRID_DATA, value.grid);
  } catch (error) {
    console.error(error);
  }
  try {
    await keyValueStorage.set(STORAGE_KEY_COLOR_DATA, value.color);
  } catch (error) {
    console.error(error);
  }
};

// Editor state management (yes, I know I'm basically re-building React):
/** @type {import("./modules/canvas.js").InteractionState} */
const stateInternal = {
  editMode: EditMode.Draw,
  activeCharacter: "#",
  activeColor: "#000000",
  useFill: false,
  useColor: false,
};
/**
 * Loads initial internal state from local storage.
 */
const loadState = () => {
  for (const key of Object.keys(stateInternal)) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      stateInternal[key] = JSON.parse(value);
    }
  }
};
/**
 * Proxy for state reads and writes.
 */
const state = new Proxy(stateInternal, {
  get: (target, property) => target[property],
  set: (target, property, value) => {
    target[property] = value;
    localStorage.setItem(property.toString(), JSON.stringify(target[property]));
    syncState();
    return true;
  },
});
/**
 * Syncs state to the UI (full sync).
 */
const syncState = () => {
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_CHARACTER_PICKER)).value =
    state.activeCharacter === CHAR_SPACE ? "" : state.activeCharacter;
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_COLOR_PICKER)).value = state.activeColor;
  document
    .getElementById(ELEMENT_ID_COLOR_PICKER)
    ?.dispatchEvent(new Event("input", { bubbles: true }));
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_DRAW_OPTION_COLOR)).checked =
    state.useColor;
  for (const element of document.getElementsByClassName(CLASS_NAME_FILL_MODE)) {
    if (element.getAttribute(DATA_ATTRIBUTE_FILL_MODE) === state.useFill) {
      /** @type {HTMLInputElement} */ (element).checked = true;
    } else {
      /** @type {HTMLInputElement} */ (element).checked = false;
    }
  }
  for (const element of document.getElementsByClassName(CLASS_NAME_EDIT_MODE)) {
    if (element.getAttribute(DATA_ATTRIBUTE_EDIT_MODE) === state.editMode) {
      element.setAttribute("data-active", "true");
    } else {
      element.removeAttribute("data-active");
    }
  }
};

/**
 * Initializes the editor.
 */
const initializeEditor = async () => {
  // Sync editor state to UI:
  loadState();
  syncState();

  // Configure listeners for editor elements.
  // @ts-ignore
  Coloris({
    alpha: false,
    swatches: [
      "#264653",
      "#2a9d8f",
      "#e9c46a",
      "rgb(244,162,97)",
      "#e76f51",
      "#d62828",
    ],
  });
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_CHARACTER_PICKER)).addEventListener(
    "click",
    (event) => /** @type {HTMLInputElement} */ (event.target).select()
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_CHARACTER_PICKER))?.addEventListener(
    "keyup",
    (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      const code = ord(target.value);
      if (code === CHAR_CODE_SPACE) {
        event.preventDefault();
        state.activeCharacter = CHAR_SPACE;
        target.value = "";
      } else {
        state.activeCharacter = target.value;
      }
      target.blur();
    }
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_COLOR_PICKER))?.addEventListener(
    "change",
    (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      state.activeColor = target.value;
    }
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_DRAW_OPTION_COLOR))?.addEventListener(
    "change",
    (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      state.useColor = target.checked;
    }
  );
  for (const element of document.getElementsByClassName(CLASS_NAME_FILL_MODE)) {
    element.addEventListener("change", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      state.useFill = target.checked
        ? target.getAttribute(DATA_ATTRIBUTE_FILL_MODE) || false
        : false;
    });
  }
  for (const element of document.getElementsByClassName(CLASS_NAME_EDIT_MODE)) {
    element.addEventListener("click", (event) => {
      element.setAttribute(DATA_ATTRIBUTE_ACTIVE, "true");
      const newEditMode =
        /** @type {import("./modules/canvas.js").EditModeValue} */ (
          element.getAttribute(DATA_ATTRIBUTE_EDIT_MODE)
        );
      if (newEditMode !== null) {
        state.editMode = newEditMode;
      }
      for (const otherElement of document.getElementsByClassName(
        CLASS_NAME_EDIT_MODE
      )) {
        if (otherElement !== element) {
          otherElement.removeAttribute(DATA_ATTRIBUTE_ACTIVE);
        }
      }
    });
  }

  // Configure the canvas and its touch listeners (occurs internal to the canvas
  // object):
  const { grid, color } = await loadGridAndColor();
  const canvasElement = document.getElementById(ELEMENT_ID_CANVAS);
  if (!canvasElement) {
    return;
  }
  const canvas = new AsciiCanvas(
    /** @type {HTMLPreElement} */ (canvasElement),
    grid,
    color,
    () => state,
    storeGridAndColor
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_RESET_CANVAS)).addEventListener(
    "click",
    () => {
      canvas.reset();
      canvas.flush();
    }
  );
};

// We have to wait for ready since this script is loaded as a module.
window.onload = () => initializeEditor();

// TODO:
// 1. Implement select mode (HTML with standardized output)
// 2. Implement select mode (raw text)
// 3. Implement undo/redo stack as un-flush operation
// 4. Implement paste raw (pre-formatted) text
// ?. (Stretch) Marker size tools?
// ?. (Stretch) Keyboard shortcuts?
// ?. (Stretch) Linking ability?
// ?. (Stretch) Pressure support?
// ?. (Stretch) Animation support?
