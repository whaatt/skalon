// @ts-check
import { hexToRgba } from "../../vendor/hex-to-rgba.js";

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
  Paste: "highlight-paste",
};

/**
 * Returns the ASCII code for a printable character (or the code for space in
 * all other cases).
 *
 * @param {string} character The character to convert.
 * @returns {number}
 */
const ord = (character) => {
  const code = character.codePointAt(0) || 0;
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
    return String.fromCodePoint(code);
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
 * Returns the corners for the rectangle defined by the start and end points of
 * path (especially when those points are not ordered ascending).
 *
 * @param {Array<[number, number]>} path
 * @returns {[[number, number],[number, number]]}
 */
const getRectangleCorners = (path) => {
  const lastIndex = path.length - 1;
  const start = path[0];
  const end = path[lastIndex];
  /** @type {[number, number]} */
  const minimum = [Math.min(start[0], end[0]), Math.min(start[1], end[1])];
  /** @type {[number, number]} */
  const maximum = [Math.max(start[0], end[0]), Math.max(start[1], end[1])];
  return [minimum, maximum];
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

  /** @type {Array<[number, number]>} */
  const resultSet = [];
  const [[rowMin, columnMin], [rowMax, columnMax]] = getRectangleCorners(path);
  for (let row = rowMin; row <= rowMax; row += 1) {
    for (let column = columnMin; column <= columnMax; column += 1) {
      resultSet.push([row, column]);
    }
  }

  return resultSet;
};

/**
 * Returns the bounding box for the passed path.
 *
 * @param {Array<[number, number]>} path
 * @returns {[[number, number], [number, number]] | null}
 */
const getBoundingBox = (path) => {
  if (path.length < 1) {
    return null;
  }

  let [minRow, minColumn] = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  let [maxRow, maxColumn] = [0, 0];
  for (const [row, column] of path) {
    [minRow, minColumn] = [Math.min(minRow, row), Math.min(minColumn, column)];
    [maxRow, maxColumn] = [Math.max(maxRow, row), Math.max(maxColumn, column)];
  }

  return [
    [minRow, minColumn],
    [maxRow, maxColumn],
  ];
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
  const boundingBox = getBoundingBox(path);
  if (boundingBox === null) {
    // Not expected:
    return rawPath;
  }
  const [[minRow, minColumn], [maxRow, maxColumn]] = boundingBox;
  /** @type {Record<string, [number, number]>} */
  const pathSet = {};
  for (const [row, column] of path) {
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
  // console.log(
  //   `Computed grid size: ${Math.floor(width)} by ${Math.floor(height)}`
  // );
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
  GrabHtml: "GrabHtml",
  GrabText: "GrabText",
  Draw: "Draw",
});

/** @typedef {FillMode[keyof FillMode]} FillModeValue */
const FillMode = /** @type {const} */ ({
  Fill: "Fill",
  Lasso: "Lasso",
  Bucket: "Bucket",
});

/** @typedef {MaskMode[keyof MaskMode]} MaskModeValue */
const MaskMode = /** @type {const} */ ({
  Color: "Color",
  Copy: "Copy",
});

// TODO: Encode mutual exclusion between certain fill and mask modes in the type
// system.
/** @typedef {{
      editMode: EditModeValue,
      activeCharacter: string,
      activeColor: string,
      useFill: FillModeValue | false,
      useMask: MaskModeValue | false,
      useErase: boolean,
      runningPaste: boolean,
      useDiagonalsForBucketFill: boolean
    }} InteractionState
*/

/** @typedef {{
      element: HTMLPreElement,
      gridInitial: Uint32Array | null,
      colorInitial: Uint32Array | null,
      getInteractionState: () => InteractionState,
      storeGridAndColor: (value: {grid: Uint32Array, color: Uint32Array}) => Promise<void>,
      runCopyFallback: (clipboardItem: ClipboardItem) => void
      onCopied: (editMode: EditModeValue) => void
      onNavigated: () => void
    }} AsciiCanvasParameters
*/

let instanceCounter = 0;
class AsciiCanvas {
  /**
   * @param {AsciiCanvasParameters} parameter
   */
  constructor({
    element,
    gridInitial,
    colorInitial,
    getInteractionState,
    storeGridAndColor,
    runCopyFallback,
    onCopied,
    onNavigated,
  }) {
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
    /** @type {typeof storeGridAndColor} */
    this.storeGridAndColor = storeGridAndColor;
    /** @type {typeof runCopyFallback} */
    this.runCopyFallback = runCopyFallback;
    /** @type {typeof onCopied} */
    this.onCopied = onCopied;
    /** @type {typeof onNavigated} */
    this.onNavigated = onNavigated;

    if (gridInitial === null) {
      /** @type {Uint32Array} */
      this.grid = new Uint32Array(MAX_WIDTH * MAX_HEIGHT);
      this.grid.fill(CHAR_CODE_SPACE);
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

    /** @type {Uint32Array} */
    this.gridScratch = new Uint32Array(this.grid);
    /** @type {Uint32Array} */
    this.colorScratch = new Uint32Array(this.color);
    /** @type {Array<[boolean, Array<[number, number, number | null, number | null]>]>} */
    this.undoStack = [];
    /** @type {Array<[boolean, Array<[number, number, number | null, number | null]>]>} */
    this.redoStack = [];
    /** @type {Array<Array<[number, number] | null>>} */
    this.pasteArea = [];
    /** @type {boolean} */
    this.showingPaste = false;
    this.flush({ forceSyncOnly: true });

    // Handle canvas resizing:
    /** @type {number} */
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
   * Computes the point set generated by running a flood fill from the given row
   * and column, including points if they match exactly on character and color.
   *
   * Note: This flood fill can be modified to include diagonal neighbors if an
   * appropriate modifier key is pressed.
   *
   * @param {number} row
   * @param {number} column
   * @returns {Array<[number, number]>}
   */
  getFloodPoints(row, column) {
    const targetCharacter = this.grid[this.rowColToIndex(row, column)];
    const targetColor = this.color[this.rowColToIndex(row, column)];

    /** @type {Record<string, boolean>} */
    const seenSet = {};
    /** @type {Array<[number, number]>} */
    const result = [];

    /** @type {Array<[number, number]>} */
    const stack = [[row, column]];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) {
        continue;
      }
      if (current.toString() in seenSet) {
        continue;
      }
      seenSet[current.toString()] = true;
      if (
        this.grid[this.rowColToIndex(...current)] !== targetCharacter ||
        (targetCharacter !== ord(" ") &&
          this.color[this.rowColToIndex(...current)] !== targetColor)
      ) {
        continue;
      }
      result.push(current);
      for (let dr = -1; dr < 2; dr += 1) {
        for (let dc = -1; dc < 2; dc += 1) {
          if (dr === 0 && dc === 0) {
            continue;
          }
          if (
            dr !== 0 &&
            dc !== 0 &&
            !this.getInteractionState().useDiagonalsForBucketFill
          ) {
            continue;
          }
          /** @type {[number, number]} */
          const neighbor = [current[0] + dr, current[1] + dc];
          if (
            neighbor[0] < 0 ||
            neighbor[0] >= this.height ||
            neighbor[1] < 0 ||
            neighbor[1] >= this.width
          ) {
            continue;
          }
          stack.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * Imports the passed string as a paste area for Paste Mode.
   *
   * @param {string} text
   */
  importPasteArea(text) {
    const state = this.getInteractionState();
    const color = hexToRgba(state.activeColor);
    this.pasteArea = text
      .split("\n")
      .map((line) =>
        line
          .split("")
          .map((character) => [
            ord(character),
            rgbaToUint32(color.r, color.g, color.b, color.a),
          ])
      );
    const maxLength = this.pasteArea.reduce(
      (maxLength, current) => Math.max(maxLength, current.length),
      0
    );
    // Pad each line to the max length so the paste area is a rectangle (as the
    // code is expecting).
    for (const line of this.pasteArea) {
      if (line.length < maxLength) {
        line.push(
          ...Array.apply(null, Array(maxLength - line.length)).map(() => null)
        );
      }
    }
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
   * @param {[[number, number],[number, number]]} range
   * @returns {string}
   */
  renderRangeToMarkup(range) {
    const newElement = document.createElement("pre");
    for (let row = range[0][0]; row <= range[1][0]; row += 1) {
      for (let column = range[0][1]; column <= range[1][1]; column += 1) {
        const index = this.rowColToIndex(row, column);
        const span = document.createElement("span");
        span.style.color = uint32ToRgbaString(this.color[index]);
        span.innerHTML = chr(this.grid[index]);
        newElement.appendChild(span);
      }
      newElement.appendChild(new Text("\n"));
    }
    return newElement.outerHTML;
  }

  /**
   * @param {[[number, number],[number, number]]} range
   * @returns {string}
   */
  renderRangeToRawText(range) {
    let rawText = "";
    for (let row = range[0][0]; row <= range[1][0]; row += 1) {
      for (let column = range[0][1]; column <= range[1][1]; column += 1) {
        const index = this.rowColToIndex(row, column);
        rawText += chr(this.grid[index]);
      }
      rawText += "\n";
    }
    return rawText;
  }

  /**
   * Sets the character and/or color for the given row and column. This call
   * will batch the mutation to be executed the next time `flush` is called.
   *
   * NOTE: This mutation needs flushing for application.
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
   * NOTE: This mutation needs flushing for application.
   *
   * @param {number} row
   * @param {number} column
   * @param {number | null} valueInternal
   * @param {number | null} colorInternal
   */
  setInternal(row, column, valueInternal, colorInternal) {
    const index = this.rowColToIndex(row, column);
    if (valueInternal !== null) {
      this.gridScratch[index] = valueInternal;
    }
    if (colorInternal !== null) {
      this.colorScratch[index] = colorInternal;
    }
  }

  /**
   * NOTE: This mutation needs flushing for application.
   *
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
   * Resets the grid to its default state.
   *
   * NOTE: This mutation needs flushing for application.
   */
  reset() {
    this.gridScratch.fill(CHAR_CODE_SPACE);
    this.colorScratch.fill(rgbaToUint32(0, 0, 0, 1));
  }

  /**
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Pops and applies a  from the undo stack.
   *
   * NOTE: This mutation needs flushing for application (when a corresponding
   * `redo` operation will be generated).
   */
  undo() {
    const undoGroup = this.undoStack.pop();
    if (undoGroup === undefined) {
      return;
    }
    for (const [row, column, value, color] of undoGroup[1]) {
      this.setInternal(row, column, value, color);
    }
  }

  /**
   * @returns {boolean}
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Pops and applies a group of operations from the redo stack.
   *
   * NOTE: This mutation needs flushing for application (when a corresponding
   * `undo` operation will be generated).
   */
  redo() {
    const redoGroup = this.redoStack.pop();
    if (redoGroup === undefined) {
      return;
    }
    for (const [row, column, value, color] of redoGroup[1]) {
      this.setInternal(row, column, value, color);
    }
  }

  /**
   * @param {number} row
   * @param {number} column
   * @param {number} value
   */
  flushCellValue(row, column, value) {
    const cell = this.getCell(row, column);
    if (cell !== null) {
      cell.innerHTML = chr(value);
    }
  }

  /**
   * @param {number} row
   * @param {number} column
   * @param {number} color
   */
  flushCellColor(row, column, color) {
    const cell = this.getCell(row, column);
    if (cell !== null) {
      cell.style.color = uint32ToRgbaString(color);
    }
  }

  /**
   * Flushes any pending grid or color mutations to the DOM and updates the
   * undo/redo stacks.
   *
   * @optional @param {{
   *   forceSyncOnly?: boolean,
   *   isUndo?: boolean,
   *   isRedo?: boolean,
   *   isReset?: boolean
   * }} parameter
   */
  flush({ forceSyncOnly, isUndo, isRedo, isReset } = {}) {
    /** @type {Array<[number, number, number | null, number | null]>} */
    const inverseOperations = [];
    for (let row = 0; row < this.height; row += 1) {
      for (let column = 0; column < this.width; column += 1) {
        const index = this.rowColToIndex(row, column);
        const newValue = this.gridScratch[index];
        const newColor = this.colorScratch[index];

        // Queue an inverse operation only for changed cells.
        if (
          this.grid[index] !== newValue ||
          this.color[index] !== newColor ||
          forceSyncOnly
        ) {
          inverseOperations.push([row, column, null, null]);
        }

        // Update cell value if necessary.
        if (this.grid[index] !== newValue || forceSyncOnly) {
          inverseOperations[inverseOperations.length - 1][2] = this.grid[index];
          this.grid[index] = newValue;
          this.flushCellValue(row, column, newValue);
        }

        // Update cell color if necessary.
        if (this.color[index] !== newColor || forceSyncOnly) {
          inverseOperations[inverseOperations.length - 1][3] =
            this.color[index];
          this.color[index] = newColor;
          this.flushCellColor(row, column, newColor);
        }
      }
    }

    // Persist grid to storage and update the undo/redo stacks.
    this.storeGridAndColor({ grid: this.grid, color: this.color });
    if (forceSyncOnly) {
      return;
    }
    if (isUndo) {
      // Note that we never indicate append when transforming to the redo stack.
      this.redoStack.push([false, inverseOperations]);
    } else if (isRedo) {
      // Note that we never indicate append when transforming to the undo stack.
      this.undoStack.push([false, inverseOperations]);
    } else {
      if (
        this.undoStack.length > 0 &&
        this.undoStack[this.undoStack.length - 1][0]
      ) {
        // Append to the group on top of the stack if it indicates doing so.
        this.undoStack[this.undoStack.length - 1][1].push(...inverseOperations);
      } else {
        // Otherwise, add to the stack.
        this.undoStack.push([
          // Indicate append if we are in free-hand mode, which makes for a more
          // intuitive undo operation. (Ignore resets for this purpose, which
          // behave like their own fill mode but are not actually a fill mode.)
          !this.getInteractionState().useFill && !isReset,
          inverseOperations,
        ]);
      }
      this.redoStack = [];
    }
    this.onNavigated();
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
    const highlightCells = document.querySelectorAll(highlightSelector);
    for (let i = 0; i < highlightCells.length; i += 1) {
      const cell = highlightCells[i];
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
    // Event: Pointer pressed down anywhere.
    window.addEventListener("pointerdown", (rawEvent) => {
      const event = /** @type {PointerEvent} */ (rawEvent);
      if (event.pointerType === "mouse" && event.button !== 0) {
        // Ignore left click.
        return;
      }
      const target = /** @type {HTMLElement} */ (event.target);
      target.releasePointerCapture(event.pointerId);
      // Paste mode special case (don't start a path):
      const state = this.getInteractionState();
      if (state.runningPaste && state.editMode === EditMode.Draw) {
        return;
      }
      this.pathStarted[event.pointerId] = true;
      this.paths[event.pointerId] = [];
    });

    // Event: Pointer releases up anywhere.
    window.addEventListener("pointerup", (rawEvent) => {
      const event = /** @type {PointerEvent} */ (rawEvent);
      // Ignore pointer releases if no path has been traversed.
      if (
        !this.pathStarted[event.pointerId] ||
        this.paths[event.pointerId].length === 0
      ) {
        delete this.pathStarted[event.pointerId];
        delete this.paths[event.pointerId];
        return;
      }

      // Run contextual updates:
      const state = this.getInteractionState();
      // Contextual Update: Draw Mode + No Fill Mode.
      // Action: Remove Stack Append Indication.
      if (state.editMode === EditMode.Draw && !state.useFill) {
        if (this.undoStack.length > 0) {
          this.undoStack[this.undoStack.length - 1][0] = false;
        }
      }
      // Contextual Update: Draw Mode + Fill Mode Fill.
      // Action: Un-Highlight Range + Update Range.
      else if (
        state.editMode === EditMode.Draw &&
        state.useFill === FillMode.Fill
      ) {
        this.syncEnabledHighlights([], Object.values(HighlightClass));
        const selectionPoints = getRectanglePoints(this.paths[event.pointerId]);
        const color = hexToRgba(state.activeColor);
        // Create a new paste area for the Copy Mask Mode; otherwise, just
        // perform a regular set.
        if (state.useMask === MaskMode.Copy) {
          this.pasteArea = [];
          const [start, end] = getRectangleCorners(this.paths[event.pointerId]);
          for (let row = start[0]; row <= end[0]; row += 1) {
            this.pasteArea.push([]);
            for (let column = start[1]; column <= end[1]; column += 1) {
              const index = this.rowColToIndex(row, column);
              this.pasteArea[this.pasteArea.length - 1].push([
                this.grid[index],
                this.color[index],
              ]);
            }
          }
          this.onCopied(state.editMode);
        } else {
          for (const [row, column] of selectionPoints) {
            this.set(
              row,
              column,
              state.useMask === MaskMode.Color ? null : state.activeCharacter,
              [color.r, color.g, color.b, color.a]
            );
          }
          this.flush();
        }
      }
      // Contextual Update: Draw Mode + Fill Mode Lasso
      // Action: Un-Highlight Area + Update Area.
      else if (
        state.editMode === EditMode.Draw &&
        state.useFill === FillMode.Lasso
      ) {
        this.syncEnabledHighlights([], Object.values(HighlightClass));
        const areaPoints = getContainedPoints(this.paths[event.pointerId]);
        const color = hexToRgba(state.activeColor);
        // TODO: De-duplicate this logic with Bucket mode.
        // Create a new paste area for the Copy Mask Mode; otherwise, just
        // perform a regular set. For the lasso paste area, we use all lasso
        // points from the relevant rectangular bounding box (and mark unset
        // points with nulls).
        if (state.useMask === MaskMode.Copy) {
          this.pasteArea = [];
          const boundingBox = getBoundingBox(areaPoints);
          if (boundingBox === null) {
            // Not expected:
            return;
          }
          const [start, end] = boundingBox;
          /** @type {Record<string, boolean>} */
          const areaPointSet = {};
          for (const point of areaPoints) {
            areaPointSet[point.toString()] = true;
          }
          for (let row = start[0]; row <= end[0]; row += 1) {
            this.pasteArea.push([]);
            for (let column = start[1]; column <= end[1]; column += 1) {
              const index = this.rowColToIndex(row, column);
              if ([row, column].toString() in areaPointSet) {
                this.pasteArea[this.pasteArea.length - 1].push([
                  this.grid[index],
                  this.color[index],
                ]);
              } else {
                this.pasteArea[this.pasteArea.length - 1].push(null);
              }
            }
          }
          this.onCopied(state.editMode);
        } else {
          for (const [row, column] of areaPoints) {
            this.set(
              row,
              column,
              state.useMask === MaskMode.Color ? null : state.activeCharacter,
              [color.r, color.g, color.b, color.a]
            );
          }
          this.flush();
        }
      }
      // Contextual Update: Grab HTML Mode
      // Action: Un-Highlight Area + Clip Selection (as HTML).
      else if (state.editMode === EditMode.GrabHtml) {
        this.syncEnabledHighlights([], Object.values(HighlightClass));
        const markup = this.renderRangeToMarkup(
          getRectangleCorners(this.paths[event.pointerId])
        );
        const blobText = new Blob([markup], { type: "text/plain" });
        const blobHtml = new Blob([markup], { type: "text/html" });
        const item = new ClipboardItem({
          "text/plain": Promise.resolve(blobText),
          "text/html": Promise.resolve(blobHtml),
        });
        navigator.clipboard
          .write([item])
          .catch(() => this.runCopyFallback(item))
          .then(() => this.onCopied(state.editMode));
      }
      // Contextual Update: Grab Text Mode
      // Action: Un-Highlight Area + Clip Selection (as Text).
      else if (state.editMode === EditMode.GrabText) {
        this.syncEnabledHighlights([], Object.values(HighlightClass));
        const text = this.renderRangeToRawText(
          getRectangleCorners(this.paths[event.pointerId])
        );
        const blobText = new Blob([text], { type: "text/plain" });
        const item = new ClipboardItem({
          "text/plain": Promise.resolve(blobText),
        });
        navigator.clipboard
          .write([item])
          .catch(() => this.runCopyFallback(item))
          .then(() => this.onCopied(state.editMode));
      }

      // Delete tracked path:
      delete this.pathStarted[event.pointerId];
      delete this.paths[event.pointerId];
    });
  }

  /**
   * Sets up listeners for the current canvas. This must be called with each
   * fresh instance of the canvas (e.g. after `renderGridInternal`).
   */
  listen() {
    const cells = this.element.getElementsByClassName(CELL_CLASS_NAME);
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      // Event: Pointer pressed down in cell.
      cell.addEventListener("pointerdown", (rawEvent) => {
        const event = /** @type {PointerEvent} */ (rawEvent);
        event.stopPropagation();
        if (event.pointerType === "mouse" && event.button !== 0) {
          // Ignore left click.
          return;
        }
        const [row, column] = this.parseCellId(
          /** @type {HTMLSpanElement} */ (event.target).id
        );
        const target = /** @type {HTMLElement} */ (event.target);
        target.releasePointerCapture(event.pointerId);
        // Paste mode special case (don't handle paths):
        const state = this.getInteractionState();
        if (state.runningPaste && state.editMode === EditMode.Draw) {
          return;
        }
        this.pathStarted[event.pointerId] = true;
        this.paths[event.pointerId] = [[row, column]];
      });

      // Event: Pointer enters cell.
      cell.addEventListener("pointerenter", (rawEvent) => {
        const event = /** @type {PointerEvent} */ (rawEvent);
        const [row, column] = this.parseCellId(
          /** @type {HTMLSpanElement} */ (event.target).id
        );

        // Paste mode special case:
        const state = this.getInteractionState();
        if (state.runningPaste && state.editMode === EditMode.Draw) {
          // Remove any highlights.
          this.syncEnabledHighlights([], Object.values(HighlightClass));
          if (this.pasteArea.length === 0 || this.pasteArea[0].length === 0) {
            return;
          }
          // Sync the grid state and apply mutations directly to the elements.
          this.flush({ forceSyncOnly: true });
          const rowBound = Math.min(row + this.pasteArea.length, MAX_WIDTH) - 1;
          const columnBound =
            Math.min(column + this.pasteArea[0].length, MAX_HEIGHT) - 1;
          /** @type {Array<[number, number]>} */
          const pasteCells = [];
          for (let pasteRow = row; pasteRow <= rowBound; pasteRow += 1) {
            for (
              let pasteColumn = column;
              pasteColumn <= columnBound;
              pasteColumn += 1
            ) {
              const areaRow = pasteRow - row;
              const areaColumn = pasteColumn - column;
              const pointSpec = this.pasteArea[areaRow][areaColumn];
              if (pointSpec !== null) {
                const [value, color] = pointSpec;
                this.flushCellValue(pasteRow, pasteColumn, value);
                this.flushCellColor(pasteRow, pasteColumn, color);
              }
              pasteCells.push([pasteRow, pasteColumn]);
            }
          }
          this.showingPaste = true;
          // Add paste highlights.
          this.syncEnabledHighlights(pasteCells, [HighlightClass.Paste]);
          return;
        }
        // Paste mode over (reset grid state):
        if (this.showingPaste) {
          // Remove any highlights.
          this.syncEnabledHighlights([], Object.values(HighlightClass));
          // Sync the grid state and apply mutations directly to the elements.
          this.flush({ forceSyncOnly: true });
          this.showingPaste = false;
        }

        // Update tracked path (or abort if no pointer is down):
        if (!this.pathStarted[event.pointerId]) {
          // Special-case highlight for bucket mode:
          // Contextual Update: Draw Mode + Fill Mode Bucket
          // Action: Highlight Bucket Area.
          if (
            state.editMode === EditMode.Draw &&
            state.useFill === FillMode.Bucket
          ) {
            const floodPoints = this.getFloodPoints(row, column);
            this.syncEnabledHighlights(floodPoints, [HighlightClass.Selection]);
          } else {
            // We still want to just highlight the current cell.
            this.syncEnabledHighlights(
              [[row, column]],
              [HighlightClass.Selection]
            );
          }
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
              state.useMask === MaskMode.Color ? null : state.activeCharacter,
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
          state.editMode === EditMode.Draw &&
          state.useFill === FillMode.Lasso
        ) {
          const areaPoints = getContainedPoints(this.paths[event.pointerId]);
          this.syncEnabledHighlights(areaPoints, [HighlightClass.Selection]);
          this.syncEnabledHighlights(this.paths[event.pointerId], [
            HighlightClass.Boundary,
          ]);
        }
      });

      // Event: Pointer leaves cell.
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

      // Event: Pointer is released in cell.
      cell.addEventListener("pointerup", (rawEvent) => {
        const event = /** @type {PointerEvent} */ (rawEvent);
        const [row, column] = this.parseCellId(
          /** @type {HTMLSpanElement} */ (event.target).id
        );

        // Paste mode special case:
        const state = this.getInteractionState();
        if (state.runningPaste && state.editMode === EditMode.Draw) {
          if (this.pasteArea.length === 0 || this.pasteArea[0].length === 0) {
            return;
          }
          // Re-sync the grid state before we apply the paste.
          this.flush({ forceSyncOnly: true });
          const rowBound = Math.min(row + this.pasteArea.length, MAX_WIDTH) - 1;
          const columnBound =
            Math.min(column + this.pasteArea[0].length, MAX_HEIGHT) - 1;
          for (let pasteRow = row; pasteRow <= rowBound; pasteRow += 1) {
            for (
              let pasteColumn = column;
              pasteColumn <= columnBound;
              pasteColumn += 1
            ) {
              const areaRow = pasteRow - row;
              const areaColumn = pasteColumn - column;
              const pointSpec = this.pasteArea[areaRow][areaColumn];
              if (pointSpec !== null) {
                const [value, color] = pointSpec;
                this.setInternal(pasteRow, pasteColumn, value, color);
              }
            }
          }
          this.flush();
          return;
        }

        // Run contextual updates:
        // Contextual Update: Draw Mode + No Fill Mode.
        // Action: Update Cell (edge case for click-only paths).
        if (state.editMode === EditMode.Draw && !state.useFill) {
          const color = hexToRgba(state.activeColor);
          this.set(
            row,
            column,
            state.useMask === MaskMode.Color ? null : state.activeCharacter,
            [color.r, color.g, color.b, color.a]
          );
          this.flush();
        }
        // Contextual Update: Draw Mode + Bucket Mode.
        // Action: Un-Highlight Bucket Area + Update Bucket Area.
        else if (
          state.editMode === EditMode.Draw &&
          state.useFill === FillMode.Bucket
        ) {
          this.syncEnabledHighlights([], Object.values(HighlightClass));
          const floodPoints = this.getFloodPoints(row, column);
          const color = hexToRgba(state.activeColor);
          // TODO: De-duplicate this logic with Lasso mode.
          // Create a new paste area for the Copy Mask Mode; otherwise, just
          // perform a regular set. For the lasso paste area, we use all lasso
          // points from the relevant rectangular bounding box (and mark unset
          // points with nulls).
          if (state.useMask === MaskMode.Copy) {
            this.pasteArea = [];
            const boundingBox = getBoundingBox(floodPoints);
            if (boundingBox === null) {
              // Not expected:
              return;
            }
            const [start, end] = boundingBox;
            /** @type {Record<string, boolean>} */
            const floodPointSet = {};
            for (const point of floodPoints) {
              floodPointSet[point.toString()] = true;
            }
            for (let row = start[0]; row <= end[0]; row += 1) {
              this.pasteArea.push([]);
              for (let column = start[1]; column <= end[1]; column += 1) {
                const index = this.rowColToIndex(row, column);
                if ([row, column].toString() in floodPointSet) {
                  this.pasteArea[this.pasteArea.length - 1].push([
                    this.grid[index],
                    this.color[index],
                  ]);
                } else {
                  this.pasteArea[this.pasteArea.length - 1].push(null);
                }
              }
            }
            this.onCopied(state.editMode);
          } else {
            for (const point of floodPoints) {
              this.set(
                point[0],
                point[1],
                state.useMask === MaskMode.Color ? null : state.activeCharacter,
                [color.r, color.g, color.b, color.a]
              );
            }
            this.flush();
          }
        }
      });
    }
  }
}

export {
  AsciiCanvas,
  CHAR_CODE_SPACE,
  CHAR_SPACE,
  EditMode,
  FillMode,
  HighlightClass,
  MaskMode,
  chr,
  ord,
};
