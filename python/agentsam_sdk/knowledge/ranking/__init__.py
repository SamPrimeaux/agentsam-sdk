"""Ranking extension points for AgentSam Knowledge SDK."""

from typing import Protocol

class RankingProvider(Protocol):
    """Marker protocol for provider implementations contributed by runtimes."""

    pass
