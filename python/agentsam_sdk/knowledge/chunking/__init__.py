"""Chunking extension points for AgentSam Knowledge SDK."""

from typing import Protocol

class ChunkingProvider(Protocol):
    """Marker protocol for provider implementations contributed by runtimes."""

    pass
