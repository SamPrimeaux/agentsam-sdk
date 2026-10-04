# @inneranimalmedia/agentsam-workbench

Reusable React workbench primitives built on `@inneranimalmedia/agentsam-contracts`.

This is the shared AgentSam UI layer for Local Studio, CAD Studio, and CMS Studio. It provides controlled/headless primitives for agent threads and composition, model selection, tool/artifact receipts, browser frames, terminal surfaces, and resizable shell panels. Product apps inject their own state, routing, auth, tools, runtime adapters, and visual treatment.

Current proof consumer: `apps/local-studio/`. Local Studio now delegates its composer, thread scroll behavior, and split-handle behavior to this package while retaining product-specific styling and state.

`packages/agentsam-shell-kit` remains only as a compatibility facade for older imports.
# Floating annotation helper

`MiniAgentSam` is exported from `@inneranimalmedia/agentsam-workbench/agent`.
Import `@inneranimalmedia/agentsam-workbench/agent/mini-agentsam.css` once in the host.
The host controls `selecting`, `onSelectingChange`, `onSubmit(prompt, selection)`,
and an optional `renderComposer` slot. Use `scope()` to restrict selection to a
particular root. No network, storage, plugin registry, or application dependency
is built into the helper. It inherits `--nav-*` tokens; other hosts can supply
`--mini-surface`, `--mini-text`, `--mini-muted`, `--mini-border`, and `--mini-accent`.

Selections are bounded descriptive DOM context and never authorize edits. Input
values are withheld. Cross-origin and sandboxed iframe contents are not inspected;
their host frame may be selected as a contextual resource. Mark semantic ancestors
with `data-agentsam-resource` and excluded controls with `data-annotation-control`.
Local Studio stages the annotation in its active conversation draft for review.


## Conversation and runtime surfaces

`AgentConversationSurface` is the portable thread + persistent-composer ownership
boundary. Product apps provide state and actions; the surface guarantees that
moving between an empty conversation and an active thread does not replace the
composer DOM ownership.

`AgentRuntimeField` projects `@inneranimalmedia/agentsam-loading-scene` into the
same surface. A lead thread and each co-worker may bind separate controllers, so
parallel work can show independent semantic scenes and task narration without
duplicating renderer code in product apps.

```tsx
<AgentConversationSurface
  empty={messages.length === 0}
  runtime={<AgentRuntimeField controller={runtimeController} />}
  thread={<AgentThread messages={messages} />}
  composer={<AgentComposer {...composerProps} />}
/>
```

The workbench owns presentation mechanics. The host still owns model/provider
selection, tool execution, persistence, permissions, runtime events, queueing and
cancel semantics.

## Widgets

`@inneranimalmedia/agentsam-workbench/widgets` is the shared widget surface:
`WidgetFrame` (size/state chrome around any widget body), `useCountdown`, and
`CountdownWidget`. Widget identity — kind, sizes, data source, deep link — comes
from the framework-neutral contracts in `@inneranimalmedia/agentsam-contracts/widgets`.

Countdown time authority is an absolute deadline, not accumulated interval
ticks: remaining time is derived from `Date.now()` on every render tick, so a
sleeping or backgrounded tab cannot corrupt the timer. Import
`@inneranimalmedia/agentsam-workbench/widgets/widgets.css` once in the host;
the widget tokens inherit the host theme.

Widgets are app-native primitives, not installable prebuilds — the host decides
where a widget appears and what its data means. Local Studio's `/widgets`
utilities surface is the proof consumer.
