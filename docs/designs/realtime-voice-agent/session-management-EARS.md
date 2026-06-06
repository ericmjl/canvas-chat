# Session Management — EARS Specifications

**Feature:** Realtime Voice Agent — Session Management
**Parent:** [Realtime Voice Agent LLD](./LLD.md)

## Related Documents

- [Realtime Voice Agent LLD](./LLD.md)
- [Agentic Mode LLD](../agentic-mode/LLD.md)

---

## RT-SESSION-001: WebSocket endpoint

- [ ] **RT-SESSION-001**: The system shall expose a WebSocket endpoint at `/ws/agent` that accepts realtime agent sessions with both audio and text input.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` WebSocket handler

---

## RT-SESSION-002: Session start message

- [ ] **RT-SESSION-002**: When the frontend sends a `session_start` message containing `openai_api_key` and/or `gemini_api_key` (and optional `base_url`), the system shall determine the provider based on which keys are present, establish a provider bridge connection, and respond with `session_ready`.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` session initialization

---

## RT-SESSION-003: Provider routing by available API keys

- [ ] **RT-SESSION-003**: The system shall route to the provider based on available API keys: if `openai_api_key` is present, use OpenAI Realtime 2; if `gemini_api_key` is present, use Gemini Live API 3.1; if both are present, prefer the provider matching the current text model's provider, falling back to OpenAI first, then Gemini; if neither is present, send an error event.

**Location:** `src/canvas_chat/app.py` — provider routing logic

---

## RT-SESSION-004: Session timeout

- [ ] **RT-SESSION-004**: While a realtime session is active, the system shall auto-close the WebSocket connection after 30 seconds of inactivity (no audio input, no text input, no tool execution in progress).

**Location:** `src/canvas_chat/app.py` — `ws_agent()` timeout logic

---

## RT-SESSION-005: Timeout warning

- [ ] **RT-SESSION-005**: When 20 seconds of inactivity have elapsed (10 seconds before timeout), the system shall send a `timeout_warning` event to the frontend with `seconds_remaining: 10`.

**Location:** `src/canvas_chat/app.py` — timeout timer

---

## RT-SESSION-006: Timeout toast notification

- [ ] **RT-SESSION-006**: When the frontend receives a `session_closed` event with `reason: "timeout"`, the system shall display a toast notification reading "Session ended due to inactivity".

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — event handler

---

## RT-SESSION-007: Timeout countdown UI

- [ ] **RT-SESSION-007**: When the frontend receives a `timeout_warning` event, the system shall display a countdown indicator in the realtime status bar showing seconds remaining until session close.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — timeout warning handler

---

## RT-SESSION-008: Activity resets timeout

- [ ] **RT-SESSION-008**: When the frontend sends audio data, text input, or the backend is executing a tool, the inactivity timer shall reset to 30 seconds.

**Location:** `src/canvas_chat/app.py` — timer reset on activity

---

## RT-SESSION-009: Explicit session close

- [ ] **RT-SESSION-009**: When the frontend sends a `close` message, the system shall close the provider bridge connection and the WebSocket immediately without waiting for the timeout.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` close handler

---

## RT-SESSION-010: Mic toggle button

- [ ] **RT-SESSION-010**: The system shall display a microphone toggle button in the chat input area that starts a realtime session when clicked (if inactive) and stops the session when clicked again (if active).

**Location:** `src/canvas_chat/static/index.html` — mic button; `src/canvas_chat/static/js/plugins/realtime-agent.js` — button handler

---

## RT-SESSION-011: Mic button states

- [ ] **RT-SESSION-011**: The mic button shall visually reflect the current session state: gray (inactive), pulsing yellow (connecting), solid green with pulse (listening), spinning indicator (processing), or red (error).

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — UI state updates; `src/canvas_chat/static/css/input.css` — mic button styles

---

## RT-SESSION-012: Mic button always enabled with key check

- [ ] **RT-SESSION-012**: The mic button shall always be enabled (clickable). When clicked with no API key configured for any realtime provider, the system shall display a toast notification reading "Add an OpenAI or Gemini API key in Settings for voice input" instead of starting a session.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — mic button click handler

---

## RT-SESSION-013: Session status bar

- [ ] **RT-SESSION-013**: While a realtime session is active, the system shall display a status bar above the input area showing the session state and a timeout countdown.

**Location:** `src/canvas_chat/static/index.html` — status bar HTML; `src/canvas_chat/static/js/plugins/realtime-agent.js` — status updates

---

## RT-SESSION-014: WebSocket reconnect

- [ ] **RT-SESSION-014**: If the WebSocket connection drops unexpectedly, the frontend shall attempt one automatic reconnect before showing an error toast.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — WebSocket error/close handlers

---

## RT-SESSION-015: Concurrent session prevention

- [ ] **RT-SESSION-015**: The system shall prevent concurrent realtime sessions. If the user clicks the mic button while a session is active, the existing session shall close before starting a new one.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — mic button click handler

---

## RT-SESSION-016: API key validation on session start

- [ ] **RT-SESSION-016**: When a `session_start` message is received, the system shall validate the API key by attempting the provider connection. If the provider rejects the key, the system shall send an `error` event and close the WebSocket.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` session start

---

## RT-SESSION-017: API keys and viewport context on session start

- [ ] **RT-SESSION-017**: When a `session_start` message is constructed, the frontend shall include `openai_api_key` (if configured), `gemini_api_key` (if configured), `base_url` (if set), and viewport context (visible canvas nodes) so the backend can route to the correct provider and inject context into the system prompt.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — session start message construction

---

## RT-SESSION-018: Ping/pong keep-alive

- [ ] **RT-SESSION-018**: The frontend shall send periodic `ping` messages (every 15 seconds) during idle periods to keep the connection alive and reset the inactivity timer.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — ping interval

---

## RT-SESSION-019: Tool event protocol

- [ ] **RT-SESSION-019**: The backend shall send tool execution events (`set_parents`, `tool_start`, `node_create`, `tool_result`) over the WebSocket using the same JSON structure as the existing SSE events from `/api/agent`.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` tool event dispatch

---

## RT-SESSION-020: Tool execution reuse

- [ ] **RT-SESSION-020**: The realtime agent shall reuse the existing `_agent_execute_tool()` function and `AGENT_TOOLS` definitions from the text-based agent endpoint, with no parallel tool implementations.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` tool execution call

---

## RT-SESSION-021: Ref system reuse

- [ ] **RT-SESSION-021**: The realtime agent shall use the same ref system (ref labels, `refToNodeId` map, `link_from_refs`) as the text-based agent for LLM-controlled graph structure.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — ref mapping; `src/canvas_chat/app.py` — ref assignment in tool results

---

## RT-SESSION-022: Frontend node creation reuse

- [ ] **RT-SESSION-022**: When the frontend receives `node_create` events via WebSocket, it shall use the same `createNodeFromInstruction()` function as the text-based `AgentFeature` plugin.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — node_create handler

---

## RT-SESSION-023: Agent mode as default text input

- [ ] **RT-SESSION-023**: When the user types text in the input box without a slash command prefix, the system shall route the input through the agent loop (tool-calling behavior) rather than the single-turn chat flow.

**Location:** `src/canvas_chat/static/js/app.js` — input handler routing

---

## RT-SESSION-024: Existing slash commands preserved

- [ ] **RT-SESSION-024**: Where the user types a recognized slash command (`/search`, `/code`, `/research`, etc.), the system shall bypass the agent loop and route directly to the corresponding feature plugin, preserving existing behavior.

**Location:** `src/canvas_chat/static/js/app.js` — slash command routing

---

## RT-SESSION-025: (Removed — voice is independent of model picker)

- [ ] **RT-SESSION-025**: *(Removed)* Voice mode no longer depends on the text model picker. The mic button is always active regardless of which text model is selected. Provider routing is key-based, not model-based.

---

## RT-SESSION-026: (Removed — model picker is irrelevant to voice)

- [ ] **RT-SESSION-026**: *(Removed)* Since voice mode is independent of the text model picker, changing the selected text model has no effect on an active voice session. No session close or mic reset is needed on model change.

---

## RT-SESSION-027: In-flight tool calls on timeout

- [ ] **RT-SESSION-027**: When the inactivity timeout fires while a tool is executing, the system shall wait for the tool to complete (up to the per-tool 60s timeout), send the result to the client, and then close the session. The session shall NOT close while a tool is actively executing.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` timeout logic

---

## RT-SESSION-028: Per-tool execution timeout

- [ ] **RT-SESSION-028**: Each tool execution within a realtime session shall have a 60-second timeout. If a tool exceeds this limit, the system shall cancel it, return an error tool result to the provider, and send an error event to the client.

**Location:** `src/canvas_chat/app.py` — tool execution in `_forward_provider_to_client()`

---

## RT-SESSION-029: Session-scoped ref map

- [ ] **RT-SESSION-029**: The `refToNodeId` map shall persist for the entire WebSocket session, allowing the agent to reference nodes created in previous utterances. The map shall be reset when a new session starts.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — session initialization

---

## RT-SESSION-030: Transcription display in status bar

- [ ] **RT-SESSION-030**: When the provider sends a transcription of the user's speech, the system shall display the transcribed text in the realtime status bar (ephemeral, replaced on next utterance). The system shall NOT create a HUMAN node for voice transcriptions.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — transcription event handler

---

## RT-SESSION-031: Shared agent utilities extraction

- [ ] **RT-SESSION-031**: The `createNodeFromInstruction`, `gatherViewportContext`, and `executeCodeOnNode` functions shall be extracted from `AgentFeature` into a shared `agent-utils.js` module, importable by both `AgentFeature` and `RealtimeAgentPlugin`.

**Location:** `src/canvas_chat/static/js/agent-utils.js` — shared functions; `src/canvas_chat/static/js/plugins/agent.js` — updated imports

---

## RT-SESSION-032: Text-only responses in realtime mode

- [ ] **RT-SESSION-032**: When the provider returns text without tool calls during a realtime session, the backend shall forward it as a `text` WebSocket event and the frontend shall update the current agent node's content, identical to the SSE-based agent's text handling.

**Location:** `src/canvas_chat/app.py` — text event forwarding; `src/canvas_chat/static/js/plugins/realtime-agent.js` — text event handler
