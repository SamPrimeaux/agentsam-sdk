# Portable repository context

`@inneranimalmedia/agentsam-sdk` is the portable authority for discovering the Git resource an Agent Sam command is operating on and for authenticating machine-to-machine requests.

## Git is the resource identity

From any Git repository:

```bash
agentsam context
agentsam context --json
```

The SDK resolves:

- repository root
- preferred Git remote (defaults to `origin`, falls back to the first remote)
- remote host
- `owner/repo` when the remote provides it
- current revision SHA
- current branch / detached HEAD
- dirty working-tree state

No `AGENTSAM_USER_ID`, `AGENTSAM_WORKSPACE_ID`, or tenant variable is inferred from Git. Git identifies the resource being operated on; it does not prove who the actor is.

Programmatic API:

```js
import {
  resolveGitContext,
  tryResolveGitContext,
  normalizeGitRemote,
} from '@inneranimalmedia/agentsam-sdk/git-context';

const repo = resolveGitContext();
console.log(repo.repoFullName, repo.revisionSha);
```

## Bridge authentication is the machine principal

For trusted operator/service calls, configure one secret:

```bash
export AGENTSAM_BRIDGE_KEY='...'
```

Optional base URL overrides:

```bash
export AGENTSAM_BASE_URL='https://agentsam.example.com'
# AGENTSAM_CORE_URL and IAM_CORE_URL are also supported.
```

Programmatic API:

```js
import { createBridgeClient } from '@inneranimalmedia/agentsam-sdk/bridge-client';

const client = createBridgeClient();
const result = await client.post('/api/example', {
  repo: resolveGitContext().repoFullName,
});
```

The client sends the bridge key as both `Authorization: Bearer ...` and `X-Bridge-Key`. It does not add user/workspace identity headers. Resource authorization and actor resolution remain server responsibilities.

## Ownership rule

Portable Git/bridge behavior belongs here in `agentsam-sdk`, not duplicated across application repositories. Application repos may keep thin adapters around SDK APIs, but changes to portable behavior should be implemented and released here first.
