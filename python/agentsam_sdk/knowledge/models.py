"""Provider-neutral contracts for indexing and retrieval."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

JsonMap = Mapping[str, Any]

@dataclass(frozen=True, slots=True)
class Source:
    source_id: str
    source_type: str
    workspace_id: str
    uri: str
    repository_full_name: str | None = None
    ref: str | None = None
    commit_sha: str | None = None
    metadata: JsonMap = field(default_factory=dict)

@dataclass(frozen=True, slots=True)
class Document:
    document_id: str
    source_id: str
    workspace_id: str
    content_hash: str
    media_type: str
    title: str | None = None
    path: str | None = None
    text: str | None = None
    metadata: JsonMap = field(default_factory=dict)

@dataclass(frozen=True, slots=True)
class Chunk:
    chunk_id: str
    document_id: str
    workspace_id: str
    content: str
    ordinal: int
    content_hash: str
    token_count: int | None = None
    repository_full_name: str | None = None
    ref: str | None = None
    commit_sha: str | None = None
    path: str | None = None
    symbol: str | None = None
    heading_path: tuple[str, ...] = ()
    metadata: JsonMap = field(default_factory=dict)

@dataclass(frozen=True, slots=True)
class RepositoryDescriptor:
    repository_id: str
    full_name: str
    workspace_id: str
    default_branch: str
    product_ids: tuple[str, ...] = ()
    indexed_refs: tuple[str, ...] = ()
    enabled_lanes: tuple[str, ...] = ("code", "docs")
    include: tuple[str, ...] = ()
    exclude: tuple[str, ...] = ()
    metadata: JsonMap = field(default_factory=dict)

@dataclass(frozen=True, slots=True)
class RetrievalQuery:
    text: str
    workspace_id: str
    repositories: tuple[str, ...] = ()
    product_ids: tuple[str, ...] = ()
    refs: tuple[str, ...] = ()
    intent: str = "auto"
    lanes: tuple[str, ...] = ()
    top_k: int = 12
    token_budget: int = 8000
    require_current_ref: bool = True
    include_archived: bool = False
    explain: bool = True

@dataclass(frozen=True, slots=True)
class RetrievalHit:
    chunk_id: str
    content: str
    score: float
    lane: str
    repository_full_name: str | None = None
    ref: str | None = None
    commit_sha: str | None = None
    path: str | None = None
    line_start: int | None = None
    line_end: int | None = None
    reasons: tuple[str, ...] = ()
    source_authority: str = "unknown"
    stale: bool = False
    metadata: JsonMap = field(default_factory=dict)

@dataclass(frozen=True, slots=True)
class ContextPack:
    query_id: str
    query: RetrievalQuery
    hits: tuple[RetrievalHit, ...]
    estimated_tokens: int
    confidence: str = "unknown"
    diagnostics: JsonMap = field(default_factory=dict)

@dataclass(frozen=True, slots=True)
class IngestReceipt:
    run_id: str
    source_id: str
    status: str
    documents_seen: int = 0
    documents_indexed: int = 0
    chunks_indexed: int = 0
    chunks_deleted: int = 0
    errors: tuple[str, ...] = ()
    metadata: JsonMap = field(default_factory=dict)
