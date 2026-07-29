// audio-worklet-processor.js
// This AudioWorkletProcessor captures PCM audio data from the microphone,
// converts Float32 samples to 16‑bit signed integer (Int16) little‑endian,
// and posts the Int16 array to the main thread via the port.

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._sampleRate = sampleRate; // AudioWorkletProcessor global constant
  }

  // Convert a Float32Array (range -1..1) to Int16Array
  static floatTo16Bit(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      let s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  process(inputs, outputs, parameters) {
    // inputs is an array of input nodes; we only use the first channel of the first node.
    const inputChannelData = inputs[0][0];
    if (inputChannelData && inputChannelData.length > 0) {
      const int16 = PCMProcessor.floatTo16Bit(inputChannelData);
      // Transfer the Int16Array to the main thread.
      this.port.postMessage(int16);
    }
    // Returning true keeps the processor alive.
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
