# AgentSam SDK test tiers

The release-blocking test gate must be deterministic and must not require ExecOS, a user-hosted terminal tunnel, a cloud VM, or any other live external daemon.

## Release-blocking tiers

`npm test` runs these tiers:

- `npm run test:unit` — deterministic unit/contract tests.
- `npm run test:integration:mock` — integration behavior against local or mocked dependencies.
- `npm run test:terminal:mock` — terminal/PTY behavior through an injected mock PTY transport. No ExecOS or tunnel is contacted.
- identity and connector tests already included by the root `npm test` script.

These tiers are the standard release gate and are suitable for GitHub Actions.

## Live terminal tier

`npm run test:live:terminal` is deliberately outside `npm test` and `npm run verify`.

Set `AGENTSAM_LIVE_TERMINAL_WS_URL` to a real enrolled terminal WebSocket URL when an operator intentionally wants to exercise a live transport. `AGENTSAM_LIVE_TERMINAL_AUTH` may be supplied when that endpoint requires an Authorization header.

If no live URL is supplied, the live test is skipped. A tunnel outage must never make the package release gate red.

## Rule

Tests may verify terminal protocol semantics in the release-blocking suite only through a local/mock transport. Any test that depends on ExecOS, a provisioned IAM terminal connection, Cloudflare Tunnel, or a real remote PTY belongs in the explicit live tier.
