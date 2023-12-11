const OCTAVE_SIZE = 12;
const ROOTS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

// Maps `X` in `ROOTS` to MIDI note `X4` (e.g. `C` is mapped to 60 or `C4`).
const ROOT_BASE_NOTE = {};
ROOTS.forEach((root, index) => (ROOT_BASE_NOTE[root] = index + 60));

const SCALE_NOTES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  "Natural Minor": [0, 2, 3, 5, 7, 8, 10],
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "Pentatonic Major": [0, 2, 4, 7, 9],
  "Pentatonic Minor": [0, 3, 4, 7, 10],
  "Blues Major": [0, 2, 3, 4, 7, 9],
  "Blues Minor": [0, 3, 4, 5, 7, 10],
  Arabic: [0, 1, 4, 5, 7, 8, 11],
};

// A layout that starts with `[5, 7]` corresponds to a note ordering where `q`
// is in position 5 and `w` is in position 7. `KEY_TO_LAYOUT_INDEX` will return
// 1 for `w`, which indexes into the layout `[5, 7]` to give position `7`.
const KEY_TO_LAYOUT_INDEX = Object.fromEntries(
  "qwertyuiopasdfghjkl;zxcvbnm,./".split("").map((key, index) => [key, index])
);
const KEY_SET = new Set(Object.keys(KEY_TO_LAYOUT_INDEX));
const LAYOUT = {
  Rows: [...Array(30).keys()],
};
// In the note ordering, the current scale root's base note will always come in
// position 10.
const LAYOUT_ROOT_BASE_POSITION = 10;

/**
 * Euclidean modulo function.
 */
const mod = (n, m) => ((n % m) + m) % m;

class Mapper {
  constructor() {
    this.root = "C";
    this.scale = "Major";
    this.layout = "Rows";
  }

  getRoot() {
    return this.root;
  }

  setRoot(root) {
    // Argument must be a valid root.
    this.root = root;
  }

  getScale() {
    return this.scale;
  }

  setScale(scale) {
    // Argument must be a valid scale.
    this.scale = scale;
  }

  getMidiNote(key) {
    const rootBaseNote = ROOT_BASE_NOTE[this.root];
    const scaleNotes = SCALE_NOTES[this.scale];
    const layoutPosition = LAYOUT[this.layout][KEY_TO_LAYOUT_INDEX[key]];

    // Compute MIDI note such that `rootBaseNote` is in the
    // `LAYOUT_ROOT_BASE_POSITION`.
    const layoutPositionDeltaFromRoot =
      layoutPosition - LAYOUT_ROOT_BASE_POSITION;
    const noteDeltaFromRoot =
      Math.floor(layoutPositionDeltaFromRoot / scaleNotes.length) *
        OCTAVE_SIZE +
      scaleNotes[mod(layoutPositionDeltaFromRoot, scaleNotes.length)];
    const outputNote = rootBaseNote + noteDeltaFromRoot;

    // Saturate `outputNote` in the range [0, 127] (valid MIDI range).
    if (outputNote < 0) {
      return 0;
    } else if (outputNote > 127) {
      return 127;
    } else {
      return outputNote;
    }
  }
}

/*
 * Static Methods
 */

Mapper.getRoots = () => ROOTS;
Mapper.getScales = () => Object.keys(SCALE_NOTES);
Mapper.getKeys = () => KEY_SET;

export { Mapper };
