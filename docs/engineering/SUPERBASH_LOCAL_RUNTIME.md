# Superbash local runtime v1 — SDK, CLI, native host contract

## Purpose and boundaries

Superbash is a user-authorized process execution capability, not a new daemon,
AI provider, CMS engine, sandbox, or workflow scheduler. Prefer already
implemented deterministic AgentSam capabilities before asking for a script.

The Node-only adapter lives in src/sam/adapters/local-script-runtime.js and
uses the existing src/security/process.js runner. A Tauri or native Node host
can import the package subpath @inneranimalmedia/agentsam-sdk/sam/local-execution
and supply its own trusted identity and user approval. Do NOT import this
subpath into a browser or Cloudflare Worker runtime.

Local execution requires no Cloudflare, ExecOS enrollment, containers,
or paid sandbox. A host must never invent a remote runner when the local
runner is unavailable. The CLI model tool registration is limited to the
existing authenticated createShellSamAdapter and its authorization gate.

## Installed operations

- sam.superbash executes one approved inline script or saved artifact in a
  host-owned project root. Uses Bash without profile/rc files, with -e and
  pipefail, and returns execution ID, script SHA-256, status, exit code,
  bounded stdout/stderr, duration and timestamps.
- sam.script.save stores immutable versioned scripts, with compare-and-swap
  expectedVersion for existing scripts.
- sam.script.get reads a particular immutable version for the same account,
  actor and installation.

Scripts live under HOME/.agentsam/scripts/account/actor/installation/scriptId.
The directory is outside the project repository; scripts are private local
files with 0600 file permissions. An artifactRef binds script ID, version,
and SHA-256 content.

## Approval and security

Every Superbash call needs a trusted session and user authorization. The
existing CLI approval memory binds its approval key to the exact script or
immutable artifact reference AND relative working directory; approving one
script does not approve all future scripts. Noninteractive hosts must refuse
unapproved execution. Save is a separate write permission. Get remains
account/actor/installation-scoped.

The runtime resolves and verifies the requested working directory against
the authorized project root, including symlinks. Bash itself is NOT sandboxed.
An approved script can still access other files or network resources as the
OS user; do not run arbitrary untrusted donor code with this adapter.

The inherited subprocess environment is restricted to basic OS runtime
variables; API keys, cloud credentials and shell startup hooks are excluded.
Output is bounded and passed through the existing diagnostic redactor.
Hosts must not assume all possible file contents or command outputs are
secret-free.

Defaults: 120-second timeout (maximum 300 seconds), 256 KiB combined output
(maximum 1 MiB), two concurrent runs per host instance and 200 KB scripts.
Timeouts/cancellations terminate the process group using the existing
process runner. Different host processes do NOT yet share a global queue.

A zero exit code AND completed status are both required for success.
A nonzero exit, cancelled run, timeout or output overflow returns a structured
failure with a receipt; no false successful tool result or swallowed stderr.
Runtime/permission failures remain distinct from script failures.

The idempotencyKey field is currently only a correlation hint and hash in
the receipt; it does NOT provide exactly-once execution. Hosts must not
automatically retry a script after an uncertain execution outcome.

## Hosting and cost policy

The CLI registers only local execution lanes for this adapter. The SDK does
not invoke a paid sandbox provider, remote VM or ExecOS from this path.
If a job requires genuine isolation, do not downgrade to this runner to
save money; require a separately consented isolated executor and budget.

The existing Local Studio GUI has an agentsamd-backed terminal but does not
yet bind these three tools to the in-app AgentSam conversation dispatcher.
Use the shared Node host API as the integration seam. Do not expose a new
Tauri command capable of executing arbitrary scripts without an authenticated
principal, native approval UI and the same bounded execution contract.

## Verification

Run from the SDK repository root, with dependencies installed:

~~~bash
node --test test/integration/sam-superbash-local.integration.test.mjs
node --test test/integration/sam-shell-runtime.test.mjs
node --test src/sam/operation-packs/generated-v2/test/*.test.mjs
agentsam sam status --json
~~~

The real execution test uses temporary local project directories; it creates,
reads and executes an actual saved script, exercises stdout/stderr, failure,
timeout, cancellation, output limits, symlink path escape, concurrency and
identity/permission boundaries. No cloud execution is required.

The CLI only advertises these operations when a trusted identity is available.
An expired or missing session correctly reports the operations unbound.
