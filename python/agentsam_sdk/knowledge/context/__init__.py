"""Context extension points for AgentSam Knowledge SDK."""

from typing import Protocol

class ContextProvider(Protocol):
    """Marker protocol for provider implementations contributed by runtimes."""

    pass
