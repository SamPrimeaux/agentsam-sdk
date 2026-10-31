#!/usr/bin/env python3
"""Shared, deliberately small Wrangler/D1/R2 helpers for the resource rebuild."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
WRANGLER_CONFIG = ROOT / "apps/local-studio/backend/wrangler.jsonc"
DATABASE_NAME = "inneranimalmedia-business"
PLATFORM_ACCOUNT_ID = "ede6590ac0d2fb7daf155b35653457b2"
PLATFORM_OAUTH_USER_ID = "au_871d920d1233cbd1"
ARTIFACT_DIR = Path.home() / ".cache/agentsam/resource-rebuild"


def wrangler() -> list[str]:
    executable = shutil.which("wrangler")
    return [executable] if executable else ["npx", "--no-install", "wrangler"]


def run(command: list[str], *, cwd: Path = ROOT, timeout: int = 900, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=cwd,
        text=True,
        capture_output=True,
        stdin=subprocess.DEVNULL,
        timeout=timeout,
    )
    if check and result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(command[:5])}\n{detail[-2400:]}")
    return result


def _json_payload(stdout: str) -> Any:
    raw = stdout.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        starts = [p for p in (raw.find("{"), raw.find("[")) if p >= 0]
        if not starts:
            raise RuntimeError("Wrangler did not return JSON output")
        return json.loads(raw[min(starts):])


def _rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict) and isinstance(item.get("results"), list):
                return item["results"]
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        if isinstance(payload.get("results"), list):
            return payload["results"]
        result = payload.get("result")
        if isinstance(result, list):
            for item in result:
                if isinstance(item, dict) and isinstance(item.get("results"), list):
                    return item["results"]
    raise RuntimeError("Unrecognized Wrangler D1 JSON response shape")


def d1_query(sql: str) -> list[dict[str, Any]]:
    command = wrangler() + [
        "d1", "execute", DATABASE_NAME, "--remote", "--json",
        "--command", sql, "--config", str(WRANGLER_CONFIG),
    ]
    return _rows(_json_payload(run(command).stdout))


def d1_file(sql_path: Path) -> None:
    command = wrangler() + [
        "d1", "execute", DATABASE_NAME, "--remote", "--file", str(sql_path),
        "--yes", "--config", str(WRANGLER_CONFIG),
    ]
    run(command, timeout=1800)


def d1_export(output: Path, tables: list[str]) -> None:
    command = wrangler() + [
        "d1", "export", DATABASE_NAME, "--remote", "--output", str(output),
        "--skip-confirmation", "--config", str(WRANGLER_CONFIG),
    ]
    for table in tables:
        command.extend(["--table", table])
    run(command, timeout=1800)


def r2_put(bucket: str, key: str, source: Path, content_type: str = "application/octet-stream") -> None:
    command = wrangler() + [
        "r2", "object", "put", f"{bucket}/{key}", "--remote", "--file", str(source),
        "--content-type", content_type, "--config", str(WRANGLER_CONFIG),
    ]
    run(command, timeout=1800)


def r2_get(bucket: str, key: str, destination: Path, *, check: bool = True) -> subprocess.CompletedProcess[str]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = wrangler() + [
        "r2", "object", "get", f"{bucket}/{key}", "--remote", "--file", str(destination),
        "--config", str(WRANGLER_CONFIG),
    ]
    return run(command, timeout=1800, check=check)


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def json_sql(value: Any) -> str:
    return sql_quote(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def ensure_artifact_dir() -> Path:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    return ARTIFACT_DIR
