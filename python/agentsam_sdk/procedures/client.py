"""Python client binding for the host-owned PrimeTech procedure operation.

This module deliberately does not spawn a shell, load a second catalog, or
create a privileged bridge. It delegates to an explicitly injected trusted
host operation, which owns authorization, execution and durable receipts.
"""
from __future__ import annotations

import asyncio
import inspect
import re
from typing import Any, Callable, Mapping

_ID = re.compile(r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")
_VERSION = re.compile(r"^\d+\.\d+\.\d+$")


class ProcedureClientError(RuntimeError):
    def __init__(self, code: str, message: str | None = None):
        self.code = code
        super().__init__(message or code)


class ProcedureClient:
    def __init__(self, invoke: Callable[[dict[str, Any]], Any] | None = None):
        self._invoke = invoke

    @staticmethod
    def _request(procedure_id: str, version: str, input: Mapping[str, Any] | None) -> dict[str, Any]:
        if not isinstance(procedure_id, str) or not _ID.fullmatch(procedure_id) or ".." in procedure_id:
            raise ProcedureClientError("primetech_procedure_id_invalid")
        if not isinstance(version, str) or not _VERSION.fullmatch(version):
            raise ProcedureClientError("primetech_procedure_version_invalid")
        if input is not None and not isinstance(input, Mapping):
            raise ProcedureClientError("primetech_procedure_input_object_required")
        return {"id": procedure_id, "version": version, "input": dict(input or {})}

    @staticmethod
    def _unwrap(result: Any) -> dict[str, Any]:
        if not isinstance(result, dict):
            raise ProcedureClientError("primetech_procedure_response_invalid")
        if result.get("ok") is False:
            error = result.get("error") or {}
            code = error.get("code") if isinstance(error, dict) else str(error)
            raise ProcedureClientError(code or "primetech_procedure_failed")
        payload = result.get("data") if result.get("schema") == "sam.result.v1" else result
        if not isinstance(payload, dict) or payload.get("schema") != "inneranimalmedia.primetech.procedure-run.v1":
            raise ProcedureClientError("primetech_procedure_response_invalid")
        if payload.get("status") != "completed" or not (payload.get("verification") or {}).get("ok"):
            raise ProcedureClientError("primetech_procedure_verification_failed")
        return payload

    def run(self, procedure_id: str, version: str, input: Mapping[str, Any] | None = None) -> dict[str, Any]:
        if self._invoke is None:
            raise ProcedureClientError("sam_procedure_host_not_configured")
        request = self._request(procedure_id, version, input)
        result = self._invoke(request)
        if inspect.isawaitable(result):
            close = getattr(result, "close", None)
            if callable(close):
                close()
            raise ProcedureClientError("primetech_async_invoker_requires_arun")
        return self._unwrap(result)

    async def arun(self, procedure_id: str, version: str, input: Mapping[str, Any] | None = None) -> dict[str, Any]:
        if self._invoke is None:
            raise ProcedureClientError("sam_procedure_host_not_configured")
        request = self._request(procedure_id, version, input)
        if inspect.iscoroutinefunction(self._invoke):
            result = await self._invoke(request)
        else:
            result = await asyncio.to_thread(self._invoke, request)
            if inspect.isawaitable(result):
                result = await result
        return self._unwrap(result)
