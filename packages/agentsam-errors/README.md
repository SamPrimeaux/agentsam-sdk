# @inneranimalmedia/agentsam-errors

Canonical AgentSam error classification and remediation contracts.

This package currently defines 17 canonical codes, 260 reason records, 25 domains, and 32 remediation actions.

CLI commands should create typed failures through usageError / processError and render them through renderCliError.
Usage errors exit with 2; execution failures exit with 1. --json preserves the canonical envelope.
HTTP status lines are intentionally omitted from local human CLI failures.

Reason mappings are generated in docs/reference/AGENTSAM-ERROR-REASONS.md.

Operator-facing next-step guidance remains incremental: new helpers ship first with machine and
the remaining legacy command error sites are tracked in scripts/registry/plain-error-baseline.json.
