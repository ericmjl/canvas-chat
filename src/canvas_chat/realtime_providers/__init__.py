"""
Realtime provider bridges for OpenAI Realtime 2 and Gemini Live API 3.1.

Defines a unified RealtimeProviderBridge ABC that both providers implement,
and a ProviderEvent dataclass for the common event format.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from dataclasses import dataclass


@dataclass
class ProviderEvent:
    """
    Common event format emitted by all provider bridges.

    The backend's WebSocket handler processes these events uniformly
    regardless of which provider generated them.
    """

    event_type: str
    tool_name: str | None = None
    tool_args: dict | None = None
    tool_call_id: str | None = None
    text: str | None = None
    error_message: str | None = None


# @spec RT-PROV-001
class RealtimeProviderBridge(ABC):
    """
    Abstract base class for realtime voice provider bridges.

    Each provider (OpenAI Realtime 2, Gemini Live API 3.1) implements
    this interface. The backend calls these methods uniformly; provider-specific
    details (WebSocket URLs, event names, tool formats) are encapsulated
    within each implementation.
    """

    @abstractmethod
    async def connect(
        self,
        api_key: str,
        model: str,
        tools: list,
        system_prompt: str,
    ) -> None:
        """Establish connection to the provider's realtime WebSocket API."""
        ...

    @abstractmethod
    async def send_audio(self, pcm_chunk: bytes) -> None:
        """Send a PCM16 audio chunk (24kHz mono) to the provider."""
        ...

    @abstractmethod
    async def send_text(self, text: str) -> None:
        """Send a text message to the provider as user input."""
        ...

    @abstractmethod
    async def send_input_end(self) -> None:
        """Signal that the user's current input turn is complete."""
        ...

    @abstractmethod
    async def send_tool_result(self, call_id: str, tool_name: str, result: str) -> None:
        """Send a tool execution result back to the provider."""
        ...

    @abstractmethod
    async def receive_events(self) -> AsyncGenerator[ProviderEvent, None]:
        """Yield provider events as they arrive."""
        ...

    @abstractmethod
    async def close(self) -> None:
        """Close the provider connection and release resources."""
        ...
