# Provider Abstraction — EARS Specifications

**Feature:** Realtime Voice Agent — Provider Abstraction Layer
**Parent:** [Realtime Voice Agent LLD](./LLD.md)

## Related Documents

- [Realtime Voice Agent LLD](./LLD.md)
- [Session Management EARS](./session-management-EARS.md)
- [Agentic Mode Tool System EARS](../agentic-mode/tool-system-EARS.md)

---

## RT-PROV-001: Provider bridge interface

- [ ] **RT-PROV-001**: The system shall define an abstract `RealtimeProviderBridge` base class with methods `connect()`, `send_audio()`, `send_text()`, `send_input_end()`, `receive_events()`, and `close()`.

**Location:** `src/canvas_chat/realtime_providers/__init__.py` — `RealtimeProviderBridge` ABC

---

## RT-PROV-002: OpenAI provider bridge

- [ ] **RT-PROV-002**: The system shall implement `OpenAIRealtimeBridge` that connects to the OpenAI Realtime 2 GA API (`wss://api.openai.com/v1/realtime?model=gpt-realtime-2`), sends audio, receives tool call events using GA event names (`response.function_call_arguments.done`, `response.output_text.delta`), and translates them to the common event format.

**Location:** `src/canvas_chat/realtime_providers/openai.py` — `OpenAIRealtimeBridge`

---

## RT-PROV-003: Gemini provider bridge

- [ ] **RT-PROV-003**: The system shall implement `GeminiRealtimeBridge` that connects to the Gemini Live API via the `google-genai` SDK (`client.aio.live.connect()`), sends audio via `send_realtime_input(audio=...)`, receives tool call events, and translates them to the common event format. Uses model `gemini-3.1-flash-live-preview`. The `live.connect()` call returns an `_AsyncGeneratorContextManager` — must use `__aenter__()`/`__aexit__()` to manage the session (not `await` directly).

**Location:** `src/canvas_chat/realtime_providers/gemini.py` — `GeminiRealtimeBridge`

---

## RT-PROV-004: Common event format

- [ ] **RT-PROV-004**: Both provider bridges shall emit a common `ProviderEvent` dataclass with fields: `event_type` (tool_call, text_delta, speech_started, speech_stopped, transcription, error), `tool_name`, `tool_args`, `tool_call_id`, `text`, and `error_message`.

**Location:** `src/canvas_chat/realtime_providers/__init__.py` — `ProviderEvent`

---

## RT-PROV-005: OpenAI tool format mapping

- [ ] **RT-PROV-005**: `OpenAIRealtimeBridge` shall convert `AGENT_TOOLS` to OpenAI's realtime tool format (`tools: [{ type: "function", ... }]`) and translate `response.function_call_arguments.done` events to `ProviderEvent(tool_call, ...)`.

**Location:** `src/canvas_chat/realtime_providers/openai.py` — `OpenAIRealtimeBridge._format_tools()`, event handler

---

## RT-PROV-006: Gemini tool format mapping

- [ ] **RT-PROV-006**: `GeminiRealtimeBridge` shall convert `AGENT_TOOLS` to Gemini's function declaration format (`functionDeclarations: [{ name, description, parameters }]`) and translate `toolCall` events to `ProviderEvent(tool_call, ...)`.

**Location:** `src/canvas_chat/realtime_providers/gemini.py` — `GeminiRealtimeBridge._format_tools()`, event handler

---

## RT-PROV-007: OpenAI modalities text-only

- [ ] **RT-PROV-007**: `OpenAIRealtimeBridge` shall set `modalities: ["text"]` in the session configuration to ensure the model responds with text and tool calls only, never audio output.

**Location:** `src/canvas_chat/realtime_providers/openai.py` — `OpenAIRealtimeBridge.connect()` session config

---

## RT-PROV-008: Gemini modalities AUDIO-only

- [ ] **RT-PROV-008**: `GeminiRealtimeBridge` shall set `response_modalities: ["AUDIO"]` in the session configuration. Gemini Live models only support AUDIO modality — TEXT is rejected with error 1007. Tool calls still work in AUDIO mode (audio and tool calls are not mutually exclusive). Audio output is discarded; text is obtained via `output_audio_transcription`.

**Location:** `src/canvas_chat/realtime_providers/gemini.py` — `GeminiRealtimeBridge.connect()` session config

---

## RT-PROV-009: OpenAI server-side VAD

- [ ] **RT-PROV-009**: `OpenAIRealtimeBridge` shall enable server-side Voice Activity Detection with `turn_detection: { type: "server_vad", silence_duration_ms: 500 }` so the provider detects utterance boundaries automatically.

**Location:** `src/canvas_chat/realtime_providers/openai.py` — `OpenAIRealtimeBridge.connect()` session config

---

## RT-PROV-010: Gemini VAD handling

- [ ] **RT-PROV-010**: `GeminiRealtimeBridge` shall handle Gemini's built-in turn detection, forwarding speech start/stop events to the backend for visual feedback.

**Location:** `src/canvas_chat/realtime_providers/gemini.py` — `GeminiRealtimeBridge` event handler

---

## RT-PROV-011: Tool result feedback to provider

- [ ] **RT-PROV-011**: After executing a tool, the backend shall send the tool result back to the active provider bridge using the provider-specific format (OpenAI `conversation.item.create` with `role: tool`, or Gemini `toolResponse`).

**Location:** `src/canvas_chat/realtime_providers/openai.py` — `OpenAIRealtimeBridge.send_tool_result()`, `src/canvas_chat/realtime_providers/gemini.py` — `GeminiRealtimeBridge.send_tool_result()`

---

## RT-PROV-012: OpenAI authentication

- [ ] **RT-PROV-012**: `OpenAIRealtimeBridge` shall authenticate using the `openai_api_key` from the `session_start` message, sent as an `Authorization` header or query parameter to the OpenAI WebSocket URL.

**Location:** `src/canvas_chat/realtime_providers/openai.py` — `OpenAIRealtimeBridge.connect()`

---

## RT-PROV-013: Gemini authentication

- [ ] **RT-PROV-013**: `GeminiRealtimeBridge` shall authenticate using the `gemini_api_key` from the `session_start` message, appended as a query parameter to the Gemini WebSocket URL.

**Location:** `src/canvas_chat/realtime_providers/gemini.py` — `GeminiRealtimeBridge.connect()`

---

## RT-PROV-014: Provider connection error handling

- [ ] **RT-PROV-014**: If the provider bridge fails to connect (network error, invalid API key, rate limit), the system shall send an `error` WebSocket event to the frontend and close the session without retrying.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` provider connection error handling

---

## RT-PROV-015: Provider event loop

- [ ] **RT-PROV-015**: The backend shall run a concurrent event loop that reads `ProviderEvent` objects from the bridge's `receive_events()` generator and dispatches them: tool_call events trigger `_agent_execute_tool()`, text events are forwarded to the frontend, and speech events are forwarded as status updates.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` event processing loop

---

## RT-PROV-016: No API key available rejection

- [ ] **RT-PROV-016**: If the `session_start` message contains no API key for any realtime provider (neither `openai_api_key` nor `gemini_api_key`), the system shall send an `error` event with message "No API key configured for voice input. Add an OpenAI or Gemini API key in Settings." and close the WebSocket.

**Location:** `src/canvas_chat/app.py` — provider routing logic

---

## RT-PROV-017: System prompt injection

- [ ] **RT-PROV-017**: The provider bridge shall inject the same `AGENT_SYSTEM_PROMPT` used by the text-based agent, augmented with viewport context from the session_start message.

**Location:** `src/canvas_chat/realtime_providers/__init__.py` — `connect()` system prompt parameter; `src/canvas_chat/app.py` — prompt construction

---

## RT-PROV-018: Provider bridge cleanup

- [ ] **RT-PROV-018**: When the WebSocket closes (timeout, user action, or error), the backend shall call `bridge.close()` to clean up the provider's WebSocket connection and release resources.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` finally block

---

## RT-PROV-019: Transcription forwarding

- [ ] **RT-PROV-019**: When the provider sends a transcription of the user's speech, the backend shall forward it to the frontend as a `transcription` event for display in the status bar (not as a HUMAN node).

**Location:** `src/canvas_chat/app.py` — transcription event forwarding

---

## RT-PROV-020: Max tool call limit

- [ ] **RT-PROV-020**: The realtime agent shall enforce the same `MAX_AGENT_TOOL_CALLS` limit (10 per session) as the text-based agent to prevent infinite tool loops.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` tool call counter

---

## RT-PROV-021: Backend dual-task concurrency model

- [ ] **RT-PROV-021**: The backend shall run two concurrent asyncio tasks per realtime session using `asyncio.gather()`: one forwarding client messages to the provider bridge, and one reading provider events and dispatching tool execution. If either task fails or completes, the other shall be cancelled.

**Location:** `src/canvas_chat/app.py` — `ws_agent()` concurrency setup

---

## RT-PROV-022: Conversation history managed by provider

- [ ] **RT-PROV-022**: The backend shall not maintain its own conversation history for the realtime session. Both OpenAI and Gemini maintain conversation state within their WebSocket sessions. The backend relies on the provider's built-in session state for multi-turn context.

**Location:** `src/canvas_chat/app.py` — no history management needed; `src/canvas_chat/realtime_providers/` — provider session handling

---

## RT-PROV-023: TLS required for production WebSocket

- [ ] **RT-PROV-023**: The client-to-backend WebSocket connection shall use `wss://` (TLS) in production environments. `ws://` is only acceptable for local development. Audio data contains biometric information and must be encrypted in transit.

**Location:** `src/canvas_chat/app.py` — WebSocket endpoint; deployment configuration

---

## RT-PROV-024: API keys not in WebSocket URL

- [ ] **RT-PROV-024**: API keys (`openai_api_key`, `gemini_api_key`) shall be sent in the `session_start` message body (JSON), not in the WebSocket URL query parameters, to prevent key leakage in server logs and proxy access logs.

**Location:** `src/canvas_chat/static/js/plugins/realtime-agent.js` — session start message; `src/canvas_chat/app.py` — session start handler
