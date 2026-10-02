"""Portable AgentSam lifecycle hooks."""
from .adapters import callback_adapter, command_adapter, http_adapter
from .contracts import (
    ERROR_HANDLING_DECISIONS,
    FAILURE_MODES,
    HOOK_EVENTS,
    HOOK_PROTOCOL_SCHEMA,
    HOOK_RECEIPT_SCHEMA,
    PERMISSION_DECISIONS,
    HookEnvelope,
    HookOutput,
    normalize_event,
)
from .runtime import HookDefinition, HookExecutionError, HookRuntime

__all__ = [
    "ERROR_HANDLING_DECISIONS",
    "FAILURE_MODES",
    "HOOK_EVENTS",
    "HOOK_PROTOCOL_SCHEMA",
    "HOOK_RECEIPT_SCHEMA",
    "PERMISSION_DECISIONS",
    "HookDefinition",
    "HookEnvelope",
    "HookExecutionError",
    "HookOutput",
    "HookRuntime",
    "callback_adapter",
    "command_adapter",
    "http_adapter",
    "normalize_event",
]
