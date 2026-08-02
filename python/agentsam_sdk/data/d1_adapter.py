"""D1 adapter -- the only place this package shells out to wrangler.

Every other data/*.py module must go through D1Adapter, never call
subprocess/urllib against D1 directly (contract rule: "D1 access only via
an adapter"). Resolves database name / wrangler config from env or explicit
args -- never a hardcoded database id or account id (HARD LAW).

Env vars (all optional overrides; wrangler itself resolves the account via
CLOUDFLARE_API_TOKEN / `wrangler login` state and the database id via the
wrangler config file's [[d1_databases]] binding -- so this adapter does not
need to know the raw D1 database id at all):

  AGENTSAM_D1_DB_NAME       D1 database name (required -- no default;
                             pass --db or set this)
  AGENTSAM_WRANGLER_CONFIG  path to wrangler config, default "wrangler.toml"
  AGENTSAM_REPO_ROOT        repo root wrangler runs from, default cwd
  CLOUDFLARE_API_TOKEN      passed straight through to the wrangler subprocess
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


class D1AdapterError(RuntimeError):
    pass


@dataclass
class D1Adapter:
    db_name: str
    wrangler_config: str = "wrangler.toml"
    repo_root: Optional[Path] = None
    remote: bool = True
    timeout_s: int = 120

    @classmethod
    def from_env(
        cls,
        db_name: Optional[str] = None,
        wrangler_config: Optional[str] = None,
        repo_root: Optional[str] = None,
    ) -> "D1Adapter":
        name = db_name or os.environ.get("AGENTSAM_D1_DB_NAME")
        if not name:
            raise D1AdapterError(
                "No D1 database name given -- pass --db or set "
                "AGENTSAM_D1_DB_NAME. Refusing to guess/hardcode one."
            )
        cfg = wrangler_config or os.environ.get("AGENTSAM_WRANGLER_CONFIG", "wrangler.toml")
        root = Path(repo_root or os.environ.get("AGENTSAM_REPO_ROOT") or Path.cwd())
        return cls(db_name=name, wrangler_config=cfg, repo_root=root)

    def _run_wrangler(self, args: list[str]) -> subprocess.CompletedProcess:
        cmd = ["npx", "wrangler", *args]
        env = os.environ.copy()
        return subprocess.run(
            cmd,
            cwd=str(self.repo_root) if self.repo_root else None,
            capture_output=True,
            text=True,
            timeout=self.timeout_s,
            env=env,
        )

    def query(self, sql: str) -> list[dict]:
        args = ["d1", "execute", self.db_name]
        if self.remote:
            args.append("--remote")
        args += ["-c", self.wrangler_config, "--json", "--command", sql]
        proc = self._run_wrangler(args)
        raw = (proc.stdout or "").strip()
        if not raw:
            raise D1AdapterError((proc.stderr or "empty wrangler output")[:400])
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise D1AdapterError(f"non-JSON wrangler output: {e}") from e
        if isinstance(data, dict) and data.get("error"):
            raise D1AdapterError(str(data["error"])[:400])
        if isinstance(data, list) and data:
            return data[0].get("results") or []
        return []

    def database_size(self) -> Optional[str]:
        args = ["d1", "info", self.db_name, "-c", self.wrangler_config]
        proc = self._run_wrangler(args)
        m = re.search(r"database_size\s*\│\s*([^\│]+)", proc.stdout or "")
        return m.group(1).strip() if m else None

    def list_tables(self, like: Optional[str] = None) -> list[str]:
        sql = (
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
        )
        if like:
            safe = like.replace("'", "")
            sql += f" AND name LIKE '{safe}'"
        sql += " ORDER BY name"
        rows = self.query(sql)
        return [r["name"] for r in rows]

    def table_columns(self, table: str) -> list[tuple[str, str]]:
        safe = table.replace("'", "")
        rows = self.query(f"SELECT name, type FROM pragma_table_info('{safe}')")
        return [(r["name"], r.get("type") or "TEXT") for r in rows]

    def table_indexes(self, table: str) -> list[dict]:
        safe = table.replace('"', "")
        return self.query(f'PRAGMA index_list("{safe}")')

    def foreign_keys(self, table: str) -> list[dict]:
        safe = table.replace('"', "")
        return self.query(f'PRAGMA foreign_key_list("{safe}")')

    def row_count(self, table: str) -> int:
        safe = table.replace('"', "")
        rows = self.query(f'SELECT COUNT(*) AS rc FROM "{safe}"')
        return int(rows[0].get("rc") or 0) if rows else 0
