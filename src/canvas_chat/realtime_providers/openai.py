"""
OpenAI Realtime 2 provider bridge using openai SDK.

Uses the openai Python SDK's AsyncOpenAI.realtime.connect() for typed
event handling instead of raw websockets. The SDK handles connection
management, automatic reconnection, and event serialization.

API docs: https://platform.openai.com/docs/guides/realtime
Model: gpt-realtime-2 (GA)
"""

import json
import logging
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from canvas_chat.realtime_providers import ProviderEvent, RealtimeProviderBridge

logger = logging.getLogger(__name__)


# @spec RT-PROV-002, RT-PROV-005, RT-PROV-007, RT-PROV-009, RT-PROV-011, RT-PROV-012
class OpenAIRealtimeBridge(RealtimeProviderBridge):
    """
    Provider bridge for OpenAI Realtime 2 (GA) using the openai SDK.

    Uses AsyncOpenAI.realtime.connect() which returns an async context
    manager yielding an AsyncRealtimeConnection. Events are typed
    RealtimeServerEvent objects with proper attribute access.

    Handles:
    - SDK-managed WebSocket connection with auto-reconnect
    - Tool format conversion (AGENT_TOOLS → OpenAI realtime format)
    - Typed event mapping (RealtimeServerEvent → ProviderEvent)
    - Server-side VAD for turn detection
    - Text-only modalities (no audio output)
    """

    def __init__(self):
        self._client = None
        self._conn = None
        self._connected = False

    async def connect(
        self,
        api_key: str,
        model: str,
        tools: list,
        system_prompt: str,
    ) -> None:
        self._client = AsyncOpenAI(api_key=api_key)

        openai_tools = self._format_tools(tools)

        try:
            manager = self._client.realtime.connect(model=model)
            self._conn = await manager.__aenter__()
            self._manager = manager
            self._connected = True
        except Exception as e:
            self._connected = False
            raise ConnectionError(
                f"Failed to connect to OpenAI Realtime API: {e}"
            ) from e

        session_config = {
            "type": "session.update",
            "session": {
                "type": "realtime",
                "output_modalities": ["text"],
                "instructions": system_prompt,
                "tools": openai_tools,
                "tool_choice": "auto",
                "audio": {
                    "input": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                        "turn_detection": {
                            "type": "server_vad",
                            "threshold": 0.5,
                            "prefix_padding_ms": 300,
                            "silence_duration_ms": 500,
                        },
                    },
                    "output": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                    },
                },
            },
        }
        await self._conn.send(session_config)
        response = await self._conn.recv()
        if getattr(response, "type", None) != "session.updated":
            logger.warning(
                "Unexpected session.update response: %s",
                getattr(response, "type", None),
            )

    async def send_audio(self, pcm_chunk: bytes) -> None:
        if not self._connected or not self._conn:
            return
        import base64

        audio_b64 = base64.b64encode(pcm_chunk).decode("utf-8")
        await self._conn.send({"type": "input_audio_buffer.append", "audio": audio_b64})

    async def send_text(self, text: str) -> None:
        if not self._connected or not self._conn:
            return
        await self._conn.send(
            {
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": text}],
                },
            }
        )
        await self._conn.send({"type": "response.create"})

    async def send_input_end(self) -> None:
        if not self._connected or not self._conn:
            return
        await self._conn.send({"type": "input_audio_buffer.commit"})
        await self._conn.send({"type": "response.create"})

    async def send_tool_result(self, call_id: str, tool_name: str, result: str) -> None:
        if not self._connected or not self._conn:
            return
        await self._conn.send(
            {
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": result,
                },
            }
        )
        await self._conn.send({"type": "response.create"})

    async def receive_events(self) -> AsyncGenerator[ProviderEvent, None]:
        if not self._connected or not self._conn:
            return
        try:
            async for event in self._conn:
                event_type = getattr(event, "type", "")

                if event_type == "response.function_call_arguments.done":
                    try:
                        args = json.loads(event.arguments or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    yield ProviderEvent(
                        event_type="tool_call",
                        tool_name=event.name,
                        tool_args=args,
                        tool_call_id=event.call_id,
                    )

                elif event_type == "response.output_text.delta":
                    if event.delta:
                        yield ProviderEvent(
                            event_type="text_delta",
                            text=event.delta,
                        )

                elif event_type == "input_audio_buffer.speech_started":
                    yield ProviderEvent(event_type="speech_started")

                elif event_type == "input_audio_buffer.speech_stopped":
                    yield ProviderEvent(event_type="speech_stopped")

                elif (
                    event_type
                    == "conversation.item.input_audio_transcription.completed"
                ):
                    if event.transcript:
                        yield ProviderEvent(
                            event_type="transcription",
                            text=event.transcript,
                        )

                elif event_type == "error":
                    error_obj = getattr(event, "error", None)
                    if error_obj and hasattr(error_obj, "message"):
                        msg = error_obj.message
                    elif isinstance(error_obj, dict):
                        msg = error_obj.get("message", "Unknown error")
                    else:
                        msg = str(error_obj or "Unknown error")
                    yield ProviderEvent(
                        event_type="error",
                        error_message=msg,
                    )

                elif event_type in (
                    "response.done",
                    "session.created",
                    "session.updated",
                ):
                    pass

                else:
                    logger.debug("Unhandled OpenAI event type: %s", event_type)

        except Exception as e:
            logger.error("OpenAI Realtime event loop error: %s", e)
            yield ProviderEvent(
                event_type="error",
                error_message=str(e),
            )

    async def close(self) -> None:
        self._connected = False
        if self._conn and self._manager:
            try:
                await self._manager.__aexit__(None, None, None)
            except Exception:
                pass
            self._conn = None
            self._manager = None

    @staticmethod
    def _format_tools(agent_tools: list) -> list:
        return [
            {
                "type": "function",
                "name": t["function"]["name"],
                "description": t["function"]["description"],
                "parameters": t["function"]["parameters"],
            }
            for t in agent_tools
        ]
