import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from canvas_chat.realtime_providers import ProviderEvent, RealtimeProviderBridge
from canvas_chat.realtime_providers.gemini import GeminiRealtimeBridge
from canvas_chat.realtime_providers.openai import OpenAIRealtimeBridge

SAMPLE_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_note",
            "description": "Create a note",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["title", "content"],
            },
        },
    },
]


# --- ProviderEvent ---


def test_provider_event_defaults():
    evt = ProviderEvent(event_type="tool_call")
    assert evt.event_type == "tool_call"
    assert evt.tool_name is None
    assert evt.tool_args is None
    assert evt.tool_call_id is None
    assert evt.text is None
    assert evt.error_message is None


def test_provider_event_full():
    evt = ProviderEvent(
        event_type="tool_call",
        tool_name="search_web",
        tool_args={"query": "python"},
        tool_call_id="call_123",
    )
    assert evt.event_type == "tool_call"
    assert evt.tool_name == "search_web"
    assert evt.tool_args == {"query": "python"}
    assert evt.tool_call_id == "call_123"


def test_provider_event_text():
    evt = ProviderEvent(event_type="text_delta", text="hello")
    assert evt.text == "hello"


def test_provider_event_error():
    evt = ProviderEvent(event_type="error", error_message="boom")
    assert evt.error_message == "boom"


# --- RealtimeProviderBridge is abstract ---


def test_bridge_is_abstract():
    with pytest.raises(TypeError):
        RealtimeProviderBridge()


# --- OpenAI tool format ---


def test_openai_format_tools():
    result = OpenAIRealtimeBridge._format_tools(SAMPLE_AGENT_TOOLS)
    assert len(result) == 2
    assert result[0]["type"] == "function"
    assert result[0]["name"] == "search_web"
    assert result[0]["description"] == "Search the web"
    assert "query" in result[0]["parameters"]["properties"]
    assert result[1]["name"] == "create_note"


def test_openai_format_tools_empty():
    result = OpenAIRealtimeBridge._format_tools([])
    assert result == []


# --- Helpers ---


def _make_openai_event(event_type, **kwargs):
    return SimpleNamespace(type=event_type, **kwargs)


def _make_gemini_message(tool_call=None, server_content=None):
    msg = MagicMock()
    msg.tool_call = tool_call
    msg.server_content = server_content
    return msg


def _make_function_call(name, args, call_id):
    fc = MagicMock()
    fc.name = name
    fc.args = args
    fc.id = call_id
    return fc


def _make_server_content(
    model_turn=None,
    input_transcription=None,
    output_transcription=None,
    turn_complete=False,
):
    sc = MagicMock()
    sc.model_turn = model_turn
    sc.input_transcription = input_transcription
    sc.output_transcription = output_transcription
    sc.turn_complete = turn_complete
    return sc


# --- OpenAI event parsing ---


def test_openai_receive_tool_call():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = True

    event = _make_openai_event(
        "response.function_call_arguments.done",
        name="search_web",
        arguments='{"query": "test"}',
        call_id="call_abc",
    )

    async def _fake_conn():
        yield event

    bridge._conn = _fake_conn()
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].event_type == "tool_call"
    assert events[0].tool_name == "search_web"
    assert events[0].tool_args == {"query": "test"}
    assert events[0].tool_call_id == "call_abc"


def test_openai_receive_text_delta():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = True

    event = _make_openai_event("response.output_text.delta", delta="hello ")

    async def _fake_conn():
        yield event

    bridge._conn = _fake_conn()
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].event_type == "text_delta"
    assert events[0].text == "hello "


def test_openai_receive_speech_events():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = True

    events_list = [
        _make_openai_event("input_audio_buffer.speech_started"),
        _make_openai_event("input_audio_buffer.speech_stopped"),
    ]

    async def _fake_conn():
        for e in events_list:
            yield e

    bridge._conn = _fake_conn()
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 2
    assert events[0].event_type == "speech_started"
    assert events[1].event_type == "speech_stopped"


def test_openai_receive_transcription():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = True

    event = _make_openai_event(
        "conversation.item.input_audio_transcription.completed",
        transcript="hello world",
    )

    async def _fake_conn():
        yield event

    bridge._conn = _fake_conn()
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].event_type == "transcription"
    assert events[0].text == "hello world"


def test_openai_receive_error():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = True

    error_obj = SimpleNamespace(message="rate limited")
    event = _make_openai_event("error", error=error_obj)

    async def _fake_conn():
        yield event

    bridge._conn = _fake_conn()
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].event_type == "error"
    assert events[0].error_message == "rate limited"


def test_openai_receive_error_dict():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = True

    event = _make_openai_event("error", error={"message": "bad key"})

    async def _fake_conn():
        yield event

    bridge._conn = _fake_conn()
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].error_message == "bad key"


def test_openai_skip_session_events():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = True

    events_list = [
        _make_openai_event("session.created"),
        _make_openai_event("session.updated"),
        _make_openai_event("response.done"),
    ]

    async def _fake_conn():
        for e in events_list:
            yield e

    bridge._conn = _fake_conn()
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 0


def test_openai_receive_not_connected():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = False
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 0


def test_openai_invalid_json_args():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = True

    event = _make_openai_event(
        "response.function_call_arguments.done",
        name="search_web",
        arguments="not json",
        call_id="call_1",
    )

    async def _fake_conn():
        yield event

    bridge._conn = _fake_conn()
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].tool_args == {}


# --- Gemini event parsing ---


def test_gemini_receive_tool_call():
    bridge = GeminiRealtimeBridge()
    bridge._connected = True

    fc = _make_function_call("search_web", {"query": "test"}, "fc_1")
    tc = MagicMock()
    tc.function_calls = [fc]
    msg = _make_gemini_message(tool_call=tc)

    async def _fake_receive():
        yield msg

    bridge._session = MagicMock()
    bridge._session.receive = _fake_receive
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].event_type == "tool_call"
    assert events[0].tool_name == "search_web"
    assert events[0].tool_args == {"query": "test"}
    assert events[0].tool_call_id == "fc_1"


def test_gemini_receive_tool_call_fallback_id():
    bridge = GeminiRealtimeBridge()
    bridge._connected = True

    fc = _make_function_call("search_web", {"query": "x"}, None)
    tc = MagicMock()
    tc.function_calls = [fc]
    msg = _make_gemini_message(tool_call=tc)

    async def _fake_receive():
        yield msg

    bridge._session = MagicMock()
    bridge._session.receive = _fake_receive
    events = asyncio.run(_collect(bridge.receive_events()))
    assert events[0].tool_call_id == "search_web"


def test_gemini_receive_output_transcription():
    bridge = GeminiRealtimeBridge()
    bridge._connected = True

    ot = MagicMock()
    ot.text = "Here is what I found"
    sc = _make_server_content(output_transcription=ot)
    msg = _make_gemini_message(server_content=sc)

    async def _fake_receive():
        yield msg

    bridge._session = MagicMock()
    bridge._session.receive = _fake_receive
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].event_type == "text_delta"
    assert events[0].text == "Here is what I found"


def test_gemini_receive_input_transcription():
    bridge = GeminiRealtimeBridge()
    bridge._connected = True

    it = MagicMock()
    it.text = "search for python"
    sc = _make_server_content(input_transcription=it)
    msg = _make_gemini_message(server_content=sc)

    async def _fake_receive():
        yield msg

    bridge._session = MagicMock()
    bridge._session.receive = _fake_receive
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].event_type == "transcription"
    assert events[0].text == "search for python"


def test_gemini_receive_model_turn_text():
    bridge = GeminiRealtimeBridge()
    bridge._connected = True

    part = MagicMock()
    part.text = "some text"
    part.inline_data = None
    mt = MagicMock()
    mt.parts = [part]
    sc = _make_server_content(model_turn=mt)
    msg = _make_gemini_message(server_content=sc)

    async def _fake_receive():
        yield msg

    bridge._session = MagicMock()
    bridge._session.receive = _fake_receive
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].event_type == "text_delta"
    assert events[0].text == "some text"


def test_gemini_discard_audio_model_turn():
    bridge = GeminiRealtimeBridge()
    bridge._connected = True

    part = MagicMock()
    part.text = None
    part.inline_data = MagicMock()
    mt = MagicMock()
    mt.parts = [part]
    sc = _make_server_content(model_turn=mt)
    msg = _make_gemini_message(server_content=sc)

    async def _fake_receive():
        yield msg

    bridge._session = MagicMock()
    bridge._session.receive = _fake_receive
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 0


def test_gemini_receive_not_connected():
    bridge = GeminiRealtimeBridge()
    bridge._connected = False
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 0


def test_gemini_receive_error():
    bridge = GeminiRealtimeBridge()
    bridge._connected = True

    async def _fake_receive():
        raise RuntimeError("connection lost")
        yield  # noqa: unreachable — makes this an async generator

    bridge._session = MagicMock()
    bridge._session.receive = _fake_receive
    events = asyncio.run(_collect(bridge.receive_events()))
    assert len(events) == 1
    assert events[0].event_type == "error"
    assert "connection lost" in events[0].error_message


# --- Send no-op when disconnected ---


def test_openai_send_audio_not_connected():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = False
    asyncio.run(bridge.send_audio(b"\x00\x01"))


def test_openai_send_text_not_connected():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = False
    asyncio.run(bridge.send_text("hello"))


def test_openai_send_tool_result_not_connected():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = False
    asyncio.run(bridge.send_tool_result("id", "name", "result"))


def test_gemini_send_audio_not_connected():
    bridge = GeminiRealtimeBridge()
    bridge._connected = False
    asyncio.run(bridge.send_audio(b"\x00\x01"))


def test_gemini_send_text_not_connected():
    bridge = GeminiRealtimeBridge()
    bridge._connected = False
    asyncio.run(bridge.send_text("hello"))


def test_gemini_send_tool_result_not_connected():
    bridge = GeminiRealtimeBridge()
    bridge._connected = False
    asyncio.run(bridge.send_tool_result("id", "name", "result"))


# --- _create_realtime_bridge routing ---


def test_routing_prefers_openai():
    from canvas_chat.app import _create_realtime_bridge

    bridge, model, provider = _create_realtime_bridge(
        openai_api_key="sk-test", gemini_api_key="gem-key"
    )
    assert isinstance(bridge, OpenAIRealtimeBridge)
    assert model == "gpt-realtime-2"
    assert provider == "openai"


def test_routing_falls_back_to_gemini():
    from canvas_chat.app import _create_realtime_bridge

    bridge, model, provider = _create_realtime_bridge(
        openai_api_key=None, gemini_api_key="gem-key"
    )
    assert isinstance(bridge, GeminiRealtimeBridge)
    assert model == "gemini-3.1-flash-live-preview"
    assert provider == "gemini"


def test_routing_openai_only():
    from canvas_chat.app import _create_realtime_bridge

    bridge, model, provider = _create_realtime_bridge(
        openai_api_key="sk-test", gemini_api_key=None
    )
    assert isinstance(bridge, OpenAIRealtimeBridge)
    assert provider == "openai"


def test_routing_no_key_returns_none():
    from canvas_chat.app import _create_realtime_bridge

    bridge, model, provider = _create_realtime_bridge(
        openai_api_key=None, gemini_api_key=None
    )
    assert bridge is None
    assert model is None
    assert provider is None


# --- Connect error wrapping ---


def test_openai_connect_wraps_error():
    async def _run():
        bridge = OpenAIRealtimeBridge()
        with patch("canvas_chat.realtime_providers.openai.AsyncOpenAI") as MockClient:
            mock_instance = MagicMock()
            mock_manager = MagicMock()
            mock_manager.__aenter__ = AsyncMock(side_effect=Exception("network fail"))
            mock_instance.realtime.connect.return_value = mock_manager
            MockClient.return_value = mock_instance

            with pytest.raises(ConnectionError, match="Failed to connect to OpenAI"):
                await bridge.connect("key", "model", [], "prompt")
        assert bridge._connected is False

    asyncio.run(_run())


def test_gemini_connect_wraps_error():
    async def _run():
        bridge = GeminiRealtimeBridge()
        with patch("canvas_chat.realtime_providers.gemini.genai.Client") as MockClient:
            mock_instance = MagicMock()
            mock_manager = MagicMock()
            mock_manager.__aenter__ = AsyncMock(side_effect=Exception("bad key"))
            mock_instance.aio.live.connect.return_value = mock_manager
            MockClient.return_value = mock_instance

            with pytest.raises(ConnectionError, match="Failed to connect to Gemini"):
                await bridge.connect("key", "model", SAMPLE_AGENT_TOOLS, "prompt")
        assert bridge._connected is False

    asyncio.run(_run())


# --- Close is safe to call multiple times ---


def test_openai_close_idempotent():
    bridge = OpenAIRealtimeBridge()
    bridge._connected = False
    asyncio.run(bridge.close())
    asyncio.run(bridge.close())


def test_gemini_close_idempotent():
    bridge = GeminiRealtimeBridge()
    bridge._connected = False
    asyncio.run(bridge.close())
    asyncio.run(bridge.close())


# --- Helpers ---


async def _collect(async_gen):
    return [e async for e in async_gen]
