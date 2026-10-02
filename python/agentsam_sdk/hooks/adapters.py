"""Callback, subprocess, and HTTP ports for AgentSam Hooks."""
from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Mapping

from .contracts import HookEnvelope

_PORTABLE_ENV_KEYS = (
    "PATH", "Path", "PATHEXT", "SYSTEMROOT", "WINDIR", "HOME", "USERPROFILE",
    "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL",
)


def callback_adapter(handler: Callable[[Mapping[str, Any], Mapping[str, Any], HookEnvelope], Any]):
    async def invoke(envelope: HookEnvelope):
        result = handler(envelope.input, envelope.invocation, envelope)
        if hasattr(result, "__await__"):
            return await result
        return result
    return invoke


def command_adapter(
    command: str,
    args: list[str] | None = None,
    *,
    cwd: str | None = None,
    env: Mapping[str, str] | None = None,
    inherit_environment: bool = False,
    timeout_ms: int = 10_000,
    max_output_bytes: int = 1_048_576,
):
    if not str(command).strip():
        raise ValueError("hook_command_required")
    configured_args = [str(value) for value in (args or [])]
    environment = dict(os.environ) if inherit_environment else {
        key: os.environ[key] for key in _PORTABLE_ENV_KEYS if key in os.environ
    }
    environment.update({str(key): str(value) for key, value in (env or {}).items()})

    async def invoke(envelope: HookEnvelope):
        try:
            process = await asyncio.create_subprocess_exec(
                command, *configured_args,
                cwd=cwd or envelope.cwd,
                env=environment,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except Exception as error:
            failure = RuntimeError(f"hook_command_spawn_failed:{command}:{error}")
            failure.__cause__ = error
            raise failure
        payload = (json.dumps(envelope.to_dict(), separators=(",", ":")) + "\n").encode()
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(payload), timeout=timeout_ms / 1000)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise TimeoutError(f"hook_command_timeout:{command}:{timeout_ms}")
        if len(stdout) + len(stderr) > max_output_bytes:
            raise RuntimeError(f"hook_command_output_limit_exceeded:{command}:{max_output_bytes}")
        if process.returncode != 0:
            detail = stderr.decode(errors="replace").strip()[:512]
            raise RuntimeError(f"hook_command_failed:{command}:exit={process.returncode}:{detail}")
        lines = [line for line in stdout.decode().splitlines() if line.strip()]
        if not lines:
            return None
        try:
            return json.loads(lines[-1])
        except json.JSONDecodeError as error:
            raise RuntimeError(f"hook_command_invalid_json:{command}:{error}") from error

    return invoke


def http_adapter(
    url: str,
    *,
    headers: Mapping[str, str] | None = None,
    timeout_ms: int = 10_000,
    max_response_bytes: int = 1_048_576,
):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"unsupported_hook_http_protocol:{parsed.scheme}")
    if parsed.username or parsed.password:
        raise ValueError("hook_http_url_must_not_contain_credentials")
    configured_headers = {"Accept": "application/json", "Content-Type": "application/json", **dict(headers or {})}

    def failure(message: str, cause: BaseException) -> RuntimeError:
        error = RuntimeError(message)
        error.adapter = "http"
        error.protocol = "http"
        error.transport = parsed.scheme
        error.__cause__ = cause
        return error

    def request(envelope: HookEnvelope):
        payload = json.dumps(envelope.to_dict(), separators=(",", ":")).encode()
        req = urllib.request.Request(url, data=payload, headers=configured_headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout_ms / 1000) as response:
                body = response.read(max_response_bytes + 1)
        except urllib.error.HTTPError as error:
            detail = error.read(512).decode(errors="replace")
            raise failure(f"hook_http_failed:{error.code}:{detail}", error)
        except (urllib.error.URLError, TimeoutError) as error:
            detail = str(getattr(error, "reason", error))
            reason = "hook_http_timeout" if "timed out" in detail.lower() or isinstance(getattr(error, "reason", None), TimeoutError) else "hook_http_request_failed"
            raise failure(f"{reason}:{detail}", error)
        if len(body) > max_response_bytes:
            raise failure(f"hook_http_response_limit_exceeded:{max_response_bytes}", RuntimeError("response limit exceeded"))
        if not body.strip():
            return None
        try:
            return json.loads(body)
        except json.JSONDecodeError as error:
            raise failure(f"hook_http_invalid_json:{error}", error)

    async def invoke(envelope: HookEnvelope):
        return await asyncio.to_thread(request, envelope)

    return invoke
