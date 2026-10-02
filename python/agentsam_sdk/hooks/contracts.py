"""Language-neutral AgentSam hook protocol models.

The wire contract uses snake_case and JSON-compatible values so the same hook
can run in-process, as a subprocess, or behind HTTP in any SDK language.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Mapping, Optional

HOOK_PROTOCOL_SCHEMA = "agentsam.hook.v1"
HOOK_RECEIPT_SCHEMA = "agentsam.hook.receipt.v1"
HOOK_EVENTS = (
    "session_start", "session_end", "user_prompt_submitted", "user_prompt_transformed",
    "pre_model_use", "post_model_use", "pre_tool_use", "post_tool_use",
    "post_tool_use_failure", "error_occurred", "agent_stop", "subagent_start", "subagent_stop",
)
PERMISSION_DECISIONS = ("allow", "deny", "ask")
ERROR_HANDLING_DECISIONS = ("retry", "skip", "abort")
FAILURE_MODES = ("open", "closed", "error")


def normalize_event(value: str) -> str:
    source = str(value or "").strip()
    if source in HOOK_EVENTS:
        return source
    if source.startswith("on") and len(source) > 2:
        source = source[2:3].lower() + source[3:]
    normalized = ""
    for character in source:
        if character.isupper():
            normalized += "_" + character.lower()
        else:
            normalized += character
    if normalized in HOOK_EVENTS:
        return normalized
    raise ValueError(f"unsupported_hook_event:{value or '<missing>'}")


@dataclass(frozen=True)
class HookEnvelope:
    hook: str
    timestamp: int
    cwd: str
    invocation: Mapping[str, Any] = field(default_factory=dict)
    input: Mapping[str, Any] = field(default_factory=dict)
    schema: str = HOOK_PROTOCOL_SCHEMA

    def __post_init__(self) -> None:
        normalize_event(self.hook)
        if self.timestamp < 0:
            raise ValueError("hook_timestamp_must_be_non_negative")
        allowed = {"session_id", "run_id", "turn_id", "message_id", "agent_id", "parent_agent_id", "source", "metadata"}
        unknown = set(self.invocation) - allowed
        if unknown:
            raise ValueError(f"unsupported_hook_invocation_field:{sorted(unknown)[0]}")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "HookEnvelope":
        if value.get("schema") != HOOK_PROTOCOL_SCHEMA:
            raise ValueError(f"unsupported_hook_schema:{value.get('schema')}")
        return cls(
            hook=normalize_event(str(value.get("hook", ""))),
            timestamp=int(value.get("timestamp", 0)),
            cwd=str(value.get("cwd", "")),
            invocation=dict(value.get("invocation") or {}),
            input=dict(value.get("input") or {}),
        )


@dataclass(frozen=True)
class HookOutput:
    permission_decision: Optional[str] = None
    permission_decision_reason: Optional[str] = None
    modified_args: Optional[Mapping[str, Any]] = None
    modified_request: Optional[Mapping[str, Any]] = None
    modified_result: Any = None
    modified_prompt: Optional[str] = None
    modified_transformed_prompt: Optional[str] = None
    additional_context: Optional[str] = None
    suppress_output: Optional[bool] = None
    error_handling: Optional[str] = None
    retry_count: Optional[int] = None
    user_notification: Optional[str] = None
    decision: Optional[str] = None
    reason: Optional[str] = None
    cleanup_actions: Optional[list[str]] = None
    session_summary: Optional[str] = None
    metadata: Optional[Mapping[str, Any]] = None
    _present_fields: frozenset[str] = field(default_factory=frozenset, repr=False, compare=False)

    def __post_init__(self) -> None:
        if self.permission_decision and self.permission_decision not in PERMISSION_DECISIONS:
            raise ValueError(f"invalid_permission_decision:{self.permission_decision}")
        if self.error_handling and self.error_handling not in ERROR_HANDLING_DECISIONS:
            raise ValueError(f"invalid_error_handling:{self.error_handling}")
        if self.decision and self.decision not in ("allow", "block"):
            raise ValueError(f"invalid_stop_decision:{self.decision}")
        if self.retry_count is not None and not 0 <= self.retry_count <= 10:
            raise ValueError("retry_count_must_be_between_0_and_10")

    def to_dict(self) -> dict[str, Any]:
        values = asdict(self)
        values.pop("_present_fields", None)
        return {
            key: value for key, value in values.items()
            if value is not None or key in self._present_fields
        }

    @classmethod
    def from_value(cls, value: Optional[Mapping[str, Any] | "HookOutput"]) -> "HookOutput":
        if value is None:
            return cls()
        if isinstance(value, cls):
            return value
        fields = dict(value)
        return cls(**fields, _present_fields=frozenset(fields))
