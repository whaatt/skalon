// @ts-check
const DEFAULT_CHAR = "?";
const DEFAULT_CHAR_CODE = DEFAULT_CHAR.charCodeAt(0);

/**
 * Returns the ASCII code for a printable character (or the code for `?` in all
 * other cases).
 *
 * @param {string} character The character to convert.
 * @returns {number}
 */
const ord = (character) => {
  if (character.length !== 1) {
    return DEFAULT_CHAR_CODE;
  }
  const code = character.charCodeAt(0);
  if (code >= 32 && code <= 127) {
    return code;
  }
  return DEFAULT_CHAR_CODE;
};

/**
 * Returns the printable character for an ASCII code (or `?` in all other
 * cases).
 *
 * @param {number} code
 * @returns {string}
 */
const chr = (code) => {
  if (code >= 32 && code <= 127) {
    return String.fromCharCode(code);
  }
  return DEFAULT_CHAR;
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
 * @typedef {string | null} MaybeValue
 */

/**
 * @typedef {[number, number, number, number] | null} MaybeRgba
 */

/**
 * Class name for each grid cell.
 */
const CELL_CLASS_NAME = "ascii-canvas-cell";

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
  return [Math.floor(width), Math.floor(height)];
};

let instanceCounter = 0;
class AsciiCanvas {
  /**
   * @param {HTMLPreElement} element
   */
  constructor(element) {
    const [width, height] = fitCharacterDimensions(element);
    console.log(`Computed grid size: ${width} by ${height}`);

    /** @type {number} */
    this.instance = instanceCounter++;
    /** @type {HTMLPreElement} */
    this.element = element;
    /** @type {number} */
    this.width = width;
    /** @type {number} */
    this.height = height;

    /** @type {Uint8Array} */
    this.grid = new Uint8Array(this.width * this.height);
    /** @type {Uint32Array} */
    this.color = new Uint32Array(this.width * this.height);
    this.grid.fill(ord("."));
    this.color.fill(rgbaToUint32(0, 0, 0, 1));
    this.renderGridInternal();

    /** @type {Uint8Array} */
    this.gridScratch = new Uint8Array(this.grid);
    /** @type {Uint32Array} */
    this.colorScratch = new Uint32Array(this.color);
  }

  /**
   * @param {number} row
   * @param {number} column
   * @returns {number}
   */
  rowColToIndex(row, column) {
    return row * this.width + column;
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
   * This method should only be used if the grid is resized (currently not
   * supported).
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
   * Flushes any pending grid or color mutations to the DOM.
   */
  flush() {
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
  }
}

export { AsciiCanvas };
