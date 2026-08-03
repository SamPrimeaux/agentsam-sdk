"""Async client facade for an AgentSam knowledge runtime."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Mapping, Protocol

from .models import ContextPack, IngestReceipt, RetrievalHit, RetrievalQuery

class KnowledgeTransport(Protocol):
    async def request(self, operation: str, payload: Mapping[str, Any]) -> Mapping[str, Any]: ...

class KnowledgeClient:
    def __init__(self, transport: KnowledgeTransport) -> None:
        self._transport = transport

    async def retrieve(self, query: RetrievalQuery) -> ContextPack:
        data = await self._transport.request("knowledge.retrieve", asdict(query))
        hits = tuple(RetrievalHit(**item) for item in data.get("hits", ()))
        return ContextPack(
            query_id=str(data["query_id"]),
            query=query,
            hits=hits,
            estimated_tokens=int(data.get("estimated_tokens", 0)),
            confidence=str(data.get("confidence", "unknown")),
            diagnostics=data.get("diagnostics", {}),
        )

    async def index(self, source_id: str, *, incremental: bool = True) -> IngestReceipt:
        data = await self._transport.request(
            "knowledge.index", {"source_id": source_id, "incremental": incremental}
        )
        return IngestReceipt(**data)
