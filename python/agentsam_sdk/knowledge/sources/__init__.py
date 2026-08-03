"""Sources extension points for AgentSam Knowledge SDK."""

from typing import Protocol

class SourceProvider(Protocol):
    """Marker protocol for provider implementations contributed by runtimes."""

    pass
