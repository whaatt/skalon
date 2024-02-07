// @ts-check
/**
 * If you're reading this code to understand how this works, let me know and I
 * might be able to help. I apologize in advance for the mess of abstractions
 * here, which were concocted on the fly to implement features as I thought of
 * them...
 */
import {
  AsciiCanvas,
  CHAR_CODE_SPACE,
  CHAR_SPACE,
  EditMode,
  FillMode,
  HighlightClass,
  MaskMode,
  chr,
  ord,
} from "./modules/canvas.js";

// DOM constants:
const CLASS_NAME_EDIT_MODE = "edit-mode";
const CLASS_NAME_FILL_MODE = "fill-mode";
const CLASS_NAME_MASK_MODE = "mask-mode";
const DATA_ATTRIBUTE_ACTIVE = "data-active";
const DATA_ATTRIBUTE_EDIT_MODE = "data-edit-mode";
const DATA_ATTRIBUTE_FILL_MODE = "data-fill-mode";
const DATA_ATTRIBUTE_MASK_MODE = "data-mask-mode";
const ELEMENT_ID_CANVAS = "canvas";
const ELEMENT_ID_CHARACTER_PICKER = "character-picker";
const ELEMENT_ID_COLOR_PICKER = "color-picker";
const ELEMENT_ID_CONFIRM_COPY = "confirm-copy";
const ELEMENT_ID_COPY = "copy";
const ELEMENT_ID_DRAW_OPTION_PASTE = "draw-option-paste";
const ELEMENT_ID_DRAW_OPTION_ERASE = "draw-option-erase";
const ELEMENT_ID_IMPORT_CLIP = "import-clip";
const ELEMENT_ID_MODAL_COPY = "modal-copy";
const ELEMENT_ID_REDO = "redo";
const ELEMENT_ID_RESET_CANVAS = "reset-canvas";
const ELEMENT_ID_UNDO = "undo";

// Storage management for binary data:
const STORAGE_KEY_GRID_DATA = "gridData";
const STORAGE_KEY_COLOR_DATA = "colorData";
// @ts-ignore
const keyValueStorage = new IdbKvStore("canvas-storage");
const loadGridAndColor = async () => {
  /** @type {Uint32Array | null} */
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
/** @type {(value: {grid: Uint32Array, color: Uint32Array}) => Promise<void>} */
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
/** @type {Record<keyof import("./modules/canvas.js").InteractionState, any>} */
const stateInternal = {
  editMode: EditMode.Draw,
  activeCharacter: "#",
  activeColor: "#000000",
  useFill: false,
  useMask: false,
  useErase: false,
  runningPaste: false,
  useDiagonalsForBucketFill: false,
};
/**
 * Loads initial internal state from local storage.
 */
const loadState = () => {
  for (const key of Object.keys(stateInternal)) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      stateInternal[/** @type {keyof typeof stateInternal} */ (key)] =
        JSON.parse(value);
    }
  }
};
/**
 * Proxy for state reads and writes.
 */
/** @type {import("./modules/canvas.js").InteractionState} */
// @ts-ignore
const state = new Proxy(stateInternal, {
  get: (target, property) =>
    target[/** @type {keyof typeof stateInternal} */ (property)],
  set: (target, /** @type {keyof typeof stateInternal} */ property, value) => {
    target[property] = value;
    localStorage.setItem(
      property.toString(),
      JSON.stringify(
        target[/** @type {keyof typeof stateInternal} */ (property)]
      )
    );
    // TODO: Encode mutual exclusion between certain fill and mask modes in the
    // type system.
    if (
      property === "useMask" &&
      stateInternal.useMask === MaskMode.Copy &&
      state.useFill === false
    ) {
      stateInternal.useFill = FillMode.Fill;
    }
    if (
      property === "useFill" &&
      stateInternal.useFill === false &&
      stateInternal.useMask === MaskMode.Copy
    ) {
      stateInternal.useMask = false;
    }
    syncState();
    return true;
  },
});
/**
 * Syncs state to the UI (full sync).
 */
const syncState = () => {
  // Update character and color pickers:
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_CHARACTER_PICKER)).value =
    state.activeCharacter === CHAR_SPACE ? "" : state.activeCharacter;
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_COLOR_PICKER)).value = state.activeColor;
  document
    .getElementById(ELEMENT_ID_COLOR_PICKER)
    ?.dispatchEvent(new Event("input", { bubbles: true }));
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_DRAW_OPTION_ERASE)).checked =
    state.useErase;

  // Update mask mode selectors:
  document.querySelectorAll(`.${CLASS_NAME_MASK_MODE}`).forEach((element) => {
    if (element.getAttribute(DATA_ATTRIBUTE_MASK_MODE) === state.useMask) {
      /** @type {HTMLInputElement} */ (element).checked = true;
    } else {
      /** @type {HTMLInputElement} */ (element).checked = false;
    }
  });

  // Update fill mode selectors:
  document.querySelectorAll(`.${CLASS_NAME_FILL_MODE}`).forEach((element) => {
    if (element.getAttribute(DATA_ATTRIBUTE_FILL_MODE) === state.useFill) {
      /** @type {HTMLInputElement} */ (element).checked = true;
    } else {
      /** @type {HTMLInputElement} */ (element).checked = false;
    }
  });

  // Update paste box and disable other boxes if paste is active:
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_DRAW_OPTION_PASTE)).checked =
    state.runningPaste;
  document.querySelectorAll(`.${CLASS_NAME_EDIT_MODE}`).forEach((element) => {
    if (element.getAttribute(DATA_ATTRIBUTE_EDIT_MODE) === state.editMode) {
      element.setAttribute(DATA_ATTRIBUTE_ACTIVE, "true");
    } else {
      element.removeAttribute(DATA_ATTRIBUTE_ACTIVE);
    }
  });
  document
    .querySelectorAll(
      `input[type="checkbox"]:not(#${ELEMENT_ID_DRAW_OPTION_PASTE})`
    )
    .forEach((element) => {
      /** @type {HTMLInputElement} */ (element).disabled = state.runningPaste;
    });
};

/**
 * Initializes the editor.
 */
const initializeEditor = async () => {
  // Sync editor state to UI:
  loadState();
  syncState();

  // Configure standalone listeners for editor elements:
  // @ts-ignore
  Coloris({
    alpha: false,
    focusInput: false,
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
  // Make sure no more than one code point is ever visible (we could also do
  // this with `maxlength` but that does not extend to supporting Unicode if we
  // ever wanted to do that).
  // The change event will actually propagate the final code point to the editor
  // state.
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_CHARACTER_PICKER))?.addEventListener(
    "paste",
    (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      const code = ord(event.clipboardData?.getData("text/plain") || "");
      target.value = chr(code);
      target.blur();
      // For some reason, the blur stops the natural change event from firing.
      target.dispatchEvent(new Event("change"));
    }
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_CHARACTER_PICKER))?.addEventListener(
    "keypress",
    (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      const code = ord(event.key);
      target.value = chr(code);
      target.blur();
      // For some reason, the blur stops the natural change event from firing.
      target.dispatchEvent(new Event("change"));
    }
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_CHARACTER_PICKER))?.addEventListener(
    "change",
    (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      const code = ord(target.value);
      if (code === CHAR_CODE_SPACE) {
        event.preventDefault();
        state.activeCharacter = CHAR_SPACE;
      } else {
        state.activeCharacter = chr(code);
      }
      // Get rid of mask mode if a character is selected.
      if (state.useMask !== false) {
        state.useMask = false;
      }
      state.editMode = EditMode.Draw;
      target.blur();
    }
  );
  /** @type {string} */
  let lastCharacter = state.activeCharacter;
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_DRAW_OPTION_ERASE)).addEventListener(
    "click",
    () => /** @type {HTMLInputElement} */ {
      if (!state.useErase) {
        state.useErase = true;
        lastCharacter = state.activeCharacter;
        state.activeCharacter = CHAR_SPACE;
      } else {
        state.activeCharacter = lastCharacter;
        state.useErase = false;
      }
      // Get rid of mask mode if a character is selected.
      if (state.useMask !== false) {
        state.useMask = false;
      }
      state.editMode = EditMode.Draw;
    }
  );
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_COLOR_PICKER))?.addEventListener(
    "change",
    (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      state.activeColor = target.value;
      // Get rid of Copy Mode if a color is selected.
      if (state.useMask === MaskMode.Copy) {
        state.useMask = false;
      }
      state.editMode = EditMode.Draw;
    }
  );
  document.querySelectorAll(`.${CLASS_NAME_MASK_MODE}`).forEach((element) => {
    element.addEventListener("change", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      state.useMask = target.checked
        ? /** @type {import("./modules/canvas.js").MaskModeValue | false} */ (
            target.getAttribute(DATA_ATTRIBUTE_MASK_MODE)
          ) || false
        : false;
      state.editMode = EditMode.Draw;
    });
  });
  document.querySelectorAll(`.${CLASS_NAME_FILL_MODE}`).forEach((element) => {
    element.addEventListener("change", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      state.useFill = target.checked
        ? /** @type {import("./modules/canvas.js").FillModeValue | false} */ (
            target.getAttribute(DATA_ATTRIBUTE_FILL_MODE)
          ) || false
        : false;
      state.editMode = EditMode.Draw;
    });
  });
  const editModeElements = document.querySelectorAll(
    `.${CLASS_NAME_EDIT_MODE}`
  );
  editModeElements.forEach((element) => {
    element.addEventListener("click", (event) => {
      element.setAttribute(DATA_ATTRIBUTE_ACTIVE, "true");
      const newEditMode =
        /** @type {import("./modules/canvas.js").EditModeValue} */ (
          element.getAttribute(DATA_ATTRIBUTE_EDIT_MODE)
        );
      if (newEditMode !== null) {
        state.editMode = newEditMode;
      }
    });
  });

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
    runCopyFallback: (clipboardItem) => {
      document.getElementById(ELEMENT_ID_CONFIRM_COPY)?.addEventListener(
        "click",
        () => {
          navigator.clipboard.write([clipboardItem]);
          // @ts-ignore
          MicroModal.close(ELEMENT_ID_MODAL_COPY);
        },
        { once: true }
      );
      // @ts-ignore
      MicroModal.show(ELEMENT_ID_MODAL_COPY);
    },
    onCopied: (editMode) => {
      const element = /** @type {HTMLElement | null} */ (
        editMode === EditMode.Draw
          ? document.getElementById(ELEMENT_ID_COPY)
          : document.querySelector(
              `[${DATA_ATTRIBUTE_EDIT_MODE}="${editMode}"]`
            )
      );
      if (element !== null && element.style.background !== "lightgreen") {
        const lastInner = element.innerHTML;
        // Spaces here are to keep the same monospace width. Super hacky...
        if (editMode !== EditMode.Draw) {
          // In Draw mode, we just color the Copy box.
          element.innerHTML = "&nbsp;&nbsp;Copied!&nbsp;&nbsp;";
        }
        const lastColor = element.style.color;
        element.style.color = "black";
        const lastBackground = element.style.background;
        element.style.background = "lightgreen";
        setTimeout(() => {
          if (editMode !== EditMode.Draw) {
            // In Draw mode, we just color the Copy box.
            element.innerHTML = lastInner;
          }
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

  // Configure listeners that interact with the canvas object:
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
  (document.getElementById(ELEMENT_ID_DRAW_OPTION_PASTE)).addEventListener(
    "click",
    () => {
      if (state.runningPaste) {
        state.runningPaste = false;
        // Immediately hide the paste preview (this kind of feels like poking
        // through the abstraction, but whatever).
        canvas.syncEnabledHighlights([], Object.values(HighlightClass));
        canvas.flush({ forceSyncOnly: true });
      } else {
        state.runningPaste = true;
        state.editMode = EditMode.Draw;
      }
    }
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
  /** @type {HTMLInputElement} */
  (document.getElementById(ELEMENT_ID_IMPORT_CLIP)).addEventListener(
    "click",
    async (event) => {
      let text;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
      const element = /** @type{HTMLInputElement} */ (event.target);
      if (element !== null && element.style.background !== "lightgreen") {
        const lastInner = element.innerHTML;
        // Spaces here are to keep the same monospace width. Super hacky...
        element.innerHTML = "&nbsp;&nbsp;Pasted!&nbsp;&nbsp;";
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
      canvas.importPasteArea(text);
    }
  );

  // TODO: De-dupe some of this logic with the input element listeners.
  // Attach a few handy shortcuts. More to be considered:
  window.addEventListener("keydown", (event) => {
    if (event.target === document.getElementById(ELEMENT_ID_CHARACTER_PICKER)) {
      return;
    }
    state.useDiagonalsForBucketFill = event.shiftKey;
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
      }
      // Clear (not exactly a cut):
      else if (event.key === "x") {
        state.editMode = EditMode.Draw;
        canvas.reset();
        canvas.flush({ isReset: true });
        event.preventDefault();
      }
      // Copy Mode:
      else if (event.key === "c" && event.shiftKey === true) {
        if (state.useMask === MaskMode.Copy) {
          state.useMask = false;
        } else {
          state.useMask = MaskMode.Copy;
          state.editMode = EditMode.Draw;
          event.preventDefault();
        }
      }
      // Draw Mode:
      else if (event.key === "d" && event.shiftKey === true) {
        state.editMode = EditMode.Draw;
        event.preventDefault();
      }
      // Recolor Mode:
      else if (event.key === "e" && event.shiftKey === true) {
        if (state.useMask === MaskMode.Color) {
          state.useMask = false;
        } else {
          state.useMask = MaskMode.Color;
          state.editMode = EditMode.Draw;
          event.preventDefault();
        }
      }
      // Rect (Fill) Mode:
      else if (event.key === "r" && event.shiftKey === true) {
        if (state.useFill === FillMode.Fill) {
          state.useFill = false;
        } else {
          state.useFill = FillMode.Fill;
          state.editMode = EditMode.Draw;
        }
        event.preventDefault();
      }
      // Lasso Mode:
      else if (event.key === "s" && event.shiftKey === true) {
        if (state.useFill === FillMode.Lasso) {
          state.useFill = false;
        } else {
          state.useFill = FillMode.Lasso;
          state.editMode = EditMode.Draw;
        }
        event.preventDefault();
      }
      // Bucket Mode:
      else if (event.key === "b" && event.shiftKey === true) {
        if (state.useFill === FillMode.Bucket) {
          state.useFill = false;
        } else {
          state.useFill = FillMode.Bucket;
          state.editMode = EditMode.Draw;
        }
        event.preventDefault();
      }
      // Paste Mode:
      else if (event.key === "v" && !state.runningPaste) {
        state.runningPaste = true;
        state.editMode = EditMode.Draw;
        event.preventDefault();
      }
    } else {
      // Easy character change:
      const code = event.key.codePointAt(0) || 0;
      if (event.key.length === 1 && code >= 32 && code <= 127) {
        state.activeCharacter = event.key;
        event.preventDefault();
      }
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.target === document.getElementById(ELEMENT_ID_CHARACTER_PICKER)) {
      return;
    }
    state.useDiagonalsForBucketFill = event.shiftKey;
    if (
      state.runningPaste &&
      (event.key === "v" || (!event.metaKey && !event.ctrlKey))
    ) {
      state.runningPaste = false;
      // Immediately hide the paste preview (this kind of feels like poking
      // through the abstraction, but whatever).
      canvas.syncEnabledHighlights([], Object.values(HighlightClass));
      canvas.flush({ forceSyncOnly: true });
    }
  });
};

// We have to wait for ready since this script is loaded as a module.
window.onload = () => initializeEditor();

// TODO:
// ?. (Stretch) Marker size tools?
// ?. (Stretch) More keyboard shortcuts?
// ?. (Stretch) Linking ability?
// ?. (Stretch) Pressure support?
// ?. (Stretch) Animation support?
