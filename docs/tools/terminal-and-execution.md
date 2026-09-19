# Terminal & Execution

Running shell/Python/Node commands — on the user's own Mac, the always-on cloud desk, or an isolated sandbox — plus container batch exec and Code Mode.

**6 tools** in this domain.

## `container.exec` (1)

- **`agentsam_container_exec`** (Container Batch Exec) — Execute a non-interactive shell command in the explicitly selected Cloudflare MY_CONTAINER sandbox. _risk: high_

## `runtime.codemode` (1)

- **`codemode`** (Code Mode) — Run JavaScript that orchestrates IAM catalog tools inside an isolated Worker sandbox (env.LOADER).

## `terminal` (1)

- **`agentsam_code_interpreter`** (Code interpreter (Python crunch)) — Execute Python for calculations, data transformation, analysis, and generated files on the current local execution host. _never used_

## `terminal.execute` (1)

- **`agentsam_terminal_sandbox`** (Terminal Sandbox) — Isolated cloud shell in a CF Container sandbox (MY_CONTAINER). Use for experiment zones (zone_slug: engineer, architect, cms, specialist) and disposable builds. For persistent operator repo state on the cloud desk prefer agentsam_terminal_remote; for your own machine use agentsam_terminal_local. _risk: high_

## `terminal.local` (1)

- **`agentsam_terminal_local`** (Terminal Local) — Run a shell command on the signed-in user's own machine via their provisioned device tunnel. Requires Settings → Terminal device setup. Not for cloud VM — use agentsam_terminal_remote when away from desk, or agentsam_terminal_sandbox for an isolated cloud shell. Do not use shell for file edits when fs_edit_file / agentsam_github_patch can do it — shell bypasses exact-match and diff guarantees. _risk: high, ★ heavily used (311 calls)_

## `terminal.remote` (1)

- **`agentsam_terminal_remote`** (Terminal Remote) — Run a shell command on the platform cloud desk (always-on VM). Primary lane for ChatGPT/Claude connectors and phone when the desk machine is asleep — git, wrangler worker-only, sparse repo clones. Prefer this over sandbox for persistent operator repo state. _risk: high, ★ heavily used (129 calls)_
