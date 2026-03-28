"""Map OpenAI-style chat payloads to llamabot ``BaseMessage`` lists."""

from __future__ import annotations

import json
from typing import Any

from llamabot.components.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    ToolMessage,
)


def message_content_to_str(content: str | list[Any]) -> str:
    """Normalize multimodal or string content to a single string for the LLM."""
    if isinstance(content, str):
        return content
    return json.dumps(content)


def dict_messages_to_system_and_rest(
    messages: list[dict[str, Any]],
) -> tuple[str, list[BaseMessage]]:
    """Split OpenAI-style dict messages into system prompt text and conversation turns.

    :param messages: Each dict should have ``role`` and ``content`` (string or list).
    :returns: ``(system_prompt, rest)`` where ``rest`` is user/assistant/tool messages.
    """
    system_chunks: list[str] = []
    rest: list[BaseMessage] = []
    for m in messages:
        role = m.get("role", "user")
        raw = m.get("content", "")
        content = message_content_to_str(raw) if not isinstance(raw, str) else raw
        if role == "system":
            system_chunks.append(content)
        elif role == "user":
            rest.append(HumanMessage(content=content))
        elif role == "assistant":
            rest.append(AIMessage(content=content))
        elif role == "tool":
            rest.append(ToolMessage(content=content))
        else:
            rest.append(HumanMessage(content=content))
    system_prompt = (
        "\n\n".join(system_chunks) if system_chunks else "You are a helpful assistant."
    )
    return system_prompt, rest


def pydantic_messages_to_system_and_rest(
    messages: list[Any],
) -> tuple[str, list[BaseMessage]]:
    """Like :func:`dict_messages_to_system_and_rest` for Pydantic ``Message`` models."""
    system_chunks: list[str] = []
    rest: list[BaseMessage] = []
    for m in messages:
        content = message_content_to_str(m.content)
        if m.role == "system":
            system_chunks.append(content)
        elif m.role == "user":
            rest.append(HumanMessage(content=content))
        elif m.role == "assistant":
            rest.append(AIMessage(content=content))
        elif m.role == "tool":
            rest.append(ToolMessage(content=content))
        else:
            rest.append(HumanMessage(content=content))
    system_prompt = (
        "\n\n".join(system_chunks) if system_chunks else "You are a helpful assistant."
    )
    return system_prompt, rest
