"""
Gemini Live API provider bridge using google-genai SDK.
"""

import logging
from collections.abc import AsyncGenerator

from google import genai
from google.genai import types

from canvas_chat.realtime_providers import ProviderEvent, RealtimeProviderBridge

logger = logging.getLogger(__name__)


# @spec RT-PROV-003, RT-PROV-006, RT-PROV-008, RT-PROV-010, RT-PROV-013
class GeminiRealtimeBridge(RealtimeProviderBridge):
    """
    Provider bridge for Gemini Live API via google-genai SDK.

    Uses client.aio.live.connect() for the managed WebSocket session,
    delegating endpoint construction, auth, and message framing to the SDK.
    """

    def __init__(self):
        self._client = None
        self._session = None
        self._connected = False

    async def connect(
        self,
        api_key: str,
        model: str,
        tools: list,
        system_prompt: str,
    ) -> None:
        self._client = genai.Client(api_key=api_key)

        declarations = []
        for t in tools:
            fn = t.get("function", {})
            declarations.append(
                types.FunctionDeclaration(
                    name=fn["name"],
                    description=fn["description"],
                    parameters=fn.get("parameters", {}),
                )
            )

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            output_audio_transcription=types.AudioTranscriptionConfig(),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            system_instruction=system_prompt,
            tools=[types.Tool(function_declarations=declarations)],
        )

        try:
            self._manager = self._client.aio.live.connect(
                model=model,
                config=config,
            )
            self._session = await self._manager.__aenter__()
            self._connected = True
        except Exception as e:
            self._connected = False
            raise ConnectionError(f"Failed to connect to Gemini Live API: {e}") from e

    async def send_audio(self, pcm_chunk: bytes) -> None:
        if not self._connected or not self._session:
            return
        await self._session.send_realtime_input(
            audio=types.Blob(data=pcm_chunk, mime_type="audio/pcm;rate=24000")
        )

    async def send_text(self, text: str) -> None:
        if not self._connected or not self._session:
            return
        await self._session.send_client_content(
            turns=types.Content(
                role="user",
                parts=[types.Part(text=text)],
            ),
            turn_complete=True,
        )

    async def send_input_end(self) -> None:
        pass

    async def send_tool_result(self, call_id: str, tool_name: str, result: str) -> None:
        if not self._connected or not self._session:
            return
        await self._session.send_tool_response(
            function_responses=[
                types.FunctionResponse(
                    name=tool_name,
                    id=call_id,
                    response={"result": result},
                )
            ]
        )

    async def receive_events(self) -> AsyncGenerator[ProviderEvent, None]:
        if not self._connected or not self._session:
            return
        try:
            async for message in self._session.receive():
                if message.tool_call and message.tool_call.function_calls:
                    for fc in message.tool_call.function_calls:
                        yield ProviderEvent(
                            event_type="tool_call",
                            tool_name=fc.name,
                            tool_args=dict(fc.args) if fc.args else {},
                            tool_call_id=fc.id or fc.name,
                        )

                if message.server_content and message.server_content.model_turn:
                    for part in message.server_content.model_turn.parts:
                        if part.inline_data:
                            pass  # audio output — discard
                        if part.text:
                            yield ProviderEvent(
                                event_type="text_delta",
                                text=part.text,
                            )

                if (
                    message.server_content
                    and message.server_content.input_transcription
                ):
                    yield ProviderEvent(
                        event_type="transcription",
                        text=message.server_content.input_transcription.text,
                    )

                if (
                    message.server_content
                    and message.server_content.output_transcription
                ):
                    text = message.server_content.output_transcription.text
                    if text:
                        yield ProviderEvent(
                            event_type="text_delta",
                            text=text,
                        )

                if message.server_content and message.server_content.turn_complete:
                    pass

        except Exception as e:
            logger.error("Gemini Live API event loop error: %s", e)
            yield ProviderEvent(
                event_type="error",
                error_message=str(e),
            )

    async def close(self) -> None:
        self._connected = False
        if self._session:
            try:
                await self._manager.__aexit__(None, None, None)
            except Exception:
                pass
            self._session = None
