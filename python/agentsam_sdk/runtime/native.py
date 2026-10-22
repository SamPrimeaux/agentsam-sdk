"""Native, stdlib-only implementations of the shared AgentSam local runtime.

This module is intentionally independent of the FSL-licensed Node implementation.
Its behavior is derived from protocol/runtime/workspace-fs.v1.schema.json and
protocol/runtime/workspace-fs.conformance.v1.json. Host identity, workspace
root, receipt destination, D1 adapter and approval callback are injected by the
trusted caller; operation input can never replace them.
"""
from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import logging
import os
import queue
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

from .contract import ToolInput, ToolResult

LOG = logging.getLogger(__name__)

MAX_FILE_BYTES = 512 * 1024
DEFAULT_TIMEOUT_MS = 120_000
MAX_TIMEOUT_MS = 900_000
DEFAULT_OUTPUT_BYTES = 512 * 1024
MAX_OUTPUT_BYTES = 2 * 1024 * 1024
MAX_SCRIPT_ARGS = 128
MAX_LIST_ENTRIES = 300
MAX_LIST_DEPTH = 5

SKIP_DIRS = frozenset({
    ".git", "node_modules", ".agentsam", ".next", "dist", "build",
    "coverage", ".venv", "venv",
})
PROTECTED_PARTS = frozenset({
    ".git", "node_modules", ".env", ".npmrc", ".pypirc", ".netrc",
    ".ssh", ".aws", ".config", ".agentsam",
})
COMMAND_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]*$")
SQL_WRITE_RE = re.compile(r"^\s*(INSERT|UPDATE|DELETE|REPLACE)\b", re.IGNORECASE)
SAFE_ENV_KEYS = frozenset({
    "PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "LC_CTYPE",
    "TZ", "TERM", "NO_COLOR", "USER", "LOGNAME", "SYSTEMROOT", "COMSPEC",
})
SECRET_KEY_RE = re.compile(
    r"(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSCODE|API_KEY|PRIVATE_KEY|AUTHORIZATION|COOKIE|CREDENTIAL)(?:_|$)",
    re.IGNORECASE,
)
REDACT_PATTERNS = (
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/-]+=*"), r"\1[REDACTED]"),
    (re.compile(r"(?i)((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization)\s*[:=]\s*)[^\s,;]+"), r"\1[REDACTED]"),
    (re.compile(r"\b(?:sk-proj-|sk-live-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_\-]{12,}\b"), "[REDACTED]"),
)


class NativeOperationError(RuntimeError):
    def __init__(self, code: str, message: str | None = None):
        self.code = code
        super().__init__(message or code)


def _sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha_text(value: str) -> str:
    return _sha_bytes(value.encode("utf-8"))


def _canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return _sha_text(encoded)


def _iso(unix: float) -> str:
    return datetime.fromtimestamp(unix, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _safe_text(value: str, maximum: int = 512 * 1024) -> str:
    result = value
    for pattern, replacement in REDACT_PATTERNS:
        result = pattern.sub(replacement, result)
    return result[:maximum]


def _unsafe_part(part: str) -> bool:
    lowered = part.lower()
    return (
        part in PROTECTED_PARTS
        or lowered.startswith(".env.")
        or lowered.endswith(".pem")
        or lowered.endswith(".key")
    )


def _require_object(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise NativeOperationError("sam_input_object_required")
    return value


def _check_keys(value: dict[str, Any], allowed: set[str], required: set[str] = frozenset()) -> None:
    extras = sorted(set(value) - allowed)
    if extras:
        raise NativeOperationError("sam_input_additional_properties_not_allowed")
    if not required.issubset(value):
        raise NativeOperationError("sam_input_required_property_missing")


def _workspace_root(value: str | Path | None) -> Path:
    if value is None:
        raise NativeOperationError("workspace_root_not_configured")
    try:
        root = Path(value).expanduser().resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as exc:
        raise NativeOperationError("workspace_root_not_found") from exc
    if not root.is_dir():
        raise NativeOperationError("workspace_root_not_directory")
    return root


def _scoped_path(root_value: str | Path | None, relative: Any, *, allow_root: bool = False) -> tuple[Path, str, Path]:
    root = _workspace_root(root_value)
    if not isinstance(relative, str) or not relative or len(relative) > 2048 or Path(relative).is_absolute():
        raise NativeOperationError("workspace_relative_path_required")
    lexical = Path(os.path.abspath(root / relative))
    if lexical == root:
        if allow_root:
            return root, ".", root
        raise NativeOperationError("workspace_path_outside_root")
    if not lexical.is_relative_to(root):
        raise NativeOperationError("workspace_path_outside_root")
    rel = lexical.relative_to(root)
    if any(_unsafe_part(part) for part in rel.parts):
        raise NativeOperationError("workspace_protected_path")
    parent = lexical.parent
    try:
        real_parent = parent.resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as exc:
        raise NativeOperationError("workspace_parent_not_found") from exc
    if real_parent != root and not real_parent.is_relative_to(root):
        raise NativeOperationError("workspace_symlink_escape")
    if lexical.is_symlink():
        raise NativeOperationError("workspace_symlink_not_allowed")
    return lexical, rel.as_posix(), root


def workspace_read(input: Mapping[str, Any], root: str | Path | None) -> dict[str, Any]:
    data = _require_object(dict(input))
    _check_keys(data, {"path"}, {"path"})
    target, relative, _ = _scoped_path(root, data["path"])
    try:
        stat = target.stat()
        if not target.is_file():
            raise NativeOperationError("workspace_not_regular_file")
        if stat.st_size > MAX_FILE_BYTES:
            raise NativeOperationError("workspace_read_limit_exceeded")
        content = target.read_bytes().decode("utf-8", errors="replace")
    except NativeOperationError:
        raise
    except FileNotFoundError as exc:
        raise NativeOperationError("workspace_path_not_found") from exc
    except OSError as exc:
        raise NativeOperationError("workspace_read_failed") from exc
    if "\0" in content:
        raise NativeOperationError("workspace_binary_file_unsupported")
    return {
        "path": relative,
        "content": content,
        "sha256": _sha_text(content),
        "bytes": stat.st_size,
        "verified": True,
    }


def workspace_list(input: Mapping[str, Any], root: str | Path | None) -> dict[str, Any]:
    data = _require_object(dict(input))
    _check_keys(data, {"path", "depth", "max_entries"})
    requested = data.get("path", ".")
    if requested == ".":
        directory, relative_root, workspace = _scoped_path(root, ".", allow_root=True)
    else:
        directory, relative_root, workspace = _scoped_path(root, requested)
    try:
        if directory.is_symlink():
            raise NativeOperationError("workspace_symlink_not_allowed")
        if not directory.is_dir():
            raise NativeOperationError("workspace_not_directory")
    except OSError as exc:
        raise NativeOperationError("workspace_path_not_found") from exc
    depth_value = data.get("depth", 3)
    entries_value = data.get("max_entries", 100)
    if not isinstance(depth_value, int) or isinstance(depth_value, bool):
        raise NativeOperationError("workspace_list_depth_invalid")
    if not isinstance(entries_value, int) or isinstance(entries_value, bool):
        raise NativeOperationError("workspace_list_limit_invalid")
    depth = max(1, min(MAX_LIST_DEPTH, depth_value))
    limit = max(1, min(MAX_LIST_ENTRIES, entries_value))
    entries: list[dict[str, Any]] = []
    pending: list[tuple[Path, int]] = [(directory, 0)]
    truncated = False
    while pending:
        current, level = pending.pop(0)
        try:
            children = sorted(current.iterdir(), key=lambda item: item.name)
        except OSError as exc:
            raise NativeOperationError("workspace_list_failed") from exc
        for child in children:
            if len(entries) >= limit:
                truncated = True
                break
            name = child.name
            if name.startswith(".") or _unsafe_part(name) or name in SKIP_DIRS:
                continue
            try:
                if child.is_symlink():
                    continue
                if not child.is_file() and not child.is_dir():
                    continue
                rel = child.relative_to(workspace).as_posix()
                is_directory = child.is_dir()
                row: dict[str, Any] = {"path": rel, "type": "directory" if is_directory else "file"}
                if not is_directory:
                    row["bytes"] = child.stat().st_size
                entries.append(row)
                if is_directory and level + 1 < depth:
                    pending.append((child, level + 1))
            except (OSError, ValueError):
                continue
        if truncated:
            break
    return {
        "schema": "sam.workspace.list.v1",
        "root": relative_root,
        "entries": entries,
        "truncated": truncated,
        "limit": limit,
        "depth": depth,
    }


def workspace_stat(input: Mapping[str, Any], root: str | Path | None) -> dict[str, Any]:
    data = _require_object(dict(input))
    _check_keys(data, {"path"}, {"path"})
    requested = data["path"]
    if requested == ".":
        target, relative, _ = _scoped_path(root, ".", allow_root=True)
    else:
        target, relative, _ = _scoped_path(root, requested)
    try:
        stat = target.stat()
    except FileNotFoundError as exc:
        raise NativeOperationError("workspace_path_not_found") from exc
    except OSError as exc:
        raise NativeOperationError("workspace_stat_failed") from exc
    if target.is_dir():
        return {"path": relative, "type": "directory", "bytes": None, "sha256": None}
    if not target.is_file():
        raise NativeOperationError("workspace_not_regular_file")
    digest = None
    if stat.st_size <= MAX_FILE_BYTES:
        try:
            digest = _sha_bytes(target.read_bytes())
        except OSError as exc:
            raise NativeOperationError("workspace_stat_failed") from exc
    return {"path": relative, "type": "file", "bytes": stat.st_size, "sha256": digest}


def _read_existing_for_write(target: Path) -> bytes | None:
    if not target.exists():
        return None
    try:
        if not target.is_file():
            raise NativeOperationError("workspace_not_regular_file")
        previous = target.read_bytes()
    except NativeOperationError:
        raise
    except OSError as exc:
        raise NativeOperationError("workspace_read_failed") from exc
    if len(previous) > MAX_FILE_BYTES:
        raise NativeOperationError("workspace_write_existing_file_too_large")
    return previous


def _atomic_write(target: Path, content: str, previous: bytes | None, expected_sha256: Any) -> dict[str, Any]:
    encoded = content.encode("utf-8")
    if len(encoded) > MAX_FILE_BYTES or "\0" in content:
        raise NativeOperationError("workspace_write_content_invalid")
    if previous is not None:
        if not isinstance(expected_sha256, str) or expected_sha256 != _sha_bytes(previous):
            raise NativeOperationError("workspace_write_conflict_expected_sha256_required")
    elif expected_sha256:
        raise NativeOperationError("workspace_write_conflict_file_missing")
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix=target.name + ".agentsam-", suffix=".tmp",
            dir=str(target.parent), delete=False,
        ) as stream:
            temp_name = stream.name
            try:
                os.chmod(temp_name, 0o600)
            except OSError:
                pass
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        # Re-check an update after staging to narrow the optimistic-write race.
        if previous is not None:
            current = target.read_bytes()
            if _sha_bytes(current) != _sha_bytes(previous):
                raise NativeOperationError("workspace_write_conflict_expected_sha256_required")
            os.replace(temp_name, target)
            temp_name = None
        else:
            # Exclusive create prevents replacing a file created after preflight.
            descriptor = os.open(str(target), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(descriptor, "wb") as stream:
                    stream.write(encoded)
                    stream.flush()
                    os.fsync(stream.fileno())
            except Exception:
                try:
                    target.unlink()
                except OSError:
                    pass
                raise
        return {
            "path": target.name if not target.name else target.name,
            "sha256": _sha_bytes(encoded),
            "bytes": len(encoded),
            "written": True,
        }
    except FileExistsError as exc:
        raise NativeOperationError("workspace_write_conflict_file_missing") from exc
    except NativeOperationError:
        raise
    except OSError as exc:
        raise NativeOperationError("workspace_write_failed") from exc
    finally:
        if temp_name:
            try:
                Path(temp_name).unlink()
            except OSError:
                pass


def workspace_write(input: Mapping[str, Any], root: str | Path | None) -> dict[str, Any]:
    data = _require_object(dict(input))
    _check_keys(data, {"path", "content", "expected_sha256"}, {"path", "content"})
    if not isinstance(data["content"], str):
        raise NativeOperationError("workspace_write_content_invalid")
    target, relative, _ = _scoped_path(root, data["path"])
    previous = _read_existing_for_write(target)
    output = _atomic_write(target, data["content"], previous, data.get("expected_sha256"))
    output["path"] = relative
    return output


def workspace_patch(input: Mapping[str, Any], root: str | Path | None) -> dict[str, Any]:
    data = _require_object(dict(input))
    _check_keys(data, {"path", "expected_sha256", "old_text", "new_text"},
                {"path", "expected_sha256", "old_text", "new_text"})
    if not isinstance(data["old_text"], str) or not data["old_text"]:
        raise NativeOperationError("workspace_patch_old_text_required")
    if not isinstance(data["new_text"], str):
        raise NativeOperationError("workspace_patch_new_text_invalid")
    target, relative, _ = _scoped_path(root, data["path"])
    previous = _read_existing_for_write(target)
    if previous is None:
        raise NativeOperationError("workspace_path_not_found")
    if not isinstance(data["expected_sha256"], str) or _sha_bytes(previous) != data["expected_sha256"]:
        raise NativeOperationError("workspace_write_conflict_expected_sha256_required")
    content = previous.decode("utf-8", errors="replace")
    count = content.count(data["old_text"])
    if count == 0:
        raise NativeOperationError("workspace_patch_old_text_not_found")
    if count != 1:
        raise NativeOperationError("workspace_patch_old_text_ambiguous")
    updated = content.replace(data["old_text"], data["new_text"], 1)
    output = _atomic_write(target, updated, previous, data["expected_sha256"])
    output["path"] = relative
    output["patched"] = True
    return output


def workspace_remove(input: Mapping[str, Any], root: str | Path | None) -> dict[str, Any]:
    data = _require_object(dict(input))
    _check_keys(data, {"path", "expected_sha256"}, {"path", "expected_sha256"})
    target, relative, _ = _scoped_path(root, data["path"])
    previous = _read_existing_for_write(target)
    if previous is None:
        raise NativeOperationError("workspace_remove_file_not_found")
    if not isinstance(data["expected_sha256"], str) or _sha_bytes(previous) != data["expected_sha256"]:
        raise NativeOperationError("workspace_write_conflict_expected_sha256_required")
    try:
        # Refuse if the file changed after the hash check.
        if _sha_bytes(target.read_bytes()) != data["expected_sha256"]:
            raise NativeOperationError("workspace_write_conflict_expected_sha256_required")
        target.unlink()
    except NativeOperationError:
        raise
    except OSError as exc:
        raise NativeOperationError("workspace_remove_failed") from exc
    return {"path": relative, "sha256": data["expected_sha256"], "bytes": len(previous), "removed": True}


def _expand_home(value: str) -> str:
    if value == "~":
        return str(Path.home())
    if value.startswith("~/"):
        return str(Path.home() / value[2:])
    return value


def _relative_cwd(root: Path, value: Any) -> Path:
    if not isinstance(value, str) or len(value) > 2048 or Path(value).is_absolute():
        raise NativeOperationError("terminal_relative_cwd_invalid")
    root = root.resolve(strict=True)
    requested = value or "."
    lexical = Path(os.path.abspath(root / requested))
    if lexical != root and not lexical.is_relative_to(root):
        raise NativeOperationError("terminal_relative_cwd_outside_project")
    candidate = lexical.resolve(strict=True)
    if candidate != root and not candidate.is_relative_to(root):
        raise NativeOperationError("terminal_relative_cwd_outside_project")
    if not candidate.is_dir():
        raise NativeOperationError("terminal_cwd_not_directory")
    return candidate


def _subprocess_env(host_env: Mapping[str, str] | None) -> dict[str, str]:
    source = host_env if host_env is not None else os.environ
    return {
        key: value for key, value in source.items()
        if key in SAFE_ENV_KEYS and isinstance(value, str) and not SECRET_KEY_RE.search(key)
    }


def _run_bounded_process(
    command: str, args: list[str], cwd: Path, env: dict[str, str],
    timeout_ms: int, max_output_bytes: int,
) -> dict[str, Any]:
    if not COMMAND_RE.fullmatch(command):
        raise NativeOperationError("terminal_command_must_be_pathless_executable")
    if len(args) > MAX_SCRIPT_ARGS or any(not isinstance(arg, str) or "\0" in arg or len(arg) > 8192 for arg in args):
        raise NativeOperationError("terminal_argument_limit_exceeded")
    args = [_expand_home(arg) for arg in args]
    if shutil.which(command, path=env.get("PATH")) is None:
        raise NativeOperationError("ENOENT", "Requested executable was not found on PATH.")
    timeout_ms = max(1, min(MAX_TIMEOUT_MS, timeout_ms))
    max_output_bytes = max(1024, min(MAX_OUTPUT_BYTES, max_output_bytes))
    try:
        proc = subprocess.Popen(
            [command, *args], cwd=str(cwd), env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False,
            close_fds=True, start_new_session=(os.name != "nt"),
        )
    except OSError as exc:
        raise NativeOperationError("terminal_process_start_failed") from exc

    events: queue.Queue[tuple[str, bytes | None]] = queue.Queue()

    def pump(name: str, stream: Any) -> None:
        try:
            while True:
                chunk = stream.read(4096)
                if not chunk:
                    break
                events.put((name, chunk))
        finally:
            events.put((name, None))
            try:
                stream.close()
            except OSError:
                pass

    threads = [
        threading.Thread(target=pump, args=("stdout", proc.stdout), daemon=True),
        threading.Thread(target=pump, args=("stderr", proc.stderr), daemon=True),
    ]
    for thread in threads:
        thread.start()
    def stop_process() -> None:
        if proc.poll() is not None:
            return
        try:
            if os.name == "nt":
                proc.terminate()
            else:
                os.killpg(proc.pid, signal.SIGTERM)
        except OSError:
            try:
                proc.terminate()
            except OSError:
                pass
        try:
            proc.wait(timeout=1)
        except subprocess.TimeoutExpired:
            try:
                if os.name == "nt":
                    proc.kill()
                else:
                    os.killpg(proc.pid, signal.SIGKILL)
            except OSError:
                proc.kill()

    out = bytearray()
    err = bytearray()
    captured = 0
    closed_streams = 0
    deadline = time.monotonic() + timeout_ms / 1000
    terminal_status: str | None = None
    while closed_streams < 2:
        remaining = deadline - time.monotonic()
        if remaining <= 0 and proc.poll() is None:
            terminal_status = "timed_out"
            stop_process()
        try:
            name, chunk = events.get(timeout=max(0.01, min(0.1, max(0.01, remaining))))
        except queue.Empty:
            if proc.poll() is not None:
                continue
            if terminal_status:
                continue
            continue
        if chunk is None:
            closed_streams += 1
            continue
        if terminal_status:
            continue
        allowance = max_output_bytes - captured
        if len(chunk) > allowance:
            # Match the Node runner: a chunk that crosses the aggregate cap is
            # rejected as a whole rather than partially appended.
            terminal_status = "output_limit"
            stop_process()
            continue
        (out if name == "stdout" else err).extend(chunk)
        captured += len(chunk)
    for thread in threads:
        thread.join(timeout=1)
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    stdout = _safe_text(out.decode("utf-8", errors="replace"), max_output_bytes)
    stderr = _safe_text(err.decode("utf-8", errors="replace"), max_output_bytes)
    exit_code = proc.returncode if terminal_status is None else None
    signal_name = None
    if terminal_status is not None:
        signal_name = "SIGKILL" if proc.returncode is not None and proc.returncode < 0 else None
    elif proc.returncode is not None and proc.returncode < 0:
        try:
            signal_name = signal.Signals(-proc.returncode).name
        except (ValueError, OSError):
            signal_name = "SIGNAL"
    ok = terminal_status is None and proc.returncode == 0
    return {
        "ok": ok,
        "command": command,
        "args": args,
        "project_root": str(_workspace_root(cwd)),
        "cwd": str(cwd),
        "exit_code": exit_code,
        "signal": signal_name,
        "stdout": stdout,
        "stderr": stderr,
        "_status": terminal_status or ("completed" if ok else "failed"),
    }


def terminal_exec(input: Mapping[str, Any], root: str | Path | None, env: Mapping[str, str] | None = None) -> dict[str, Any]:
    data = _require_object(dict(input))
    required = {"command", "args", "cwd", "relative_cwd", "timeout_ms", "max_output_bytes"}
    _check_keys(data, required, required)
    if not isinstance(data["command"], str) or not data["command"] or len(data["command"]) > 128:
        raise NativeOperationError("terminal_exec_input_invalid")
    if not isinstance(data["args"], list):
        raise NativeOperationError("terminal_exec_input_invalid")
    if not isinstance(data["cwd"], str) or not data["cwd"]:
        raise NativeOperationError("terminal_exec_input_invalid")
    if not isinstance(data["timeout_ms"], int) or isinstance(data["timeout_ms"], bool) or data["timeout_ms"] < 1:
        raise NativeOperationError("terminal_exec_timeout_invalid")
    if not isinstance(data["max_output_bytes"], int) or isinstance(data["max_output_bytes"], bool) or data["max_output_bytes"] < 1024:
        raise NativeOperationError("terminal_exec_output_limit_invalid")
    project_root = _workspace_root(root)
    directory = _relative_cwd(project_root, data["relative_cwd"])
    result = _run_bounded_process(
        data["command"], data["args"], directory, _subprocess_env(env),
        data["timeout_ms"], data["max_output_bytes"],
    )
    result["project_root"] = str(project_root)
    status = result.pop("_status", "completed" if result["ok"] else "failed")
    if not result["ok"] and status in ("timed_out", "output_limit"):
        code = {"timed_out": "process_timeout", "output_limit": "process_output_limit"}[status]
        result["status"] = status
        raise NativeOperationError(code, json.dumps(result, sort_keys=True))
    return result


def _sql_is_single_dml(sql: Any) -> str:
    if not isinstance(sql, str) or not sql.strip() or len(sql.encode("utf-8")) > 64 * 1024:
        raise NativeOperationError("d1_write_sql_invalid")
    if not SQL_WRITE_RE.match(sql):
        raise NativeOperationError("d1_write_statement_not_allowed")
    # The existing Wrangler adapter accepts one --command string, not bound parameters.
    # Reject statement separators and comments instead of guessing at SQL parsing.
    quote: str | None = None
    index = 0
    while index < len(sql):
        char = sql[index]
        if quote:
            if char == quote:
                if index + 1 < len(sql) and sql[index + 1] == quote:
                    index += 2
                    continue
                quote = None
        elif char in ("'", '"', "`"):
            quote = char
        elif char == ";":
            if sql[index + 1:].strip():
                raise NativeOperationError("d1_write_multiple_statements_not_allowed")
        elif sql[index:index + 2] in ("--", "/*"):
            raise NativeOperationError("d1_write_sql_comments_not_allowed")
        index += 1
    return sql.strip().rstrip(";").strip()


def d1_write(input: Mapping[str, Any], adapter: Any, *, delete_only: bool = False) -> dict[str, Any]:
    data = _require_object(dict(input))
    _check_keys(data, {"database_id", "sql", "params"}, {"database_id", "sql"})
    if not isinstance(data["database_id"], str) or not data["database_id"].strip():
        raise NativeOperationError("d1_database_identity_required")
    params = data.get("params", [])
    if not isinstance(params, list) or params:
        raise NativeOperationError("d1_write_parameters_unsupported_by_adapter")
    sql = _sql_is_single_dml(data["sql"])
    verb = SQL_WRITE_RE.match(sql).group(1).upper()
    if delete_only and verb != "DELETE":
        raise NativeOperationError("d1_delete_statement_required")
    if not delete_only and verb == "DELETE":
        raise NativeOperationError("d1_delete_requires_delete_operation")
    if adapter is None or not callable(getattr(adapter, "execute_write", None)):
        raise NativeOperationError("sam_d1_write_adapter_not_configured")
    try:
        return adapter.execute_write(sql, database_id=data["database_id"])
    except NativeOperationError:
        raise
    except Exception as exc:
        LOG.warning("Native D1 write failed (%s)", getattr(exc, "code", type(exc).__name__))
        raise NativeOperationError(getattr(exc, "code", "d1_write_failed")) from exc


NATIVE_OPERATION_SPECS: dict[str, dict[str, Any]] = {
    "workspace.read": {
        "module": "workspace", "side_effects": [], "deterministic": True,
        "description": "Read one bounded UTF-8 file from the configured workspace.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"], "additionalProperties": False},
    },
    "workspace.list": {
        "module": "workspace", "side_effects": [], "deterministic": True,
        "description": "List bounded workspace paths without traversing symlinks or credential stores.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "depth": {"type": "integer", "minimum": 1, "maximum": 5}, "max_entries": {"type": "integer", "minimum": 1, "maximum": 300}}, "required": [], "additionalProperties": False},
    },
    "workspace.stat": {
        "module": "workspace", "side_effects": [], "deterministic": True,
        "description": "Inspect the type, size and content hash of a scoped workspace path.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"], "additionalProperties": False},
    },
    "workspace.write": {
        "module": "workspace", "side_effects": ["filesystem-write"], "deterministic": True,
        "description": "Create or optimistically update a bounded UTF-8 workspace file; requires explicit write intent and host approval.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}, "expected_sha256": {"type": "string"}}, "required": ["path", "content"], "additionalProperties": False},
    },
    "workspace.patch": {
        "module": "workspace", "side_effects": ["filesystem-write"], "deterministic": True,
        "description": "Apply one exact, unique text replacement to a workspace file after a content-hash freshness check.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "expected_sha256": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}}, "required": ["path", "expected_sha256", "old_text", "new_text"], "additionalProperties": False},
    },
    "workspace.remove": {
        "module": "workspace", "side_effects": ["filesystem-write"], "deterministic": True,
        "description": "Remove one regular workspace file after explicit approval and a content-hash freshness check.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "expected_sha256": {"type": "string"}}, "required": ["path", "expected_sha256"], "additionalProperties": False},
    },
    "terminal.exec": {
        "module": "terminal", "side_effects": ["local-runtime"], "deterministic": False,
        "description": "Run one argv-safe process inside the configured workspace with explicit approval, bounded output and timeout.",
        "input_schema": {"type": "object", "properties": {"command": {"type": "string"}, "args": {"type": "array", "items": {"type": "string"}}, "cwd": {"type": "string"}, "relative_cwd": {"type": "string"}, "timeout_ms": {"type": "integer", "minimum": 1, "maximum": MAX_TIMEOUT_MS}, "max_output_bytes": {"type": "integer", "minimum": 1024, "maximum": MAX_OUTPUT_BYTES}}, "required": ["command", "args", "cwd", "relative_cwd", "timeout_ms", "max_output_bytes"], "additionalProperties": False},
    },
    "agentsam_d1_write": {
        "module": "database", "side_effects": ["external-write"], "deterministic": False,
        "description": "Run one explicitly approved D1 INSERT, UPDATE or REPLACE through the configured D1Adapter.",
        "input_schema": {"type": "object", "properties": {"database_id": {"type": "string"}, "sql": {"type": "string"}, "params": {"type": "array"}}, "required": ["database_id", "sql"], "additionalProperties": False},
    },
    "agentsam_d1_delete": {
        "module": "database", "side_effects": ["external-write"], "deterministic": False,
        "description": "Run one explicitly approved D1 DELETE through the configured D1Adapter.",
        "input_schema": {"type": "object", "properties": {"database_id": {"type": "string"}, "sql": {"type": "string"}, "params": {"type": "array"}}, "required": ["database_id", "sql"], "additionalProperties": False},
    },
}

WRITE_OPERATIONS = frozenset(
    operation for operation, spec in NATIVE_OPERATION_SPECS.items() if spec["side_effects"]
)


class NativeRuntime:
    """Trusted context for Python-native operations; never inferred from tool input."""

    def __init__(
        self,
        *,
        workspace_root: str | Path,
        receipt_dir: str | Path | None = None,
        authorize_operation: Callable[[dict[str, Any]], Any] | None = None,
        d1_adapter: Any = None,
        env: Mapping[str, str] | None = None,
    ):
        self.workspace_root = Path(workspace_root).expanduser().resolve()
        self.receipt_dir = Path(receipt_dir).expanduser().resolve() if receipt_dir else self.workspace_root / ".agentsam" / "receipts"
        self.authorize_operation = authorize_operation
        self.d1_adapter = d1_adapter
        self.env = dict(env) if env is not None else None

    def _handler(self, operation: str, data: dict[str, Any]) -> dict[str, Any]:
        if operation == "workspace.read":
            return workspace_read(data, self.workspace_root)
        if operation == "workspace.list":
            return workspace_list(data, self.workspace_root)
        if operation == "workspace.stat":
            return workspace_stat(data, self.workspace_root)
        if operation == "workspace.write":
            return workspace_write(data, self.workspace_root)
        if operation == "workspace.patch":
            return workspace_patch(data, self.workspace_root)
        if operation == "workspace.remove":
            return workspace_remove(data, self.workspace_root)
        if operation == "terminal.exec":
            return terminal_exec(data, self.workspace_root, self.env)
        if operation == "agentsam_d1_write":
            return d1_write(data, self.d1_adapter)
        if operation == "agentsam_d1_delete":
            return d1_write(data, self.d1_adapter, delete_only=True)
        raise NativeOperationError("sam_native_operation_not_implemented")

    def _authorize(self, operation: str, data: dict[str, Any]) -> dict[str, Any]:
        if operation not in WRITE_OPERATIONS:
            return {"required": False, "decision": "not_required"}
        if not self.authorize_operation:
            return {"required": True, "decision": "missing", "reason": "sam_host_approval_required"}
        spec = NATIVE_OPERATION_SPECS[operation]
        request = {
            "id": operation,
            "input": dict(data),
            "side_effects": spec["side_effects"][0],
            "contract": spec,
        }
        try:
            decision = self.authorize_operation(request)
            if inspect.isawaitable(decision):
                try:
                    asyncio.get_running_loop()
                except RuntimeError:
                    decision = asyncio.run(decision)
                else:
                    raise NativeOperationError("sam_async_approval_callback_not_supported")
        except NativeOperationError:
            raise
        except Exception as exc:
            LOG.warning("Native operation approval callback failed (%s)", type(exc).__name__)
            return {"required": True, "decision": "error", "reason": "sam_host_approval_failed"}
        if decision is not True:
            return {"required": True, "decision": "denied", "reason": "sam_host_approval_denied"}
        return {"required": True, "decision": "approved"}

    def _write_receipt(self, result: ToolResult, metadata: dict[str, Any]) -> str | None:
        try:
            self.receipt_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
            filename = f"receipt-{re.sub(r'[^A-Za-z0-9_.-]', '_', result.tool)}-{result.request_id}.json"
            target = self.receipt_dir / filename
            payload = result.to_dict()
            payload["written_at_unixepoch"] = int(time.time())
            payload["execution"] = metadata
            temp = target.with_name(target.name + "." + uuid.uuid4().hex + ".tmp")
            try:
                with temp.open("x", encoding="utf-8") as stream:
                    json.dump(payload, stream, ensure_ascii=False, indent=2, default=str)
                    stream.write("\n")
                    stream.flush()
                    os.fsync(stream.fileno())
                try:
                    os.chmod(temp, 0o600)
                except OSError:
                    pass
                os.replace(temp, target)
            finally:
                try:
                    temp.unlink()
                except OSError:
                    pass
            return str(target)
        except Exception as exc:
            LOG.warning("Native operation receipt could not be written (%s)", type(exc).__name__)
            return None

    def invoke(self, operation: str, input: Mapping[str, Any] | None = None, *, write: bool = False) -> dict[str, Any]:
        spec = NATIVE_OPERATION_SPECS.get(operation)
        if spec is None:
            raise NativeOperationError("sam_native_operation_not_implemented")
        started = time.time()
        request_id = uuid.uuid4().hex[:24]
        tool_input = ToolInput(
            mode="native", params=dict(input or {}), output_dir=str(self.receipt_dir),
            write=write, request_id=request_id,
        )
        data = dict(tool_input.params)
        request_id = tool_input.request_id
        approval = {"required": operation in WRITE_OPERATIONS, "decision": "not_checked"}
        result_data: dict[str, Any] = {}
        error_code: str | None = None
        summary = "Native operation completed."
        before_hash = data.get("expected_sha256")
        try:
            if operation in WRITE_OPERATIONS and tool_input.write is not True:
                approval = {"required": True, "decision": "denied", "reason": "sam_write_flag_required"}
                raise NativeOperationError("sam_write_flag_required", "Write-capable operation requires write=True.")
            if operation in ("agentsam_d1_write", "agentsam_d1_delete") and not callable(getattr(self.d1_adapter, "execute_write", None)):
                raise NativeOperationError("sam_d1_write_adapter_not_configured")
            approval = self._authorize(operation, data)
            if approval["required"] and approval["decision"] != "approved":
                raise NativeOperationError(approval.get("reason", "sam_host_approval_required"))
            result_data = self._handler(operation, data)
            if operation == "terminal.exec" and result_data.get("ok") is False:
                error_code = "sam_operation_failed"
                summary = "Operation reported failure"
            else:
                summary = "Native operation completed."
        except NativeOperationError as exc:
            error_code = exc.code
            summary = str(exc)
            # terminal.exec failures include bounded structured process diagnostics.
            if operation == "terminal.exec" and summary.startswith("{"):
                try:
                    result_data = json.loads(summary)
                except ValueError:
                    result_data = {}
        except Exception as exc:
            error_code = "sam_native_operation_failed"
            summary = "Native operation failed."
            LOG.warning("Native operation failed (%s)", type(exc).__name__)
        finished = time.time()
        result = ToolResult(
            ok=error_code is None,
            tool=operation,
            mode="native",
            request_id=request_id,
            started_at=started,
            finished_at=finished,
            summary=summary,
            data=result_data,
            error=error_code,
        )
        metadata = {
            "operation": operation,
            "input_sha256": _canonical_hash(data),
            "path": data.get("path") if isinstance(data.get("path"), str) and not Path(data["path"]).is_absolute() else None,
            "approval": approval,
            "before_sha256": before_hash if isinstance(before_hash, str) else None,
            "after_sha256": result_data.get("sha256") if isinstance(result_data, dict) else None,
            "exit_code": result_data.get("exit_code") if isinstance(result_data, dict) else None,
        }
        receipt_path = self._write_receipt(result, metadata)
        warnings: list[dict[str, str]] = []
        if receipt_path is None:
            warnings.append({"code": "sam_receipt_write_failed", "message": "Operation finished, but its local receipt could not be written."})
        now = _iso(finished)
        sam_receipt = {
            "id": "samr_" + result.request_id,
            "operation": operation,
            "module": spec["module"],
            "started_at": _iso(started),
            "completed_at": now,
            "execution": {"lane": "local", "deterministic": spec["deterministic"], "model_used": False},
            "side_effects": spec["side_effects"],
            "input_hash": _canonical_hash(data),
            "output_hash": _canonical_hash(result_data) if error_code is None else None,
            "status": "completed" if error_code is None else "failed",
        }
        response: dict[str, Any] = {
            "schema": "sam.result.v1",
            "operation": operation,
            "ok": error_code is None,
            "data": result_data if error_code is None or (operation == "terminal.exec" and error_code == "sam_operation_failed") else None,
            "receipt": sam_receipt,
            "usage": {"provider_calls": 0, "cost_usd": 0},
        }
        if error_code:
            response["error"] = {"code": error_code, "message": summary}
        if warnings:
            response["warnings"] = warnings
        # The local receipt ID is stable and maps to the receipt filename; no
        # Python-only response field is added to the shared SAM result envelope.
        return response
