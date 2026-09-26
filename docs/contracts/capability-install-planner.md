# Capability install planner (Homebrew-style)

Agent Sam **orchestrates** installs. It does not replace Homebrew, apt, winget, or npm.

## Stages

```text
DISCOVER → PLAN → EXPLAIN → APPROVE → EXECUTE → VERIFY + RECEIPT
```

| Stage | Owner |
| --- | --- |
| Discover | Agent Sam (`agentsam setup`) |
| Plan / explain / approve | Agent Sam |
| Execute packages | Native provider (`brew`, `apt`, `winget`, `npm`) |
| Verify + receipt | Agent Sam → `~/.agentsam/receipts/setup-*.json` |

## Commands

```bash
agentsam setup --list
agentsam setup --dry-run
agentsam setup                    # interactive approve
agentsam setup --yes              # non-interactive approve
agentsam setup image.vectorize
agentsam setup google.cloud
agentsam setup google.cloud --inventory
```

## Recipe contract

Each installable capability exposes:

```js
{
  id, displayName, description,
  detect(), supportedPlatforms,
  installPlans: { darwin|linux|win32: { provider, packages|commands, notes } },
  dependencies, mutations, risk, requiresApproval,
  verify(), uninstallHint(), capabilityProvided
}
```

Never silently: install software, trust third-party taps, edit shell profiles, enable paid cloud APIs, or change provider credentials without approval + explicit mutation listing.

## Google Cloud inventory

```bash
agentsam setup google.cloud --inventory
```

Collects (read-only): auth accounts, active config, OAuth token scopes, projects, billing accounts, IAM roles for the active user. Use after install / login to programmatically drive:

```bash
agentsam gcloud auth login
agentsam google-cloud connection set --identity EMAIL --project PROJECT
agentsam google-cloud doctor
```

## Image vectorize (Homebrew analogy)

```bash
agentsam setup image.vectorize
# plans: brew install imagemagick potrace
```

Failed “tool missing” paths should become this planner state — not a dead end.
