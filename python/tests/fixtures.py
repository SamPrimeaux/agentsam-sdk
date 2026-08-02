"""Stub D1 shape shared by data/* tests -- no live D1 required.

Mirrors a small slice of the real schema (a couple agentsam_* tables plus
one bloated cms_ table) so d1_bloat / agentsam_walk logic can be exercised
without wrangler or a network call.
"""
from __future__ import annotations

FAKE_TABLES = [
    "agentsam_tool_call_log",
    "agentsam_workflow_runs",
    "cms_pages",
]

FAKE_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "agentsam_tool_call_log": [
        ("id", "TEXT"),
        ("tool_name", "TEXT"),
        ("input_json", "TEXT"),
        ("output_json", "TEXT"),
        ("created_at", "INTEGER"),
    ],
    "agentsam_workflow_runs": [
        ("id", "TEXT"),
        ("step_results_json", "TEXT"),
        ("status", "TEXT"),
        ("updated_at", "INTEGER"),
    ],
    "cms_pages": [
        ("id", "TEXT"),
        ("body", "TEXT"),
        ("slug", "TEXT"),
    ],
}

FAKE_ROW_COUNTS = {
    "agentsam_tool_call_log": 150_000,
    "agentsam_workflow_runs": 40,
    "cms_pages": 12,
}


class FakeD1Adapter:
    """Drop-in stand-in for agentsam_sdk.data.d1_adapter.D1Adapter.

    Constructed the same way tests need it (via a classmethod matching
    from_env's call signature) and implements only the methods d1_bloat.py /
    agentsam_walk.py actually call.
    """

    def __init__(self, db_name: str = "fake-db"):
        self.db_name = db_name

    @classmethod
    def from_env(cls, db_name=None, wrangler_config=None, repo_root=None):
        return cls(db_name=db_name or "fake-db")

    def list_tables(self, like=None):
        if not like:
            return list(FAKE_TABLES)
        prefix = like.rstrip("%")
        return [t for t in FAKE_TABLES if t.startswith(prefix)]

    def database_size(self):
        return "12.3 MB"

    def table_columns(self, table):
        return list(FAKE_COLUMNS.get(table, []))

    def table_indexes(self, table):
        return []

    def foreign_keys(self, table):
        return []

    def row_count(self, table):
        return FAKE_ROW_COUNTS.get(table, 0)

    def query(self, sql):
        # Only d1_bloat's SUM(LENGTH(...)) aggregate query shape is needed.
        rc = FAKE_ROW_COUNTS.get(self._table_from_sql(sql), 0)
        row = {"rc": rc}
        for col in FAKE_COLUMNS.get(self._table_from_sql(sql), []):
            name = col[0]
            if name in sql:
                row[name] = 200 * rc
                row[f"m_{name}"] = 200
        return [row]

    @staticmethod
    def _table_from_sql(sql: str) -> str:
        for t in FAKE_TABLES:
            if f'"{t}"' in sql:
                return t
        return ""
