// @ts-check
import {
  AsciiCanvas,
  CHAR_CODE_SPACE,
  CHAR_SPACE,
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
const ELEMENT_ID_REDO = "redo";
const ELEMENT_ID_RESET_CANVAS = "reset-canvas";
const ELEMENT_ID_UNDO = "undo";

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
/** @type {Record<string, any>} */
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
/** @type {import("./modules/canvas.js").InteractionState} */
// @ts-ignore
const state = new Proxy(stateInternal, {
  get: (target, /** @type{string}*/ property) => target[property],
  set: (target, /** @type{string}*/ property, value) => {
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
  const fillModeElements = document.querySelectorAll(
    `.${CLASS_NAME_FILL_MODE}`
  );
  for (let i = 0; i < fillModeElements.length; i += 1) {
    const element = fillModeElements[i];
    if (element.getAttribute(DATA_ATTRIBUTE_FILL_MODE) === state.useFill) {
      /** @type {HTMLInputElement} */ (element).checked = true;
    } else {
      /** @type {HTMLInputElement} */ (element).checked = false;
    }
  }
  const editModeElements = document.querySelectorAll(
    `.${CLASS_NAME_EDIT_MODE}`
  );
  for (let i = 0; i < editModeElements.length; i += 1) {
    const element = editModeElements[i];
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
      state.editMode = EditMode.Draw;
      target.blur();
    }
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_COLOR_PICKER))?.addEventListener(
    "change",
    (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      state.activeColor = target.value;
      state.editMode = EditMode.Draw;
    }
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_DRAW_OPTION_COLOR))?.addEventListener(
    "change",
    (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      state.useColor = target.checked;
      state.editMode = EditMode.Draw;
    }
  );
  const fillModeElements = document.querySelectorAll(
    `.${CLASS_NAME_FILL_MODE}`
  );
  for (let i = 0; i < fillModeElements.length; i += 1) {
    const element = fillModeElements[i];
    element.addEventListener("change", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      state.useFill = target.checked
        ? target.getAttribute(DATA_ATTRIBUTE_FILL_MODE) || false
        : false;
      state.editMode = EditMode.Draw;
    });
  }
  const editModeElements = document.querySelectorAll(
    `.${CLASS_NAME_EDIT_MODE}`
  );
  for (let i = 0; i < editModeElements.length; i += 1) {
    const element = editModeElements[i];
    element.addEventListener("click", (event) => {
      element.setAttribute(DATA_ATTRIBUTE_ACTIVE, "true");
      const newEditMode =
        /** @type {import("./modules/canvas.js").EditModeValue} */ (
          element.getAttribute(DATA_ATTRIBUTE_EDIT_MODE)
        );
      if (newEditMode !== null) {
        state.editMode = newEditMode;
      }
      for (let j = 0; j < editModeElements.length; j += 1) {
        const otherElement = editModeElements[j];
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
  const canvas = new AsciiCanvas({
    element: /** @type {HTMLPreElement} */ (canvasElement),
    gridInitial: grid,
    colorInitial: color,
    getInteractionState: () => state,
    storeGridAndColor,
    onCopied: (editMode) => {
      const element = /** @type {HTMLButtonElement | null} */ (
        document.querySelector(`[${DATA_ATTRIBUTE_EDIT_MODE}="${editMode}"]`)
      );
      if (element !== null) {
        const lastInner = element.innerHTML;
        // Spaces here are to keep the same monospace width. Super hacky...
        element.innerHTML = "&nbsp;Copied!&nbsp;";
        const lastColor = element.style.color;
        element.style.color = "black";
        const lastBackground = element.style.background;
        element.style.background = "lightgreen";
        setTimeout(() => {
          element.innerHTML = lastInner;
          element.style.color = lastColor;
          element.style.background = lastBackground;
        }, 500);
      }
    },
    onNavigated: () => {
      /** @type {HTMLInputElement} */ (
        document.getElementById(ELEMENT_ID_UNDO)
      ).disabled = !canvas.canUndo();
      /** @type {HTMLInputElement} */ (
        document.getElementById(ELEMENT_ID_REDO)
      ).disabled = !canvas.canRedo();
    },
  });
  const undo = () => {
    if (canvas.canUndo()) {
      canvas.undo();
      canvas.flush({ isUndo: true });
    }
  };
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_UNDO)).addEventListener("click", () =>
    undo()
  );
  const redo = () => {
    if (canvas.canRedo()) {
      canvas.redo();
      canvas.flush({ isRedo: true });
    }
  };
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_REDO)).addEventListener("click", () =>
    redo()
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_RESET_CANVAS)).addEventListener(
    "click",
    () => {
      state.editMode = EditMode.Draw;
      canvas.reset();
      canvas.flush({ isReset: true });
    }
  );

  // Attach a few handy shortcuts. More to be considered...
  window.addEventListener("keydown", (event) => {
    if (event.metaKey === true || event.ctrlKey === true) {
      // Windows Redo:
      if (event.key === "y") {
        redo();
        event.preventDefault();
      } else if (event.key === "z") {
        // Mac Redo:
        if (event.shiftKey === true) {
          redo();
        }
        // Mac Undo:
        else {
          undo();
        }
        event.preventDefault();
        return false;
      }
    } else {
      // Easy character change:
      const code = event.key.charCodeAt(0);
      if (event.key.length === 1 && code >= 32 && code <= 127) {
        state.activeCharacter = event.key;
        event.preventDefault();
      }
    }
  });
};

// We have to wait for ready since this script is loaded as a module.
window.onload = () => initializeEditor();

// TODO:
// 1. Implement paste raw or HTML (pre-formatted) text
// 2. Link with previous blog post
// 3. Quick demo video?
// ?. (Stretch) Marker size tools?
// ?. (Stretch) More keyboard shortcuts?
// ?. (Stretch) Linking ability?
// ?. (Stretch) Pressure support?
// ?. (Stretch) Animation support?
