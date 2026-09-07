/**
 * Forwards microphone samples to the main thread in fixed-size blocks.
 *
 * This runs on the audio rendering thread, where the deadline is a few
 * milliseconds and missing it produces an audible glitch. So it does the least
 * possible work: copy samples into a block, post the block when it is full.
 * All analysis happens on the main thread, which is allowed to be late.
 *
 * Blocks of 2048 samples at 16 kHz are about 128 ms apart, which is frequent
 * enough for a responsive speaking indicator without flooding the message port.
 */
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(2048);
    this.index = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.block[this.index++] = channel[i];
      if (this.index === this.block.length) {
        // Transfer a copy: the worklet keeps reusing its own buffer.
        this.port.postMessage(this.block.slice(0));
        this.index = 0;
      }
    }
    return true;
  }
}

registerProcessor("voice-capture", VoiceCaptureProcessor);
