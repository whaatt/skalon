// @ts-check
import { hexToRgba } from "../vendor/hex-to-rgba.js";

const CHAR_SPACE = " ";
const CHAR_CODE_SPACE = CHAR_SPACE.charCodeAt(0);

// Always initialize storage to this size to accommodate page resizing.
// TODO: Allow unbounded grid sizes...
const MAX_WIDTH = 100;
const MAX_HEIGHT = 100;

/**
 * Class name for each grid cell.
 */
const CELL_CLASS_NAME = "ascii-canvas-cell";
/** @typedef {HighlightClass[keyof HighlightClass]} HighlightClassValue */
const HighlightClass = /** @type {const} */ {
  Selection: "highlight-selection",
  Boundary: "highlight-boundary",
};

/**
 * Returns the ASCII code for a printable character (or the code for space in
 * all other cases).
 *
 * @param {string} character The character to convert.
 * @returns {number}
 */
const ord = (character) => {
  if (character.length !== 1) {
    return CHAR_CODE_SPACE;
  }
  const code = character.charCodeAt(0);
  if (code >= 32 && code <= 127) {
    return code;
  }
  return CHAR_CODE_SPACE;
};

/**
 * Returns the printable character for an ASCII code (or space in all other
 * cases).
 *
 * @param {number} code
 * @returns {string}
 */
const chr = (code) => {
  if (code >= 32 && code <= 127) {
    return String.fromCharCode(code);
  }
  return CHAR_SPACE;
};

/**
 * @param {number} red
 * @param {number} green
 * @param {number} blue
 * @param {number} alpha
 * @returns {number}
 */
const rgbaToUint32 = (red, green, blue, alpha) =>
  (red << 24) | (green << 16) | (blue << 8) | Math.round(alpha * 255);

/**
 * @param {number} value
 * @returns {string}
 */
const uint32ToRgbaString = (value) =>
  `rgba(${Math.round((value >> 24) & 0xff)}, ${Math.round(
    (value >> 16) & 0xff
  )}, ${Math.round((value >> 8) & 0xff)}, ${(value & 0xff) / 255})`;

/**
 * Computes all the Bresenham points between `[r0, c0]` and `[r1, c1]`.
 *
 * Cribbed from Wikipedia...
 *
 * @param {number} r0
 * @param {number} c0
 * @param {number} r1
 * @param {number} c1
 * @returns {Array<[number, number]>}
 */
const interpolatePoints = (r0, c0, r1, c1) => {
  /** @type {Array<[number, number]>} */
  const points = [];
  let [x0, y0, x1, y1] = [c0, r0, c1, r1];
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;

  while (true) {
    if ((x0 !== c0 || y0 !== r0) && (x0 !== c1 || y0 !== r1)) {
      points.push([y0, x0]);
    }
    if (x0 == x1 && y0 == y1) {
      break;
    }
    const e2 = 2 * error;
    if (e2 >= dy) {
      if (x0 == x1) break;
      error = error + dy;
      x0 = x0 + sx;
    }
    if (e2 <= dx) {
      if (y0 == y1) break;
      error = error + dx;
      y0 = y0 + sy;
    }
  }

  return points;
};

/**
 * Returns the set of points in the rectangular region defined by the start and
 * end of the passed `path`.
 *
 * @param {Array<[number, number]>} path
 * @returns {Array<[number, number]>}
 */
const getRectanglePoints = (path) => {
  if (path.length === 0) {
    return [];
  }

  const lastIndex = path.length - 1;
  const start = path[0];
  const end = path[lastIndex];
  const [rowMin, columnMin] = [
    Math.min(start[0], end[0]),
    Math.min(start[1], end[1]),
  ];
  const [rowMax, columnMax] = [
    Math.max(start[0], end[0]),
    Math.max(start[1], end[1]),
  ];

  /** @type {Array<[number, number]>} */
  const resultSet = [];
  for (let row = rowMin; row <= rowMax; row += 1) {
    for (let column = columnMin; column <= columnMax; column += 1) {
      resultSet.push([row, column]);
    }
  }

  return resultSet;
};

/**
 * Computes the points contained within a closed path (including the path
 * itself).
 *
 * This flood-fill algorithm does not handle self-intersections using the
 * traditional odd-even method. All points "trapped" by the path in all
 * directions are considered contained.
 *
 * @param {Array<[number, number]>} rawPath
 * @returns {Array<[number, number]>}
 */
const getContainedPoints = (rawPath) => {
  if (rawPath.length <= 1) {
    return rawPath;
  }

  // See if the start and end of the path are not equal (i.e. path not closed).
  const lastPoint = rawPath[rawPath.length - 1];
  const firstPoint = rawPath[0];
  const path = rawPath.concat(
    interpolatePoints(lastPoint[0], lastPoint[1], firstPoint[0], firstPoint[1])
  );

  // Compute the bounding box and path set for the closed loop.
  let [minRow, minColumn] = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  let [maxRow, maxColumn] = [0, 0];
  /** @type {Record<string, [number, number]>} */
  const pathSet = {};
  for (const [row, column] of path) {
    [minRow, minColumn] = [Math.min(minRow, row), Math.min(minColumn, column)];
    [maxRow, maxColumn] = [Math.max(maxRow, row), Math.max(maxColumn, column)];
    pathSet[[row, column].toString()] = [row, column];
  }

  // Iteratively compute cell containment by flood-filling the box.
  // This is super ugly in JavaScript...
  /** @type {Record<string, [number, number]>} */
  const containedSet = Object.assign({}, pathSet);
  /** @type {Record<string, boolean>} */
  const seenSet = {};
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if ([row, column].toString() in seenSet) {
        continue;
      } else if ([row, column].toString() in pathSet) {
        continue;
      }

      let outOfBounds = false;
      /** @type {Record<string, boolean>} */
      const seenHereSet = {};
      /** @type {Record<string, [number, number]>} */
      const valueSet = {};
      /** @type {Array<[number, number]>} */
      const stack = [[row, column]];
      while (stack.length > 0) {
        const current = stack.pop();
        if (current === undefined) {
          continue;
        }
        if (current.toString() in seenHereSet) {
          continue;
        }
        seenHereSet[current.toString()] = true;
        valueSet[current.toString()] = current;
        for (const neighbor of [
          [current[0] - 1, current[1]],
          [current[0] + 1, current[1]],
          [current[0], current[1] - 1],
          [current[0], current[1] + 1],
        ]) {
          if (
            neighbor[0] < minRow ||
            neighbor[0] > maxRow ||
            neighbor[1] < minColumn ||
            neighbor[1] > maxColumn
          ) {
            outOfBounds = true;
          } else if (neighbor.toString() in pathSet) {
            continue;
          } else {
            stack.push(/** @type {[number, number]} */ (neighbor));
          }
        }
      }
      Object.assign(seenSet, seenHereSet);
      if (!outOfBounds) {
        Object.assign(containedSet, valueSet);
      }
    }
  }

  return Object.values(containedSet);
};

/**
 * Fits the dimensions of the given element in terms of grid characters it can
 * contain (based on its internal font size).
 *
 * @param {HTMLElement} element
 * @returns {[number, number]}
 */
const fitCharacterDimensions = (element) => {
  // Hacky way to measure font width and height.
  // TODO: Is there a way to do this without side effects?
  const elementHackId = "get-character-dimensions-measure";
  const elementHack = document.createElement("span");
  elementHack.id = elementHackId;
  elementHack.innerHTML = "X";
  elementHack.className = CELL_CLASS_NAME;
  elementHack.style.borderTop = "none";
  elementHack.style.borderLeft = "none";
  element.style.maxWidth = "unset";
  element.style.minWidth = "unset";
  element.style.maxHeight = "unset";
  element.style.minHeight = "unset";
  element.innerHTML = "";
  element.appendChild(elementHack);
  const characterWidth = elementHack.getBoundingClientRect().width || 0;
  const characterHeight = elementHack.getBoundingClientRect().height || 0;
  const borderWidth = parseFloat(
    getComputedStyle(elementHack, null).borderRightWidth.slice(0, -2)
  );
  element.removeChild(elementHack);

  // Return element and height in terms of characters (floored).
  // Subtract one border from each dimension to account for initial borders.
  const elementWidth = element.getBoundingClientRect().width - borderWidth;
  const elementHeight = element.getBoundingClientRect().height - borderWidth;
  const width = elementWidth / characterWidth;
  element.style.maxWidth =
    elementWidth - (elementWidth % characterWidth) + borderWidth + "px";
  element.style.minWidth =
    elementWidth - (elementWidth % characterWidth) + borderWidth + "px";
  const height = elementHeight / characterHeight;
  element.style.maxHeight =
    elementHeight - (elementHeight % characterHeight) + borderWidth + "px";
  element.style.minHeight =
    elementHeight - (elementHeight % characterHeight) + borderWidth + "px";
  console.log(
    `Computed grid size: ${Math.floor(width)} by ${Math.floor(height)}`
  );
  return [Math.floor(width), Math.floor(height)];
};

/**
 * @typedef {string | null} MaybeValue
 */

/**
 * @typedef {[number, number, number, number] | null} MaybeRgba
 */

/** @typedef {EditMode[keyof EditMode]} EditModeValue */
const EditMode = /** @type {const} */ ({
  SelectHtml: "SelectHtml",
  SelectRaw: "SelectRaw",
  Draw: "Draw",
});

/** @typedef {FillMode[keyof FillMode]} FillModeValue */
const FillMode = /** @type {const} */ ({
  Fill: "Fill",
  Lasso: "Lasso",
});

/** @typedef {{
      editMode: EditModeValue,
      activeCharacter: string,
      activeColor: string,
      useFill: FillModeValue | false,
      useColor: boolean
    }} InteractionState
*/

let instanceCounter = 0;
class AsciiCanvas {
  /**
   * @param {HTMLPreElement} element
   * @param {Uint8Array | null} gridInitial
   * @param {Uint32Array | null} colorInitial
   * @param {() => InteractionState} getInteractionState
   * @param {(value: {grid: Uint8Array, color: Uint32Array}) => Promise<void>} store
   */
  constructor(element, gridInitial, colorInitial, getInteractionState, store) {
    const [width, height] = fitCharacterDimensions(element);

    /** @type {number} */
    this.instance = instanceCounter++;
    /** @type {HTMLPreElement} */
    this.element = element;
    /** @type {number} */
    this.width = Math.min(width, MAX_WIDTH);
    /** @type {number} */
    this.height = Math.min(height, MAX_HEIGHT);

    /** @type {typeof getInteractionState} */
    this.getInteractionState = getInteractionState;
    /** @type {typeof store} */
    this.store = store;

    if (gridInitial === null) {
      /** @type {Uint8Array} */
      this.grid = new Uint8Array(MAX_WIDTH * MAX_HEIGHT);
      this.grid.fill(ord("."));
    } else {
      this.grid = gridInitial;
    }
    if (colorInitial === null) {
      /** @type {Uint32Array} */
      this.color = new Uint32Array(MAX_WIDTH * MAX_HEIGHT);
      this.color.fill(rgbaToUint32(0, 0, 0, 1));
    } else {
      this.color = colorInitial;
    }
    this.renderGridInternal();

    /** @type {Uint8Array} */
    this.gridScratch = new Uint8Array(this.grid);
    /** @type {Uint32Array} */
    this.colorScratch = new Uint32Array(this.color);
    this.flush();

    // Handle canvas resizing:
    let runningResizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(runningResizeTimeout);
      runningResizeTimeout = setTimeout(() => {
        const [newWidth, newHeight] = fitCharacterDimensions(this.element);
        this.width = newWidth;
        this.height = newHeight;
        this.renderGridInternal();
      }, 0);
    });

    // Listener state.
    /** @type {Record<number, boolean>} */
    this.pathStarted = {};
    /** @type {Record<number, Array<[number, number]>>} */
    this.paths = {};
    this.listenOnce();
  }

  /**
   * @param {number} row
   * @param {number} column
   * @returns {number}
   */
  rowColToIndex(row, column) {
    return row * MAX_WIDTH + column;
  }

  /**
   * @param {number} row
   * @param {number} column
   * @returns {string}
   */
  getCellId(row, column) {
    return `grid-${this.instance}-${row}-${column}`;
  }

  /**
   * @param {string} id
   * @returns {[number, number]}
   */
  parseCellId(id) {
    const parts = id.split("-");
    return [parseInt(parts[2]), parseInt(parts[3])];
  }

  /**
   * @param {number} row
   * @param {number} column
   * @returns {HTMLElement | null}
   */
  getCell(row, column) {
    const cellId = this.getCellId(row, column);
    const cell = document.getElementById(cellId);
    return cell;
  }

  /**
   * Forces a full re-render of the internal ASCII grid. If the canvas height
   * and width are large, this method can become very expensive due to DOM nodes
   * being deleted and re-created.
   *
   * This method should only be used on initialization or if the grid is
   * resized.
   */
  renderGridInternal() {
    const newElement = this.element.cloneNode();
    for (let row = 0; row < this.height; row += 1) {
      for (let column = 0; column < this.width; column += 1) {
        const index = this.rowColToIndex(row, column);
        const span = document.createElement("span");
        span.id = this.getCellId(row, column);
        span.style.color = uint32ToRgbaString(this.color[index]);
        span.innerHTML = chr(this.grid[index]);
        span.className = CELL_CLASS_NAME;
        if (row !== 0) {
          span.style.borderTop = "none";
        }
        if (column !== 0) {
          span.style.borderLeft = "none";
        }
        newElement.appendChild(span);
      }
      newElement.appendChild(new Text("\n"));
    }
    this.element.replaceWith(newElement);
    this.element = /** @type {HTMLPreElement} */ (newElement);
    this.listen();
  }

  /**
   * Sets the character and/or color for the given row and column. This call
   * will batch the mutation to be executed the next time `flush` is called.
   *
   * @param {number} row
   * @param {number} column
   * @param {string | null} value
   * @param {[number, number, number, number] | null} color
   */
  set(row, column, value, color) {
    const index = this.rowColToIndex(row, column);
    if (value !== null) {
      this.gridScratch[index] = ord(value);
    }
    if (color !== null) {
      this.colorScratch[index] = rgbaToUint32(...color);
    }
  }

  /**
   * @param {(row: number, column: number) => [MaybeValue, MaybeRgba]} transform
   */
  range(transform) {
    for (let row = 0; row < this.height; row += 1) {
      for (let column = 0; column < this.width; column += 1) {
        this.set(row, column, ...transform(row, column));
      }
    }
  }

  /**
   * Resets the grid to its default state. Note that the mutation must still be
   * flushed.
   */
  reset() {
    this.gridScratch.fill(ord("."));
    this.colorScratch.fill(rgbaToUint32(0, 0, 0, 1));
  }

  /**
   * Flushes any pending grid or color mutations to the DOM.
   */
  flush(shouldStore = true) {
    for (let row = 0; row < this.height; row += 1) {
      for (let column = 0; column < this.width; column += 1) {
        const index = this.rowColToIndex(row, column);
        const newValue = this.gridScratch[index];
        const newColor = this.colorScratch[index];

        /** @type {HTMLElement | null | undefined} */
        let cell = undefined;

        // Update cell value if necessary.
        if (this.grid[index] !== newValue) {
          this.grid[index] = newValue;
          if (cell === undefined) {
            cell = this.getCell(row, column);
          }
          if (cell !== null) {
            cell.innerHTML = chr(newValue);
          }
        }

        // Update cell color if necessary.
        if (this.color[index] !== newColor) {
          this.color[index] = newColor;
          if (cell === undefined) {
            cell = this.getCell(row, column);
          }
          if (cell !== null) {
            cell.style.color = uint32ToRgbaString(newColor);
          }
        }
      }
    }

    if (shouldStore) {
      this.store({ grid: this.grid, color: this.color });
    }
  }

  /**
   * Highlights cells according to the following procedure:
   * 1. Find all cells with the desired highlight classes
   * 2. Add the desired classes to the specified cells and remove any other
   *    highlight classes
   * 3. For any cells matched in Step 1 but not in Step 2, remove the desired
   *    classes
   *
   * @param {Array<[number, number]>} cellPositions
   * @param {Array<HighlightClassValue>} classesToSync
   */
  syncEnabledHighlights(cellPositions, classesToSync) {
    /** @type {Record<string, boolean>} */
    const currentElementIds = {};
    const highlightSelector = classesToSync
      .map((highlightClass) => `.${CELL_CLASS_NAME}.${highlightClass}`)
      .join(",");
    for (const cell of document.querySelectorAll(highlightSelector)) {
      currentElementIds[cell.id] = true;
    }

    /** @type {Record<string, boolean>} */
    const newElementIds = {};
    const allClasses = Object.values(HighlightClass);
    for (const [row, column] of cellPositions) {
      const cell = this.getCell(row, column);
      if (cell !== null) {
        cell.classList.remove(...allClasses);
        cell.classList.add(...classesToSync);
        newElementIds[cell.id] = true;
      }
    }
    for (const cellId in currentElementIds) {
      if (!newElementIds[cellId]) {
        const cell = document.getElementById(cellId);
        if (cell !== null) {
          cell.classList.remove(...classesToSync);
        }
      }
    }
  }

  /**
   * Sets up listeners for the current canvas that never get removed.
   */
  listenOnce() {
    window.addEventListener(
      "pointerup",
      (/** @type {PointerEvent} */ event) => {
        delete this.pathStarted[event.pointerId];
        delete this.paths[event.pointerId];
        this.syncEnabledHighlights([], Object.values(HighlightClass));
      }
    );
  }

  /**
   * Sets up listeners for the current canvas. This must be called with each
   * fresh instance of the canvas (e.g. after `renderGridInternal`).
   */
  listen() {
    const cells = this.element.getElementsByClassName(CELL_CLASS_NAME);
    for (const cell of cells) {
      // Event: Pointer pressed down in cell.
      cell.addEventListener("pointerdown", (rawEvent) => {
        const event = /** @type {PointerEvent} */ (rawEvent);
        if (event.pointerType === "mouse" && event.button !== 0) {
          // Ignore left click.
          return;
        }
        const target = /** @type {HTMLSpanElement} */ (event.target);
        target.releasePointerCapture(event.pointerId);
        this.pathStarted[event.pointerId] = true;
        this.paths[event.pointerId] = [];
      });

      // Event: Pointer enters cell.
      cell.addEventListener("pointerenter", (rawEvent) => {
        const event = /** @type {PointerEvent} */ (rawEvent);
        const [row, column] = this.parseCellId(
          /** @type {HTMLSpanElement} */ (event.target).id
        );

        // Update tracked path (or abort if no pointer is down):
        if (!this.pathStarted[event.pointerId]) {
          // We still want to just highlight the current cell.
          this.syncEnabledHighlights(
            [[row, column]],
            [HighlightClass.Selection]
          );
          return;
        }
        /** @type {Array<[number, number]>} */
        let pathHere = [];
        if (this.paths[event.pointerId].length > 0) {
          const lastIndex = this.paths[event.pointerId].length - 1;
          pathHere.push(
            ...interpolatePoints(
              this.paths[event.pointerId][lastIndex][0],
              this.paths[event.pointerId][lastIndex][1],
              row,
              column
            )
          );
        }
        pathHere.push([row, column]);
        this.paths[event.pointerId].push(...pathHere);

        // Run contextual updates:
        const state = this.getInteractionState();
        // Contextual Update: Draw Mode + No Fill Mode.
        // Action: Highlight Cell + Update Cell.
        if (state.editMode === EditMode.Draw && !state.useFill) {
          this.syncEnabledHighlights(
            [[row, column]],
            [HighlightClass.Selection]
          );
          const color = hexToRgba(state.activeColor);
          for (const [row, column] of pathHere) {
            this.set(
              row,
              column,
              state.useColor ? null : state.activeCharacter,
              [color.r, color.g, color.b, color.a]
            );
          }
          this.flush();
        }
        // Contextual Update: Draw Mode + Fill Mode Fill OR Selection Mode
        // Action: Highlight Range.
        else if (
          state.editMode !== EditMode.Draw ||
          state.useFill === FillMode.Fill
        ) {
          const selectionPoints = getRectanglePoints(
            this.paths[event.pointerId]
          );
          this.syncEnabledHighlights(selectionPoints, [
            HighlightClass.Selection,
          ]);
        }
        // Contextual Update: Draw Mode + Fill Mode Lasso
        // Action: Highlight Lasso Area.
        else if (
          state.editMode !== EditMode.Draw ||
          state.useFill === FillMode.Lasso
        ) {
          const areaPoints = getContainedPoints(this.paths[event.pointerId]);
          this.syncEnabledHighlights(areaPoints, [HighlightClass.Selection]);
          this.syncEnabledHighlights(this.paths[event.pointerId], [
            HighlightClass.Boundary,
          ]);
        }
      });

      // Event: Pointer enters cell.
      cell.addEventListener("pointerleave", (rawEvent) => {
        const event = /** @type {PointerEvent} */ (rawEvent);
        const [row, column] = this.parseCellId(
          /** @type {HTMLSpanElement} */ (event.target).id
        );

        // Run contextual updates:
        const state = this.getInteractionState();
        // Contextual Update: Draw Mode + No Fill Mode OR No Path.
        // Action: Un-Highlight Cell.
        if (
          !this.pathStarted[event.pointerId] ||
          (state.editMode === EditMode.Draw && !state.useFill)
        ) {
          this.syncEnabledHighlights([], Object.values(HighlightClass));
        }
      });

      // Event: Pointer releases up in cell.
      cell.addEventListener("pointerup", (rawEvent) => {
        const event = /** @type {PointerEvent} */ (rawEvent);
        event.stopPropagation();
        const [row, column] = this.parseCellId(
          /** @type {HTMLSpanElement} */ (event.target).id
        );

        // Run contextual updates:
        const state = this.getInteractionState();
        // Contextual Update: Draw Mode + Fill Mode Fill.
        // Action: Un-Highlight Range + Update Range.
        if (
          state.editMode !== EditMode.Draw ||
          state.useFill === FillMode.Fill
        ) {
          this.syncEnabledHighlights([], Object.values(HighlightClass));
          const selectionPoints = getRectanglePoints(
            this.paths[event.pointerId]
          );
          const color = hexToRgba(state.activeColor);
          for (const [row, column] of selectionPoints) {
            this.set(
              row,
              column,
              state.useColor ? null : state.activeCharacter,
              [color.r, color.g, color.b, color.a]
            );
          }
          this.flush();
        }
        // Contextual Update: Draw Mode + Fill Mode Lasso
        // Action: Un-Highlight Area + Update Area.
        else if (
          state.editMode !== EditMode.Draw ||
          state.useFill === FillMode.Lasso
        ) {
          this.syncEnabledHighlights([], Object.values(HighlightClass));
          const areaPoints = getContainedPoints(this.paths[event.pointerId]);
          const color = hexToRgba(state.activeColor);
          for (const [row, column] of areaPoints) {
            this.set(
              row,
              column,
              state.useColor ? null : state.activeCharacter,
              [color.r, color.g, color.b, color.a]
            );
          }
          this.flush();
        }

        // Delete tracked path:
        delete this.pathStarted[event.pointerId];
        delete this.paths[event.pointerId];
      });
    }
  }
}

export {
  AsciiCanvas,
  EditMode,
  CHAR_SPACE as SPACE_CHAR,
  CHAR_CODE_SPACE as SPACE_CHAR_CODE,
  chr,
  ord,
};
