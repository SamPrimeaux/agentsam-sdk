"""agentsam_sdk — stdlib-only toolkit for inneranimalmedia D1/repo audits.

Every tool follows the runtime.contract pattern: ToolInput in, ToolResult out,
plus a receipt written to output_dir for audit trail. No hardcoded
identity/repo/workspace/tenant values anywhere in this package — see
runtime.contract.HARD_LAW_NOTE.
"""

__version__ = "0.1.0"
