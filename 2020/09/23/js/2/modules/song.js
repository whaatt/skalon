// Relative to `index.html`.
const PRESET_TO_FILE = {
  "Auld Lang Syne": "audio/Auld Lang Syne.mid",
  Czardas: "audio/Czardas.mid",
  "Flight of the Bumblebee": "audio/Flight of the Bumblebee.mid",
  "La Vie En Rose": "audio/La Vie En Rose.mid",
  "Turkish March": "audio/Turkish March.mid",
  Twinkle: "audio/Twinkle.mid",
};

const Song = {};

/**
 * Parses a MIDI file buffer into a note vector.
 */
Song.getNotesForBuffer = (buffer) => {
  let midi;
  try {
    midi = new Midi(buffer);
  } catch (error) {
    // Should not happen.
    console.error(error);
    throw new Error("Could not parse MIDI buffer");
  }

  // Build a list of lists of notes for every time step (tick).
  const tickToPitches = {};
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      if (tickToPitches[note.ticks] === undefined) {
        tickToPitches[note.ticks] = [];
      }
      tickToPitches[note.ticks].push(note.midi);
    }
  }
  const ticks = Object.keys(tickToPitches)
    .map((tick) => parseInt(tick))
    .sort((x, y) => x - y);
  return ticks.map((tick) => tickToPitches[tick]);
};

/**
 * Parses a MIDI file into a note vector for a preset file.
 */
Song.getNotesForPreset = (preset) => {
  return new Promise((resolve, reject) => {
    const presetFile = PRESET_TO_FILE[preset];
    const fileRequest = new XMLHttpRequest();
    fileRequest.open("GET", presetFile, true);
    fileRequest.responseType = "arraybuffer";

    // Result handler for request:
    fileRequest.onload = () => {
      const buffer = fileRequest.response;
      if (!buffer || fileRequest.status !== 200) {
        // Should not happen.
        reject(new Error("Could not load preset file"));
        return;
      }
      try {
        const notes = Song.getNotesForBuffer(buffer);
        resolve(notes);
      } catch (error) {
        reject(error);
      }
    };

    // Should not happen.
    fileRequest.onerror = (error) => {
      console.error(error);
      reject(new Error("Could not load preset file"));
    };
    fileRequest.send(null);
  });
};

/**
 * Parses a MIDI file into a note vector for a local file.
 */
Song.getNotesForLocalFile = (localFile) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const notes = Song.getNotesForBuffer(event.target.result);
        resolve(notes);
      } catch (error) {
        reject(error);
      }
    };
    // Should not happen.
    reader.onerror = (error) => {
      console.error(error);
      reject(new Error("Could not load local file"));
    };
    reader.readAsArrayBuffer(localFile);
  });
};

Song.getPresets = () => Object.keys(PRESET_TO_FILE);

export { Song };
