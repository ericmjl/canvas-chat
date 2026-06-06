# Realtime Voice Agent — Low-Level Design

**Feature:** Realtime Voice-to-Canvas Agent
**Status:** Draft
**Created:** 2026-06-05
**Parent:** [Agentic Mode LLD](../agentic-mode/LLD.md)

## Related Documents

- [Agentic Mode LLD](../agentic-mode/LLD.md)
- [Session Management EARS](./session-management-EARS.md)
- [Audio Capture EARS](./audio-capture-EARS.md)
- [Provider Abstraction EARS](./provider-abstraction-EARS.md)

## 1. Overview

This feature promotes the existing `/agent` mode from a slash command to the **default interaction mode** for Canvas-Chat, and adds **voice input** as a first-class input method alongside text. The user speaks into a microphone; the model responds with **tool calls only** (no spoken reply) that manipulate the canvas — creating nodes, running searches, executing code, and navigating the viewport.

### Design Principles

1. **Agent as default mode** — Text input goes through the agent loop (same tool-calling behavior), not through the old single-turn chat flow. The input box becomes an agent prompt, not a chat message.
2. **Voice is an alternative input method** — Voice and text both produce the same agent behavior. The only difference is how the user's intent enters the system.
3. **Tool calls only, silent** — The realtime API response contains tool calls, not audio. The model never speaks back. Canvas changes are the only feedback.
4. **Provider-agnostic** — Both OpenAI and Gemini realtime APIs are supported through a common abstraction layer. Voice mode is independent of the text model picker; the backend selects the provider based on which API keys are available.
5. **Reuse existing tools** — The same `AGENT_TOOLS` and tool execution pipeline from `/agent` mode are reused. No parallel tool implementations.

### Key Difference from Standard Agent Mode

| Aspect | Standard Agent (`/agent` text) | Realtime Voice Agent |
|--------|-------------------------------|---------------------|
| Input | Text from input box | Audio stream (or text) |
| Transport | HTTP POST + SSE | WebSocket (bidirectional) |
| Response | SSE events (text + tool calls) | WebSocket events (tool calls only) |
| Latency | Request/response cycle | Streaming, low-latency |
| Session | Per-request | Persistent with 30s timeout |
| Model's voice output | N/A | Disabled — tool calls only |

## 2. Architecture

### 2.1 High-Level Flow

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Frontend    │     │  Backend     │     │  Provider APIs    │
│              │     │              │     │                  │
│  Mic Button  │────▶│  WebSocket   │────▶│  OpenAI Realtime │
│  Text Input  │────▶│  /ws/agent   │     │  API             │
│              │     │              │     │                  │
│  Canvas      │◀────│  Tool Exec   │     │  Gemini Live     │
│  (nodes/edges)│    │  + Events    │     │  API             │
│              │     │              │     │                  │
└──────────────┘     └──────────────┘     └──────────────────┘
```

### 2.2 Session Lifecycle

```text
1. User clicks mic button (or types text)
2. Frontend opens WebSocket connection to /ws/agent
3. Backend creates provider session (OpenAI or Gemini)
4. User speaks or types — audio/text sent via WebSocket
5. Provider returns tool calls (not audio)
6. Backend executes tools, sends canvas events to frontend
7. If 30 seconds of silence: auto-close with toast notification
8. User can click mic again to restart session
```

### 2.3 WebSocket Protocol

The backend exposes a single WebSocket endpoint that bridges the frontend to the provider's realtime API.

**Endpoint:** `ws://localhost:8000/ws/agent`

**Client → Server messages:**

```json
// Start session with config (voice is independent of text model picker)
{ "type": "session_start", "openai_api_key": "...", "gemini_api_key": "...", "base_url": "..." }

// Stream audio chunks (PCM16, 24kHz, mono)
{ "type": "audio", "data": "<base64-encoded PCM chunk>" }

// Text input (alternative to audio)
{ "type": "text", "content": "Search for recent papers on RAG" }

// Stop recording (user toggled mic off)
{ "type": "input_end" }

// Keep-alive (reset timeout timer)
{ "type": "ping" }

// Explicit close
{ "type": "close" }
```

**Server → Client messages:**

```json
// Session established
{ "type": "session_ready", "provider": "openai" }

// Tool execution events (same structure as SSE events from /api/agent)
{ "type": "set_parents", "data": ["node-id-1", "node-id-2"] }
{ "type": "tool_start", "data": { "tool": "search_web", "call_id": "...", "purpose": "..." } }
{ "type": "node_create", "data": { "type": "search", "ref": "search-latest", ... } }
{ "type": "tool_result", "data": { "call_id": "...", "tool": "search_web", "output": "..." } }

// Status events
{ "type": "listening", "data": { "status": "active" } }
{ "type": "processing", "data": { "status": "thinking" } }

// Timeout warning (at 20s silence, before 30s close)
{ "type": "timeout_warning", "data": { "seconds_remaining": 10 } }

// Session closed
{ "type": "session_closed", "data": { "reason": "timeout" } }

// Error
{ "type": "error", "data": { "message": "..." } }

// Pong
{ "type": "pong" }
```

### 2.4 Frontend: RealtimeAgentPlugin

A new `RealtimeAgentPlugin` (separate from `AgentFeature`, not extending it) that handles WebSocket-based realtime interaction. Shared canvas manipulation logic is extracted into standalone functions rather than inherited:

**Why separate, not extending:**

- `AgentFeature` is tightly coupled to the HTTP POST + SSE flow (`runAgent()` calls `fetch()`, uses `readSSEStream()`)
- `RealtimeAgentPlugin` manages WebSocket state, audio pipeline, and session lifecycle — orthogonal concerns
- Both plugins share canvas manipulation by calling the same standalone functions (extracted from `AgentFeature`)

**Shared functions to extract from `AgentFeature`** (into a new `agent-utils.js` module):

- `createNodeFromInstruction(instruction, parentId, ...)` — Node creation from SSE/WebSocket events
- `gatherViewportContext(graph, canvas)` — Viewport node serialization
- `executeCodeOnNode(nodeId, code, graph, canvas, pyodideRunner, saveSession)` — Code execution

Both `AgentFeature` and `RealtimeAgentPlugin` import from `agent-utils.js`. No code duplication.

```javascript
import { createNodeFromInstruction, gatherViewportContext, executeCodeOnNode } from './agent-utils.js';

class RealtimeAgentPlugin extends FeaturePlugin {
    // WebSocket connection state
    ws = null
    sessionActive = false
    audioStream = null
    refToNodeId = new Map()  // Session-scoped, persists across utterances

    // Mic button in input area
    getCanvasEventHandlers()
    onLoad()  // Register mic button, wire up audio capture

    // WebSocket lifecycle
    connect(openaiApiKey, geminiApiKey, baseUrl)
    disconnect()
    sendAudioChunk(base64Pcm)
    sendText(text)
    handleServerMessage(message)

    // Shared event processing (same logic as AgentFeature SSE handler)
    handleCanvasEvent(eventType, data)  // Dispatches set_parents, text, node_create, etc.

    // Audio capture
    startRecording()
    stopRecording()
    processAudioChunk(chunk)

    // Timeout management
    resetTimeout()
    startTimeoutTimer()
}
```

### 2.5 Backend: WebSocket Agent Endpoint

```python
@app.websocket("/ws/agent")
async def ws_agent(websocket: WebSocket):
    # 1. Accept connection
    # 2. Read session_start message (openai_api_key, gemini_api_key, base_url)
    # 3. Determine provider from available keys
    # 4. Create provider bridge (OpenAI or Gemini)
    # 5. Forward audio/text to provider
    # 6. Receive tool calls from provider
    # 7. Execute tools using existing _agent_execute_tool()
    # 8. Send canvas events back to client
    # 9. Manage 30s inactivity timeout
```

**Backend concurrency model:**

The backend maintains two concurrent WebSocket connections per user session. Two asyncio tasks run concurrently within the handler:

```python
async def ws_agent(websocket: WebSocket):
    await websocket.accept()
    # ... session setup ...

    await asyncio.gather(
        _forward_client_to_provider(websocket, bridge),   # Task 1: client → provider
        _forward_provider_to_client(bridge, websocket),    # Task 2: provider → client
    )
```

- **Task 1 (`_forward_client_to_provider`):** Reads messages from the client WebSocket, dispatches audio/text to the provider bridge, resets the inactivity timer on activity.
- **Task 2 (`_forward_provider_to_client`):** Reads `ProviderEvent` objects from `bridge.receive_events()`, executes tools, sends canvas events back to the client.
- Both tasks share a session state object (timeout timer, tool call counter, ref map).
- If either task ends (client disconnects, provider disconnects, timeout), the other is cancelled via `asyncio.gather()` exception handling.

**Resource scaling:** Each realtime session holds 2 WebSocket connections and 2 asyncio tasks. For a FastAPI/uvicorn server with default settings (~1000 concurrent connections), this supports ~500 concurrent realtime sessions. For Canvas-Chat's typical usage (single-user or small team), this is more than sufficient.

**Per-tool timeout:** Each tool execution has a 60-second timeout. If `_agent_execute_tool()` exceeds this, it's cancelled and an error tool result is sent to both the provider and the client. This prevents a stuck tool from holding the session open indefinitely.

```python
try:
    result = await asyncio.wait_for(
        _agent_execute_tool(tool_name, tool_args, request),
        timeout=60.0
    )
except asyncio.TimeoutError:
    result = {"type": "error", "content": "Tool execution timed out after 60s"}
```

### 2.6 Provider Abstraction Layer

Both providers are wrapped behind a common interface:

```python
class RealtimeProviderBridge(ABC):
    @abstractmethod
    async def connect(self, api_key: str, model: str, tools: list, system_prompt: str, base_url: str = None) -> None: ...

    @abstractmethod
    async def send_audio(self, pcm_chunk: bytes) -> None: ...

    @abstractmethod
    async def send_text(self, text: str) -> None: ...

    @abstractmethod
    async def send_input_end(self) -> None: ...

    @abstractmethod
    async def receive_events(self) -> AsyncGenerator[ProviderEvent, None]: ...

    @abstractmethod
    async def close(self) -> None: ...
```

**Provider-specific implementations:**

- `OpenAIRealtimeBridge` — Connects to OpenAI's realtime API via the `openai` Python SDK (`AsyncOpenAI.realtime.connect()`). Uses `gpt-realtime-2` model (hardcoded, not from text model picker). The SDK returns an `AsyncRealtimeConnectionManager` (async context manager) — use `manager.enter()` (alias for `__aenter__`) to get the connection, and `manager.__aexit__()` to close.
- `GeminiRealtimeBridge` — Connects to Gemini's Live API via the `google-genai` Python SDK (`client.aio.live.connect()`). Uses `gemini-3.1-flash-live-preview` model (hardcoded, not from text model picker). The SDK returns an `_AsyncGeneratorContextManager` — use `manager.__aenter__()` to get the session, and `manager.__aexit__()` to close.

### 2.7 Provider Routing

Voice mode is independent of the text model picker. The backend selects the provider based on which API keys are present in the `session_start` message:

| Keys present | Provider selected |
|--------------|-------------------|
| `openai_api_key` only | OpenAI Realtime 2 (`gpt-realtime-2`) |
| `gemini_api_key` only | Gemini Live API 3.1 (`gemini-3.1-flash-live-preview`) |
| Both keys | Prefer the provider matching the current text model's provider; fall back to OpenAI first, then Gemini |
| Neither key | Error — no API key available for any realtime provider |

The frontend sends both keys (when configured) so the backend can make the routing decision. The user never has to think about which provider handles voice — it "just works" based on their Settings configuration.

## 3. Audio Pipeline

### 3.1 Browser Audio Capture

```text
getUserMedia({ audio: true })
        │
        ▼
MediaRecorder (audio/webm;codecs=opus)
        │
        ▼
AudioContext + ScriptProcessor/AudioWorklet
        │
        ▼
Convert to PCM16, 24kHz, mono
        │
        ▼
Base64 encode → WebSocket { "type": "audio", "data": "..." }
```

**Why PCM16:** Both OpenAI and Gemini realtime APIs expect linear16 PCM at 24kHz mono. The browser's `MediaRecorder` produces compressed formats (Opus/WebM), so we use an `AudioWorklet` to capture raw samples and convert to PCM16.

### 3.2 Audio Worklet

A dedicated `AudioWorkletProcessor` runs in a separate thread to avoid blocking the main UI thread during audio processing:

```javascript
// realtime-audio-worklet.js
class RealtimeAudioProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0]; // Float32 samples
            const pcm16 = float32ToPcm16(channelData);
            this.port.postMessage(pcm16);
        }
        return true; // Keep alive
    }
}
```

### 3.3 Resampling

Browser `AudioContext` typically runs at 44.1kHz or 48kHz. We need 24kHz for both providers:

```javascript
function downsample(float32Array, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) return float32Array;
    const ratio = fromSampleRate / toSampleRate;
    const newLength = Math.round(float32Array.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        const index = Math.round(i * ratio);
        result[i] = float32Array[index];
    }
    return result;
}
```

## 4. UI Changes

### 4.1 Mic Toggle Button

A microphone button is added to the chat input area, positioned between the attach button and the textarea (or to the right of the send button):

```html
<button id="mic-btn" class="mic-btn" title="Toggle voice input">
    <svg><!-- microphone icon --></svg>
</button>
```

**States:**

| State | Visual | Behavior |
|-------|--------|----------|
| Inactive | Gray mic icon | Click to start session |
| Connecting | Pulsing yellow | Waiting for WebSocket + provider |
| Listening | Solid green with pulse animation | Audio streaming to provider |
| Processing | Spinning indicator | Provider is thinking / executing tools |
| Error | Red icon | Session failed, click to retry |

### 4.2 Session Status Indicator

When a realtime session is active, a small status bar appears above the input area:

```html
<div id="realtime-status" class="realtime-status">
    <span class="status-dot active"></span>
    <span>Realtime session active</span>
    <span class="timeout-indicator">30s</span>
</div>
```

The timeout indicator counts down as the session approaches inactivity timeout, giving the user visual feedback that the session will close soon.

### 4.3 Agent Mode Promotion

The existing chat input behavior changes:

- **Default behavior:** Text typed in the input box goes through the agent loop (tool calling, node creation), not the old single-turn chat
- **The `/agent` slash command remains** for users who want to explicitly invoke agent mode, but it's no longer necessary
- **Existing slash commands still work** (`/search`, `/code`, `/research`, etc.) — they bypass the agent loop as before

**Concrete routing change in `app.js`:**

The existing `handleChatSubmit()` function currently checks for slash commands first, then falls through to the single-turn chat flow (`sendChatMessage`). The change is:

```javascript
// Before (current):
async handleChatSubmit() {
    const text = input.value.trim();
    // 1. Check slash commands → route to feature plugins
    // 2. Otherwise → single-turn chat (sendChatMessage)
}

// After (promoted agent mode):
async handleChatSubmit() {
    const text = input.value.trim();
    // 1. Check slash commands → route to feature plugins (unchanged)
    // 2. Otherwise → agent loop (call AgentFeature.handleCommand('/agent', text))
    //    This reuses the existing agent pipeline — no new code path.
}
```

The fallback from "agent" to "single-turn chat" is removed. Users who want the old behavior can use `/chat` if a fallback command is desired, but the default is agent mode.

**Why this is safe:** The agent loop already handles the case where the LLM doesn't call any tools — it just streams a text response. The user experience is identical to the old chat flow in the "no tools" case, with the added benefit of tool availability when the model decides to use them.

## 5. Tool Execution (Reuse)

### 5.1 Reusing Existing Agent Tool Pipeline

The realtime voice agent **must reuse** the same tool execution pipeline as the text-based `/agent` mode:

- Same `AGENT_TOOLS` definitions (with provider-specific formatting via bridge)
- Same `_agent_execute_tool()` backend function
- Same `createNodeFromInstruction()` frontend function (extracted to `agent-utils.js`)
- Same ref system for LLM-controlled graph structure
- Same parent routing logic

**Session-scoped ref map:** The `refToNodeId` map persists for the entire WebSocket session, not per-utterance. This allows the user to say "now summarize those results" and the agent can reference refs from a previous utterance within the same session. The map is reset when a new session starts.

**Conversation history:** Both OpenAI and Gemini maintain conversation state within their WebSocket sessions. When the user says "now do X" after a previous tool call, the provider remembers the prior turn. The backend does NOT need to maintain its own conversation history — it relies on the provider's built-in session state.

### 5.2 Text-only Responses in Realtime Mode

When the provider returns text instead of tool calls (e.g., the user asked a question that doesn't require tools), the backend forwards the text as a `text` WebSocket event. The frontend updates the current agent node's content, identical to how the SSE-based agent handles `text` events. This means the agent node accumulates text responses from the provider across the session.

### 5.2 Provider Tool Format Mapping

OpenAI and Gemini use slightly different tool definition formats. The abstraction layer handles conversion:

| OpenAI Format | Gemini Format |
|---------------|---------------|
| `tools: [{ type: "function", function: { name, description, parameters } }]` | `tools: [{ functionDeclarations: [{ name, description, parameters }] }]` |
| Tool calls in response: `tool_calls: [{ function: { name, arguments } }]` | Tool calls in response: `toolCall: [{ functionCall: { name, args } }]` |
| Tool results: `{ role: "tool", tool_call_id, content }` | Tool results: `{ functionResponse: { name, response } }` |

The `RealtimeProviderBridge` implementations handle this mapping internally.

### 5.3 Additional Tools for Voice Context

Voice input adds context that text doesn't have. We may want to add:

- `navigate_canvas` — Pan/zoom to specific nodes (e.g., "show me the search results")
- `edit_node` — Modify existing node content (e.g., "update that note with these details")
- `delete_nodes` — Remove nodes from canvas (e.g., "delete those search results")

These are v2 considerations. For v1, we start with the existing `AGENT_TOOLS` plus:

| Tool | Purpose | Why needed for voice |
|------|---------|---------------------|
| `navigate_canvas` | Pan/zoom to node(s) | Voice users can't scroll manually while talking |
| `edit_node` | Update node content | Voice users can't click-and-type |
| `delete_nodes` | Remove nodes | Voice users can't select + delete |

## 6. Provider-Specific Details

### 6.1 OpenAI Realtime API (gpt-realtime-2, GA)

**API version:** GA (no longer beta). No `OpenAI-Beta` header required.

**SDK:** `openai>=1.0.0` — use `AsyncOpenAI.realtime.connect()` which returns an `AsyncRealtimeConnectionManager`. Must use `manager.enter()` (alias for `__aenter__()`) to get the connection, NOT `await manager` directly. Use `manager.__aexit__()` to close.

**Connection:** `AsyncOpenAI(api_key=api_key).realtime.connect(model=model)` — SDK handles WebSocket URL construction and authentication.

**Authentication:** Bearer token passed to `AsyncOpenAI(api_key=...)`. The SDK handles header construction.

**Session configuration:**

```json
{
    "type": "session.update",
    "session": {
        "type": "conversation",
        "modalities": ["text"],
        "instructions": "<system prompt>",
        "tools": [<tool definitions>],
        "tool_choice": "auto",
        "input_audio_format": "pcm16",
        "output_audio_format": "pcm16",
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 500
        }
    }
}
```

**Key design decision:** Set `modalities` to `["text"]` (not `["text", "audio"]`). This tells the model to respond with text/tool calls only, not audio. The model will not speak back.

**Turn detection:** Use server-side VAD (Voice Activity Detection) to detect when the user stops speaking. The `silence_duration_ms` of 500ms means the model considers the user done after 500ms of silence.

**GA event names** (updated from preview):

- `response.output_text.delta` — Text response chunk
- `response.function_call_arguments.done` — Tool call ready to execute
- `input_audio_buffer.speech_started` — User started speaking (visual feedback)
- `input_audio_buffer.speech_stopped` — User stopped speaking (visual feedback)
- `conversation.item.input_audio_transcription.completed` — Transcription of what user said (for logging/debugging, optionally create a HUMAN node)

### 6.2 Gemini Live API (v3.1)

**API version:** `v1beta` — `bidiGenerateContent` via WebSocket, managed by the `google-genai` Python SDK.

**SDK:** `google-genai>=1.0.0` — use `client.aio.live.connect()` which returns an `_AsyncGeneratorContextManager`. Must use `__aenter__()` / `__aexit__()` to manage the session (not `await` directly, which causes `TypeError: _AsyncGeneratorContextManager cannot be awaited`).

**Model:** `gemini-3.1-flash-live-preview` — only Live-specific model names work with `bidiGenerateContent`. Standard chat models (e.g., `gemini-2.5-flash-preview`) do NOT support the Live transport. See yarnsmith `src/lib/realtime/gemini-provider.ts` as reference implementation.

**Authentication:** API key passed to `genai.Client(api_key=...)`. The SDK handles WebSocket URL construction.

**Session configuration:**

```python
config = types.LiveConnectConfig(
    response_modalities=["AUDIO"],          # MUST be AUDIO — TEXT is not supported by Live models
    output_audio_transcription=types.AudioTranscriptionConfig(),  # Get transcript of model audio
    input_audio_transcription=types.AudioTranscriptionConfig(),   # Get transcript of user speech
    system_instruction=system_prompt,
    tools=[types.Tool(function_declarations=declarations)],
)
session = await manager.__aenter__()  # manager = client.aio.live.connect(model=model, config=config)
```

**CRITICAL: AUDIO modality required.** Gemini Live models (e.g., `gemini-3.1-flash-live-preview`) only support `response_modalities: ["AUDIO"]`. Setting `["TEXT"]` causes error 1007: "The requested combination of response modalities (TEXT) is not supported by the model." The model still makes tool calls in AUDIO mode — audio output and tool calls are not mutually exclusive. Audio output is discarded; use `output_audio_transcription` to get the text of what the model said.

**CRITICAL: Use `audio=` not `media=`.** In `send_realtime_input()`, the `media=` parameter is deprecated (error 1007: "realtime_input.media_chunks is deprecated"). Use `audio=types.Blob(...)` instead. See yarnsmith `gemini-provider.ts:382` for reference.

**Events we handle from Gemini:**

- `tool_call` — Tool call with function name and args (works in AUDIO mode)
- `server_content.model_turn` — Audio output chunks (discard) + text parts
- `server_content.input_transcription` — User speech transcription
- `server_content.output_transcription` — Model audio transcription (text of what it said)
- `server_content.turn_complete` — Turn ended

### 6.3 Unified Provider Interface — The Key Design Decision

**Both providers must present the same interface to the rest of the system.** This is the central architectural commitment:

```text
                    ┌─────────────────────────────┐
                    │   RealtimeProviderBridge     │  ← Abstract interface
                    │   (ABC)                      │
                    │                              │
                    │  connect()                   │
                    │  send_audio()                │
                    │  send_text()                 │
                    │  send_input_end()            │
                    │  send_tool_result()          │
                    │  receive_events() → Provider │
                    │  close()                     │
                    └──────────┬──────────────────-┘
                               │
                ┌──────────────┼──────────────────┐
                │              │                   │
                ▼              ▼                   ▼
    ┌───────────────┐  ┌──────────────┐  ┌────────────────┐
    │ OpenAI        │  │ Gemini       │  │ (future:       │
    │ Realtime 2    │  │ Live API 3.1 │  │  other         │
    │ Bridge        │  │ Bridge       │  │  providers)    │
    └───────────────┘  └──────────────┘  └────────────────┘
```

**What stays provider-specific (inside each bridge):**

- WebSocket URL construction and authentication
- Tool definition format conversion
- Event name mapping (e.g., `response.function_call_arguments.done` ↔ `toolCall`)
- Tool result format (OpenAI `conversation.item.create` with `role: tool` ↔ Gemini `toolResponse`)
- Session config structure

**What is unified (outside the bridges):**

- Tool execution (`_agent_execute_tool()` — identical for both)
- `ProviderEvent` dataclass — same shape regardless of provider
- Frontend WebSocket protocol — client never knows which provider is active
- Canvas node creation (`createNodeFromInstruction()` — identical for both)
- Timeout management, ref system, parent routing

**Why this matters:** Adding a new provider means implementing one class. Zero changes to tool execution, frontend protocol, or canvas logic.

## 7. Session Management

### 7.1 Timeout Behavior

The session auto-closes after **30 seconds** of inactivity (no audio input, no text input, no tool execution in progress).

**Timeout lifecycle:**

```text
Session starts → timer begins (30s)
  │
  ├── User sends audio/text → timer resets
  ├── Tool execution starts → timer pauses
  ├── Tool execution ends → timer resumes
  │
  ├── At 20s silence → send timeout_warning to frontend
  │   Frontend shows countdown: "10s remaining"
  │
  └── At 30s silence → close session
      Send session_closed { reason: "timeout" }
      Frontend shows toast: "Session ended due to inactivity"
```

### 7.2 Connection State Machine

```text
    ┌─────────┐
    │  IDLE   │ ← Initial state, no WebSocket
    └────┬────┘
         │ User clicks mic
         ▼
    ┌─────────┐
    │CONNECTING│ ← WebSocket opening, provider session starting
    └────┬────┘
         │ session_ready received
         ▼
    ┌──────────┐
    │ LISTENING│ ← Audio streaming, waiting for user input
    └──┬───┬───┘
       │   │
  User  │   │ Provider starts processing
  stops │   ▼
  talking│ ┌────────────┐
         │ │ PROCESSING  │ ← Tool execution happening
         │ └───┬────────┘
         │     │ Tools complete
         │     ▼
         │  ┌──────────┐
         └─▶│ LISTENING │ ← Back to listening
            └─────┬─────┘
                  │ Timeout or user clicks mic off
                  ▼
            ┌──────────┐
            │  CLOSING  │ ← WebSocket closing
            └─────┬─────┘
                  │
                  ▼
            ┌──────────┐
            │   IDLE   │ ← Back to start
            └──────────┘
```

## 8. Security Considerations

- **API keys** are sent from the frontend (same as existing pattern — stored in localStorage, sent per request). Both OpenAI and Gemini keys are sent so the backend can choose the provider.
- **WebSocket authentication** — Validate API key on `session_start` message before connecting to provider
- **TLS required in production** — The client↔backend WebSocket MUST use `wss://` (TLS) in production. The `ws://` protocol is only acceptable for local development. Audio data contains biometric information (voice) and must be encrypted in transit.
- **No persistent connections** — WebSocket closes on timeout or user action, no server-side session storage
- **Audio data** — Audio is streamed directly to the provider API, not stored on the server. Audio is not logged.
- **API keys in WebSocket** — API keys are sent in the `session_start` JSON message body, not in the URL (avoids key leaking in server logs/proxies). The backend forwards the appropriate key to the selected provider. The provider connection authenticates server-side.

## 9. Error Handling

| Scenario | Backend behavior | Frontend behavior |
|----------|-----------------|-------------------|
| Provider connection fails | Send `error` event, close WebSocket | Show error toast, reset mic button |
| Tool execution fails | Send `tool_result` with error, continue loop | Show error in agent node |
| Audio device not available | N/A (frontend-only) | Show toast "Microphone not available", disable mic button |
| WebSocket disconnects unexpectedly | N/A | Auto-reconnect attempt (1 retry), then show error |
| No API key for any realtime provider | Reject `session_start` | Show toast "Add an OpenAI or Gemini API key in Settings for voice input" |
| Provider rate limit | Send `error` event | Show rate limit toast, suggest waiting |
| Invalid API key | Reject `session_start` | Show auth error toast |

## 10. Dependencies

### Frontend

- **Web Audio API** — AudioContext, AudioWorklet for PCM capture
- **MediaRecorder API** — Fallback audio capture
- **WebSocket API** — Native browser WebSocket
- No new npm packages required

### Backend

- **websockets** — Used by the openai SDK internally; added as explicit dep
- **openai>=1.0.0** — OpenAI Realtime 2 SDK (`AsyncOpenAI.realtime.connect()`)
- **google-genai>=1.0.0** — Gemini Live API SDK (`client.aio.live.connect()`)
- Both SDKs manage their own WebSocket connections; no raw websocket code needed

## 11. Implementation Phases

### Phase 1: Foundation (Provider Abstraction + OpenAI)

- Backend: `RealtimeProviderBridge` ABC + `OpenAIRealtimeBridge`
- Backend: WebSocket endpoint `/ws/agent`
- Frontend: Mic button + WebSocket client
- Tool execution reuses existing pipeline
- Text input through WebSocket (no audio yet)

### Phase 2: Gemini Bridge

- `GeminiRealtimeBridge` implementation
- Tool format mapping (`functionDeclarations` ↔ OpenAI format)
- Testing with Gemini Live API 3.1
- Verify `ProviderEvent` abstraction holds for both providers

### Phase 3: Audio Pipeline

- AudioWorklet for PCM capture
- Resampling (48kHz → 24kHz)
- Base64 encoding and streaming
- Provider-side VAD integration (OpenAI server VAD + Gemini built-in VAD)

### Phase 4: Agent Mode Promotion + UX Polish

- Extract shared functions to `agent-utils.js` (createNodeFromInstruction, gatherViewportContext, executeCodeOnNode)
- Make agent mode the default text input behavior (change handleChatSubmit routing)
- Mic button always active; toast for missing API keys instead of model-based disable
- Status bar with timeout countdown
- Toast notifications for session events (including "Add an OpenAI or Gemini API key in Settings for voice input" when no key is configured)
- Show transcription in status bar during voice input

## 12. Open Questions — Resolved

1. **Should the transcription of voice input be saved as a HUMAN node?** → **Decision:** Show the transcription in the realtime status bar (ephemeral). Do NOT create a HUMAN node — the voice agent is session-based and creating HUMAN nodes for every utterance would clutter the canvas. If the user wants traceability, they can type instead of speaking.
2. **How to handle concurrent realtime sessions?** → **Decision:** One session per user. RT-SESSION-015 specifies that clicking mic while active closes the existing session first.
3. **Should we support audio output (text-to-speech) in a future iteration?** → **Decision:** Gemini Live API only supports `AUDIO` response modality — the model always speaks back with audio (tool calls are still sent alongside audio). OpenAI uses `TEXT` modality. Audio output from Gemini is discarded; transcription is extracted via `output_audio_transcription`. Full TTS UI is a v2 consideration.
4. **Canvas navigation tool — should it animate?** → **Decision:** Yes, animate with `zoomToSelectionAnimated(nodes, 0.8, 300)` — same as existing node creation. Instant jumps are disorienting.
5. **How does the agent mode promotion affect existing slash commands?** → **Decision:** Slash commands are checked FIRST and bypass the agent loop entirely. Only non-slash text goes through the agent. This preserves all existing `/search`, `/code`, `/research` behavior.
6. **Should voice mode depend on the text model picker?** → **Decision:** No. Voice mode is independent. The mic button is always active. Provider selection is key-based (which API keys are configured in Settings), not model-based. This eliminates the fragile coupling between model picker selection and voice capability. Resolved by redesigning provider routing to use available API keys instead of the selected model name.

## 13. Open Questions — Remaining

1. **AudioWorklet file serving** — The worklet JS file (`realtime-audio-worklet.js`) must be served from the static directory and loaded via `audioContext.audioWorklet.addModule('/js/realtime-audio-worklet.js')`. This requires CORS headers for the worklet file, which should work with the existing static file serving.
2. **Provider conversation history on reconnect** — When a session times out and the user restarts, the provider's conversation history is lost. The new session starts fresh. Should we carry over any context? Current decision: no — each session is independent.
3. **Model picker is independent** — Voice mode no longer depends on the text model picker. The mic button is always active. Provider selection is based on available API keys, not the selected text model. This resolves the coupling concern from the earlier design.
