/* global sampleRate, AudioWorkletProcessor, registerProcessor */

/**
 * Realtime Audio Worklet Processor
 *
 * Captures raw Float32 samples from the microphone in a separate thread,
 * downsamples from native rate to 24kHz, converts to PCM16, and sends
 * ~100ms chunks (~2400 samples at 24kHz) to the main thread.
 *
 * EARS: RT-AUDIO-002, RT-AUDIO-003, RT-AUDIO-004, RT-AUDIO-013
 */

/**
 *
 */
class RealtimeAudioProcessor extends AudioWorkletProcessor {
    /**
     *
     */
    constructor() {
        super();
        this._buffer = [];
    }

    /**
     * @param {Float32Array[][]} inputs
     * @returns {boolean}
     */
    process(inputs) {
        const input = inputs[0];
        if (input.length > 0) {
            const float32 = input[0];
            const downsampled = this._downsample(float32, sampleRate, 24000);
            const pcm16 = this._float32ToPcm16(downsampled);
            for (let i = 0; i < pcm16.length; i++) {
                this._buffer.push(pcm16[i]);
            }
            const chunkSize = 2400;
            while (this._buffer.length >= chunkSize) {
                const chunk = this._buffer.splice(0, chunkSize);
                this.port.postMessage(new Int16Array(chunk));
            }
        }
        return true;
    }

    /**
     * @spec RT-AUDIO-004
     * @param {Float32Array} float32Array
     * @param {number} fromRate
     * @param {number} toRate
     * @returns {Float32Array}
     */
    _downsample(float32Array, fromRate, toRate) {
        if (fromRate === toRate) return float32Array;
        const ratio = fromRate / toRate;
        const newLength = Math.round(float32Array.length / ratio);
        const result = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            result[i] = float32Array[Math.round(i * ratio)];
        }
        return result;
    }

    /**
     * @spec RT-AUDIO-003
     * @param {Float32Array} float32Array
     * @returns {Int16Array}
     */
    _float32ToPcm16(float32Array) {
        const pcm16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm16;
    }
}

registerProcessor('realtime-audio-processor', RealtimeAudioProcessor);
