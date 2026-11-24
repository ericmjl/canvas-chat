"""Tests for OpenAI-style message splitting in llm_messages."""

from canvas_chat.llm_messages import (
    DEFAULT_SYSTEM_PROMPT,
    dict_messages_to_system_and_rest,
)


def test_default_system_prompt_when_no_system_message():
    """Requests with only user turns still get the shared default system prompt."""
    system_prompt, rest = dict_messages_to_system_and_rest(
        [{"role": "user", "content": "Hello"}]
    )
    assert system_prompt == DEFAULT_SYSTEM_PROMPT
    assert len(rest) == 1
    assert rest[0].content == "Hello"


def test_explicit_system_message_is_preserved():
    """Task-specific system prompts must not be replaced by the default."""
    system_prompt, rest = dict_messages_to_system_and_rest(
        [
            {"role": "system", "content": "You are a fact-checking assistant."},
            {"role": "user", "content": "Check this claim."},
        ]
    )
    assert system_prompt == "You are a fact-checking assistant."
    assert len(rest) == 1
