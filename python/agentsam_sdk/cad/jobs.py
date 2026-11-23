"""Host-owned CAD job operations.

This client intentionally delegates to the installed SAM CAD operation port:
cad.job.generate, cad.job.status and cad.job.execute. The host owns
authorization, approvals, runner dispatch and the existing agentsam_cad_jobs
records. AgentSamClient exposes this facade through `cad_jobs`; a trusted
host operation invoker must be injected explicitly. Without one, calls fail
closed. No second queue, SQLite file, local process or ad-hoc job table is made.
"""
from __future__ import annotations

import asyncio
import math
import re
import time
from collections.abc import Callable, Mapping
from typing import Any

_ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
_ENGINES = frozenset(("freecad", "blender", "openscad"))
_TERMINAL = frozenset(("completed", "failed", "cancelled", "done", "error"))


class CadJobError(RuntimeError):
    def __init__(self, code: str, message: str | None = None, *, details: Mapping[str, Any] | None = None):
        self.code = code
        self.details = dict(details or {})
        super().__init__(message or code)


def _record(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise CadJobError("cad_job_response_invalid")
    if value.get("ok") is False:
        error = value.get("error")
        if isinstance(error, dict):
            raise CadJobError(str(error.get("code") or "cad_job_operation_failed"),
                              str(error.get("message") or error.get("code")),
                              details=error.get("details") if isinstance(error.get("details"), dict) else {})
        raise CadJobError(str(error or "cad_job_operation_failed"))
    for key in ("job", "result", "data"):
        nested = value.get(key)
        if isinstance(nested, dict) and (nested.get("id") or nested.get("job_id")):
            return nested
    if value.get("id") or value.get("job_id"):
        return value
    raise CadJobError("cad_job_identity_missing")


class CadJobClient:
    """Adapter over a trusted host invoker supplied by the CAD host integration."""

    def __init__(self, invoke: Callable[[str, dict[str, Any]], Any] | None = None):
        if invoke is not None and not callable(invoke):
            raise ValueError("cad_job_invoker_invalid")
        self._invoke = invoke

    def _call(self, operation: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not callable(self._invoke):
            raise CadJobError("cad_job_host_not_configured")
        value = self._invoke(operation, payload)
        if hasattr(value, "__await__"):
            close = getattr(value, "close", None)
            if callable(close):
                close()
            raise CadJobError("cad_async_invoker_requires_async_client")
        return _record(value)

    def submit(
        self,
        *,
        project_id: str,
        workspace_id: str,
        engine: str,
        prompt: str,
    ) -> CadJobHandle:
        if not isinstance(project_id, str) or not _ID.fullmatch(project_id):
            raise ValueError("cad_job_project_id_invalid")
        if not isinstance(workspace_id, str) or not _ID.fullmatch(workspace_id):
            raise ValueError("cad_job_workspace_id_invalid")
        if engine not in _ENGINES:
            raise ValueError("cad_job_engine_invalid")
        if not isinstance(prompt, str) or not 3 <= len(prompt.strip()) <= 12000:
            raise ValueError("cad_job_prompt_invalid")
        row = self._call("cad.job.generate", {
            "project_id": project_id,
            "workspace_id": workspace_id,
            "engine": engine,
            "prompt": prompt.strip(),
        })
        return CadJobHandle(self, project_id, row)

    def get(self, *, project_id: str, job_id: str) -> dict[str, Any]:
        if not isinstance(project_id, str) or not _ID.fullmatch(project_id):
            raise ValueError("cad_job_project_id_invalid")
        if not isinstance(job_id, str) or not _ID.fullmatch(job_id):
            raise ValueError("cad_job_id_invalid")
        return self._call("cad.job.status", {"project_id": project_id, "job_id": job_id})

    def execute(self, *, project_id: str, workspace_id: str, job_id: str) -> dict[str, Any]:
        if not isinstance(project_id, str) or not _ID.fullmatch(project_id):
            raise ValueError("cad_job_project_id_invalid")
        if not isinstance(workspace_id, str) or not _ID.fullmatch(workspace_id):
            raise ValueError("cad_job_workspace_id_invalid")
        if not isinstance(job_id, str) or not _ID.fullmatch(job_id):
            raise ValueError("cad_job_id_invalid")
        return self._call("cad.job.execute", {
            "project_id": project_id,
            "workspace_id": workspace_id,
            "job_id": job_id,
        })


class CadJobHandle:
    def __init__(self, client: CadJobClient, project_id: str, initial: dict[str, Any]):
        self._client = client
        self.project_id = project_id
        self.record = dict(initial)
        self.id = str(initial.get("job_id") or initial.get("id") or "")
        if not _ID.fullmatch(self.id):
            raise CadJobError("cad_job_identity_invalid")

    @property
    def status(self) -> str:
        return str(self.record.get("status") or "unknown")

    def refresh(self) -> dict[str, Any]:
        self.record = self._client.get(project_id=self.project_id, job_id=self.id)
        return dict(self.record)

    def wait(
        self,
        *,
        timeout: float = 3600.0,
        poll_interval: float = 1.0,
        max_poll_interval: float = 15.0,
    ) -> dict[str, Any]:
        if not all(math.isfinite(x) and x > 0 for x in (timeout, poll_interval, max_poll_interval)):
            raise ValueError("cad_job_wait_options_invalid")
        deadline = time.monotonic() + timeout
        delay = min(poll_interval, max_poll_interval)
        while True:
            state = self.refresh()
            status = str(state.get("status") or "").lower()
            if state.get("terminal") is True or status in _TERMINAL:
                return state
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CadJobError("cad_job_wait_timeout", details={"job_id": self.id, "status": status})
            time.sleep(min(delay, remaining))
            delay = min(max_poll_interval, delay * 1.5)


class AsyncCadJobClient:
    """Async façade for the same host-owned job port; no event-loop blocking."""

    def __init__(self, sync: CadJobClient):
        if not isinstance(sync, CadJobClient):
            raise ValueError("cad_job_client_required")
        self._sync = sync

    async def submit(self, **kwargs: Any) -> CadJobHandle:
        return await asyncio.to_thread(self._sync.submit, **kwargs)

    async def get(self, **kwargs: Any) -> dict[str, Any]:
        return await asyncio.to_thread(self._sync.get, **kwargs)

    async def execute(self, **kwargs: Any) -> dict[str, Any]:
        return await asyncio.to_thread(self._sync.execute, **kwargs)

    async def wait(self, handle: CadJobHandle, **kwargs: Any) -> dict[str, Any]:
        if not isinstance(handle, CadJobHandle):
            raise ValueError("cad_job_handle_required")
        return await asyncio.to_thread(handle.wait, **kwargs)
