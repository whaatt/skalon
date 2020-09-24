const DURATION_FOREVER = 999;
const GAIN_CHANGE_TIME_CONSTANT = 0.0001;

/**
 * A basic SoundFont-based polyphonic synthesizer.
 */
class Synth {
  constructor(audioContext, fontPlayer, instrument) {
    this.audioContext = audioContext;
    this.fontPlayer = fontPlayer;
    this.channelMaster = fontPlayer.createChannel(audioContext);
    this.channelMaster.output.connect(audioContext.destination);
    this.instrument = instrument;
    this.notes = {};
  }

  playNote(notePitch) {
    if (this.notes[notePitch] !== undefined) {
      this.stopNote(notePitch);
    }
    this.notes[notePitch] = this.fontPlayer.queueWaveTable(
      this.audioContext,
      this.audioContext.destination,
      this.instrument,
      0.0, // Start time.
      notePitch, // Pitch.
      DURATION_FOREVER,
      1.0 // Velocity.
    );
  }

  stopNote(notePitch) {
    if (this.notes[notePitch] === undefined) {
      return;
    }
    this.notes[notePitch].cancel();
    delete this.notes[notePitch];
  }

  clearNotes() {
    for (const notePitch of Object.keys(this.notes)) {
      this.notes[notePitch].cancel();
      delete this.notes[notePitch];
    }
  }

  /**
   * Parameter `volume` goes from 0.0 to 1.0.
   */
  setVolume(volume) {
    this.channelMaster.output.gain.setTargetAtTime(
      volume,
      0, // Start time.
      GAIN_CHANGE_TIME_CONSTANT
    );
  }
}

export { Synth };
