# Agent Sam context contracts

Agent Sam treats context as a bounded evidence pack, not as a place to dump every available index, tool, file, or prior message.

## Project rules

Generated projects include a committed `.agentsamrules` file. It is the repository-level instruction surface, similar in spirit to `.cursorrules`.

```text
repo/
├── .agentsam/config.json   portable project identity/defaults
├── .agentsamrules          committed project instructions
└── .agentsam/cli.json      machine/user preferences; gitignored
```

`loadProjectRules()` searches upward from the active cwd, hashes the source, and bounds loaded content before it can enter system context. The portable default ceiling is 24,000 characters; a host may choose a lower ceiling through its context budget.

`.agentsamrules` is for durable repository instructions and conventions. It is not a place for secrets, account IDs, active runs, task state, model history, terminal sessions, or Merkle roots.

## Result policy

Every result-producing capability should have a result policy. Absence of a custom policy means the bounded SDK default:

```json
{
  "max_items": 8,
  "max_chars": 24000,
  "detail": "excerpt"
}
```

A caller may request less. Asking for more items, more characters, or a higher detail class requires the explicit `higher-detail` operation.

Progressive detail is ordered as:

```text
metadata
  ↓
card
  ↓
excerpt
  ↓
range
  ↓
full
```

`normalizeResultPolicy()` enforces the ceiling. Built-in SDK tool cards inherit the bounded default rather than silently behaving as unlimited.

## Context budget

`createContextBudget()` derives per-class ceilings from the selected model's context window. The default operating ratios are:

```text
target active input    60%
emergency hard line    85%
```

The remaining window is deliberate headroom for additional retrieval, tool iterations, reasoning, user input, and output.

A budget owns separate ceilings for:

```text
system / project rules
tool schemas
retrieved evidence
single file reads
cumulative file reads per turn
tool results
```

For example:

```js
import { createContextBudget } from '@inneranimalmedia/agentsam-sdk/context';

const budget = createContextBudget({
  windowTokens: 250_000,
});
```

The resulting budget tracks both tokens and deterministic character ceilings.

## Context items

Portable context evidence uses the following shape:

```ts
interface ContextItem {
  ref: string;
  kind: 'file' | 'symbol' | 'memory' | 'tool_result' | 'repo' | 'artifact';
  chars: number;
  hash?: string;
  priority: number;
  content?: string;
}
```

`resolveContext()` sorts candidate evidence by priority, applies kind-specific and cumulative limits, and returns only the selected items.

`resolveProjectContext()` does the same while automatically loading `.agentsamrules` within the system-context ceiling.

Every resolved pack includes a receipt:

```json
{
  "chars": 18422,
  "evidence_chars": 17769,
  "system_chars": 653,
  "estimated_tokens": 4606,
  "sources_considered": 73,
  "sources_included": 6,
  "sources_deferred": 67,
  "deferred_refs": []
}
```

The existing knowledge `ContextPack` now uses the same receipt vocabulary for retrieval hits.

### Consumed tool results

`compactConsumedToolResult()` defaults to 4,000 characters for evidence that has already had its high-fidelity pass. It preserves the item ref/hash/priority so later turns can expand the source again instead of replaying the original dump.

## Index law

> An index is a retrieval substrate, never prompt content.

The active prompt should receive a compact repository/index status plus selected evidence references. It should not receive an entire repository tree, symbol graph, embedding set, tool catalog, or hundreds of search results.

Prefer evidence in this order whenever possible:

```text
exact structural evidence
        ↓
bounded lexical/search evidence
        ↓
semantic retrieval
        ↓
explicit larger range/full object only when required
```

## Tool discovery

`searchToolCards()` supports cards-first discovery. It accepts a host/tool catalog and returns compact cards without full input schemas:

```json
{
  "tool": "code.retrieve",
  "summary": "Find symbols, callers, and semantic code matches.",
  "risk": "read",
  "required": ["query"],
  "result_class": "bounded_evidence"
}
```

A host can hydrate the selected tool's full schema only after selection. This keeps the portable contract compatible with small local catalogs and large hosted catalogs without injecting all schemas at turn zero.

## Subagent handoff law

A child agent should return a compact work receipt rather than its entire prompt/tool history:

```text
conclusion
evidence refs
changed files
commands/tests
uncertainty
```

The parent can expand an evidence ref when needed.
