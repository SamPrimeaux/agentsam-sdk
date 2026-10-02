"""Async reference runtime for AgentSam hooks."""
from __future__ import annotations

import asyncio
import copy
import inspect
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Mapping, Optional

from .contracts import FAILURE_MODES, HookEnvelope, HookOutput, normalize_event

HookHandler = Callable[[HookEnvelope], Optional[HookOutput | Mapping[str, Any]] | Awaitable[Optional[HookOutput | Mapping[str, Any]]]]


@dataclass(frozen=True)
class HookDefinition:
    id: str
    handler: HookHandler
    priority: float = 100
    timeout_ms: int = 10_000
    failure_mode: Optional[str] = None
    enabled: bool = True
    metadata: Mapping[str, Any] = field(default_factory=dict)


class HookExecutionError(RuntimeError):
    def __init__(self, definition: HookDefinition, cause: BaseException):
        super().__init__(f"hook_execution_failed:{definition.id}:{cause}")
        self.hook_id = definition.id
        self.__cause__ = cause


def _safe_error(error: BaseException) -> str:
    message = str(error)
    message = re.sub(r"(authorization\s*[:=]\s*bearer\s+)[^\s,;]+", r"\1[REDACTED]", message, flags=re.I)
    message = re.sub(r"((?:api[_-]?key|password|secret|token)\s*[:=]\s*)[^\s,;]+", r"\1[REDACTED]", message, flags=re.I)
    return message[:512]


def _default_failure_mode(event: str) -> str:
    return "closed" if event in ("pre_tool_use", "pre_model_use") else "open"


def _merge_output(current: dict[str, Any], update: dict[str, Any]) -> None:
    for key, value in update.items():
        if key == "additional_context":
            continue
        if key == "suppress_output":
            current[key] = bool(current.get(key)) or value is True
        elif key == "retry_count":
            current[key] = max(int(current.get(key, 0)), int(value))
        elif key == "cleanup_actions":
            current[key] = [*current.get(key, []), *value]
        elif key == "modified_config":
            current[key] = {**current.get(key, {}), **copy.deepcopy(value)}
        else:
            current[key] = copy.deepcopy(value)


def _update_input(event: str, value: dict[str, Any], output: dict[str, Any]) -> None:
    if "modified_args" in output:
        value["tool_args"] = copy.deepcopy(output["modified_args"])
    if "modified_request" in output:
        value["request"] = copy.deepcopy(output["modified_request"])
    if "modified_result" in output:
        value["tool_result" if event == "post_tool_use" else "model_result"] = copy.deepcopy(output["modified_result"])
    if "modified_prompt" in output:
        value["prompt"] = output["modified_prompt"]
    if "modified_transformed_prompt" in output:
        value["transformed_prompt"] = output["modified_transformed_prompt"]
    if "modified_config" in output:
        value["config"] = {**value.get("config", {}), **copy.deepcopy(output["modified_config"])}


def _terminal(event: str, output: dict[str, Any]) -> bool:
    return (
        event in ("pre_tool_use", "pre_model_use")
        and output.get("permission_decision") in ("deny", "ask")
    ) or (event == "agent_stop" and output.get("decision") == "block")


class HookRuntime:
    def __init__(self, *, clock: Callable[[], float] | None = None, on_receipt: Callable[[Mapping[str, Any]], Any] | None = None):
        self._clock = clock or (lambda: time.time() * 1000)
        self._on_receipt = on_receipt
        self._registry: dict[str, list[HookDefinition]] = {}
        self._sequence = 0

    def register(self, event: str, definition: HookDefinition | HookHandler, **options: Any) -> "HookRuntime":
        hook = normalize_event(event)
        if not isinstance(definition, HookDefinition):
            definition = HookDefinition(id=options.pop("id", f"{hook}:{self._sequence + 1}"), handler=definition, **options)
        if definition.failure_mode and definition.failure_mode not in FAILURE_MODES:
            raise ValueError(f"invalid_hook_failure_mode:{definition.failure_mode}")
        if definition.timeout_ms < 1 or definition.timeout_ms > 600_000:
            raise ValueError(f"invalid_hook_timeout_ms:{definition.timeout_ms}")
        rows = self._registry.setdefault(hook, [])
        if any(row.id == definition.id for row in rows):
            raise ValueError(f"duplicate_hook_id:{definition.id}")
        rows.append(definition)
        rows.sort(key=lambda row: (row.priority, row.id))
        self._sequence += 1
        return self

    def list(self, event: str | None = None) -> list[dict[str, Any]]:
        rows = self._registry.get(normalize_event(event), []) if event else [row for group in self._registry.values() for row in group]
        return [{
            "id": row.id, "hook": next((hook for hook, group in self._registry.items() if row in group), None),
            "priority": row.priority, "timeout_ms": row.timeout_ms,
            "failure_mode": row.failure_mode, "enabled": row.enabled, "metadata": dict(row.metadata),
        } for row in rows]

    async def _observe(self, receipt: Mapping[str, Any]) -> None:
        if self._on_receipt is None:
            return
        try:
            result = self._on_receipt(receipt)
            if inspect.isawaitable(result):
                await result
        except Exception:
            pass

    async def dispatch(
        self,
        event: str,
        input: Mapping[str, Any] | None = None,
        invocation: Mapping[str, Any] | None = None,
        *,
        cwd: str | None = None,
    ) -> dict[str, Any]:
        hook = normalize_event(event)
        working = copy.deepcopy(dict(input or {}))
        invocation_value = copy.deepcopy(dict(invocation or {}))
        combined: dict[str, Any] = {}
        contexts: list[str] = []
        receipts: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []

        for definition in self._registry.get(hook, []):
            if not definition.enabled:
                continue
            envelope = HookEnvelope(
                hook=hook,
                timestamp=int(self._clock()),
                cwd=str(cwd or working.get("cwd") or os.getcwd()),
                invocation=invocation_value,
                input=copy.deepcopy(working),
            )
            started = int(self._clock())
            try:
                result = definition.handler(envelope)
                if inspect.isawaitable(result):
                    result = await asyncio.wait_for(result, timeout=definition.timeout_ms / 1000)
                output = HookOutput.from_value(result).to_dict()
                _update_input(hook, working, output)
                _merge_output(combined, output)
                if output.get("additional_context"):
                    contexts.append(str(output["additional_context"]))
                receipt = {
                    "schema": "agentsam.hook.receipt.v1", "hook_id": definition.id, "hook": hook,
                    "status": "completed", "started_at": started, "completed_at": int(self._clock()),
                    "input_keys": sorted(envelope.input.keys()), "output_keys": sorted(output.keys()),
                }
                receipt["duration_ms"] = max(0, receipt["completed_at"] - started)
                receipts.append(receipt)
                await self._observe(receipt)
                if _terminal(hook, output):
                    break
            except Exception as error:
                completed = int(self._clock())
                safe_error = _safe_error(error)
                receipt = {
                    "schema": "agentsam.hook.receipt.v1", "hook_id": definition.id, "hook": hook,
                    "status": "failed", "started_at": started, "completed_at": completed,
                    "duration_ms": max(0, completed - started), "input_keys": sorted(envelope.input.keys()),
                    "output_keys": [], "error": {"code": getattr(error, "code", "AGENTSAM_HOOK_FAILED"), "message": safe_error},
                }
                receipts.append(receipt)
                errors.append({"hook_id": definition.id, "hook": hook, **receipt["error"]})
                await self._observe(receipt)
                mode = definition.failure_mode or _default_failure_mode(hook)
                if mode == "error":
                    raise HookExecutionError(definition, error) from error
                if mode == "closed":
                    combined.update({
                        "permission_decision": "deny",
                        "permission_decision_reason": f"Hook '{definition.id}' failed closed: {safe_error}",
                    })
                    break

        if contexts:
            combined["additional_context"] = "\n\n".join(contexts)
        return {
            "schema": "agentsam.hook.dispatch.v1", "hook": hook,
            "input": working, "output": combined, "receipts": receipts, "errors": errors,
        }
