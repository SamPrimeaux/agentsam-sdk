# User-global AgentSam instructions

**Contract owner:** SDK instruction compiler (`src/lib/agent-instructions.js`)  
**Scope:** The *current operating-system user's* AgentSam CLI / Local Studio sessions, across repository boundaries. This is an opt-in file, not a bundled company-wide default.

## Precedence and source authority

When available, AgentSam compiles instruction sources in this order:

1. `~/.agentsam/AGENTSAM.md` — optional user-global instructions.
2. `AGENTSAM.md` discovered within the current repository — stable project runtime contract.
3. `.agentsamrules` discovered within that repository — project-specific rules.

Global instructions apply even in a repository with no AgentSam files. Repository files are not modified, copied, or seeded by this loader. All compiled sources retain their path and SHA-256 hash. Provider compatibility files (`AGENTS.md`, `CLAUDE.md`) are *not* independent rule authority.

Each scope has a distinct role. User-global policy may define the owner's standards across projects; project files specify constraints and implementation details. When a project conflicts with the user's global policy, surface the conflict instead of silently loosening the global requirement. System-level safety, authorization, and runtime contracts remain higher authority than any editable instruction file.

## Owner-managed installation

Create an ordinary UTF-8 Markdown file at `~/.agentsam/AGENTSAM.md`. For InnerAnimalMedia, its canonical owner-wide experience law is maintained in `SamPrimeaux/inneranimalmedia` at `docs/standards/INNERANIMALMEDIA_EXPERIENCE_STANDARD.md`. Install a copy or explicitly managed symlink as the *user's* global file; do not add the entire InnerAnimalMedia source tree as an SDK dependency.

Example for a developer who has the InnerAnimalMedia repository checked out under their home directory:

```bash
mkdir -p "$HOME/.agentsam"
ln -s "$HOME/inneranimalmedia/docs/standards/INNERANIMALMEDIA_EXPERIENCE_STANDARD.md" "$HOME/.agentsam/AGENTSAM.md"
```

The symlink keeps one editable source of truth; use a regular file when no reliable checked-out source is present. Do not overwrite an existing user-global file without reviewing it first.

## Portable / hosted operation

- No user-global policy file is created or shipped by the SDK.
- The reader uses the current user's home directory by default. The `globalFilename` option can select an explicit, authorized file, and `globalFilename: null` disables it for isolated or hosted contexts.
- **Multi-tenant hosts must not implicitly treat the server process's home directory as a customer's policy authority.** Pass a tenant-authorized file or `null` at the call site. Do not allow one user's instructions to bleed into another user's run.
- Rules loading never authenticates providers, changes permissions, performs actions, or changes the authoritative repository data. It only composes instruction text.

## Verify the effective rules

The compiler is exported from the SDK:

```js
import { compileAgentInstructions } from '@inneranimalmedia/agentsam-sdk';
const rules = compileAgentInstructions(process.cwd());
console.log(rules.sources.map(({ id, path, hash }) => ({ id, path, hash })));
console.log(rules.content.includes('Craft over spectacle. Substance over promises.'));
```

Expected with the InnerAnimalMedia file installed: the source list begins with `global`, followed by whichever repository instruction files exist. A clean repository can have `global` as its only source. A missing global file is not treated as a required dependency.
