"""Parsers extension points for AgentSam Knowledge SDK."""

from typing import Protocol

class ParserProvider(Protocol):
    """Marker protocol for provider implementations contributed by runtimes."""

    pass
