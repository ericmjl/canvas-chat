# Audio Capture — EARS Specifications

**Feature:** Realtime Voice Agent — Audio Capture & Pipeline
**Parent:** [Realtime Voice Agent LLD](./LLD.md)

## Related Documents

- [Realtime Voice Agent LLD](./LLD.md)
- [Session Management EARS](./session-management-EARS.md)

---

## RT-AUDIO-001: Browser microphone access

- [ ] **RT-AUDIO-001**: When the user clicks the mic button to start recording, the system shall request microphone access via `getUserMedia({ audio: true })` and handle permission denial gracefully with a toast message.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — `startRecording()`

---

## RT-AUDIO-002: AudioWorklet processor

- [ ] **RT-AUDIO-002**: The system shall use an `AudioWorkletProcessor` to capture raw Float32 audio samples from the microphone in a separate thread, avoiding main-thread blocking.

**Location:** `src/canvas_chat/static/js/realtime-audio-worklet.js`

---

## RT-AUDIO-003: PCM16 conversion

- [ ] **RT-AUDIO-003**: The AudioWorklet shall convert Float32 samples to 16-bit PCM (PCM16) by clamping values to [-1.0, 1.0] and scaling to [-32768, 32767] before posting to the main thread.

**Location:** `src/canvas_chat/static/js/realtime-audio-worklet.js` — `float32ToPcm16()`

---

## RT-AUDIO-004: Downsampling to 24kHz

- [ ] **RT-AUDIO-004**: The system shall downsample the browser's native sample rate (44.1kHz or 48kHz) to 24kHz mono before sending audio to the provider, matching both OpenAI and Gemini input requirements.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — `downsample()` or in worklet

---

## RT-AUDIO-005: Base64 audio encoding

- [ ] **RT-AUDIO-005**: The system shall encode each PCM16 audio chunk as a base64 string and send it to the backend via WebSocket message `{ "type": "audio", "data": "<base64>" }`.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — audio chunk handler

---

## RT-AUDIO-006: Audio streaming to backend

- [ ] **RT-AUDIO-006**: The backend shall forward received base64-decoded PCM16 audio chunks directly to the active provider bridge's `send_audio()` method without buffering entire utterances.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` audio message handler

---

## RT-AUDIO-007: Input end signal

- [ ] **RT-AUDIO-007**: When the user toggles the mic button off (stops recording), the frontend shall send an `input_end` message, and the backend shall forward it to the provider as an end-of-user-turn signal.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — `stopRecording()`; `src/canvas_chat/app.py` — input_end handler

---

## RT-AUDIO-008: Microphone resource cleanup

- [ ] **RT-AUDIO-008**: When the recording stops or the session closes, the system shall release the microphone `MediaStream` and terminate the AudioWorklet to free hardware resources.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — `stopRecording()`, `disconnect()`

---

## RT-AUDIO-009: Provider speech-started visual feedback

- [ ] **RT-AUDIO-009**: When the provider signals that the user has started speaking (OpenAI `input_audio_buffer.speech_started` or equivalent Gemini event), the frontend shall update the mic button to show a "listening" visual state.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — provider event handler

---

## RT-AUDIO-010: Provider speech-stopped visual feedback

- [ ] **RT-AUDIO-010**: When the provider signals that the user has stopped speaking (OpenAI `input_audio_buffer.speech_stopped` or equivalent Gemini event), the frontend shall update the mic button to show a "processing" visual state.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — provider event handler

---

## RT-AUDIO-011: Audio capture error handling

- [ ] **RT-AUDIO-011**: If microphone access is denied, no audio device is found, or the AudioWorklet fails to initialize, the system shall display a toast message and disable the mic button for the current session.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — `startRecording()` error handling

---

## RT-AUDIO-012: Text input via WebSocket

- [ ] **RT-AUDIO-012**: When the user submits text while a realtime session is active, the frontend shall send `{ "type": "text", "content": "..." }` via WebSocket instead of opening a new HTTP request.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — text submit handler

---

## RT-AUDIO-013: Audio chunk size

- [ ] **RT-AUDIO-013**: The system shall send audio chunks at approximately 100ms intervals (roughly 2400 PCM16 samples at 24kHz, or ~4800 bytes), balancing latency with WebSocket message overhead.

**Location:** `src/canvas_chat/static/js/realtime-audio-worklet.js` — buffer size configuration

---

## RT-AUDIO-014: Worklet registration

- [ ] **RT-AUDIO-014**: The system shall register the `RealtimeAudioProcessor` worklet via `audioContext.audioWorklet.addModule()` on first mic activation, not at page load, to defer resource usage until needed.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — `startRecording()` worklet setup
