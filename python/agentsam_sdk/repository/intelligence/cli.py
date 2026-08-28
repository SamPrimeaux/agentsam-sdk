"""CLI and ToolInput adapter for repository intelligence."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from agentsam_sdk.runtime.contract import ToolInput, ToolResult, start_timer, write_receipt

from .snapshot import TOOL_NAME, build_snapshot, render_text


def run(tool_input: ToolInput) -> ToolResult:
    started = start_timer()
    try:
        tool_input.assert_read_only()
        params = tool_input.params
        snapshot = build_snapshot(
            params.get("repo_root") or ".",
            churn_days=int(params.get("churn_days") or 30),
            top=int(params.get("top") or 20),
            max_directory_depth=int(params.get("max_directory_depth") or 4),
        )
        artifacts: list[str] = []
        output_dir = tool_input.output_path()
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            out = output_dir / "repository-intelligence.json"
            out.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
            artifacts.append(str(out))
        result = ToolResult(
            ok=True,
            tool=TOOL_NAME,
            mode=tool_input.mode or "read-only",
            request_id=tool_input.request_id,
            started_at=started,
            finished_at=start_timer(),
            summary=(
                f"Observed {snapshot['summary']['file_count']} active files; "
                f"{snapshot['summary']['changed_file_count']} changed in the last "
                f"{snapshot['summary']['churn_days']} days."
            ),
            data=snapshot,
            artifacts=artifacts,
        )
    except Exception as exc:  # noqa: BLE001 - normalized into ToolResult
        result = ToolResult(
            ok=False,
            tool=TOOL_NAME,
            mode=tool_input.mode or "read-only",
            request_id=tool_input.request_id,
            started_at=started,
            finished_at=start_timer(),
            summary="repository intelligence failed",
            error=str(exc)[:500],
        )
    write_receipt(result, tool_input.output_path())
    return result


def main_cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m agentsam_sdk.repository.intelligence",
        description="Observe a repository and emit a current architecture/churn snapshot.",
    )
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--churn-days", type=int, default=30)
    parser.add_argument("--top", type=int, default=20)
    parser.add_argument("--max-directory-depth", type=int, default=4)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    snapshot = build_snapshot(
        args.repo_root,
        churn_days=args.churn_days,
        top=args.top,
        max_directory_depth=args.max_directory_depth,
    )
    rendered = json.dumps(snapshot, indent=2) if args.json else render_text(snapshot)
    if args.out:
        Path(args.out).expanduser().write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="" if rendered.endswith("\n") else "\n")
    return 0
