# AgentSam CAD run modes — executable SDK contract
Status: SDK dispatch implemented and tested; **host integration/deployment requires a separate proof**.

These modes are domain execution intents, separate from the ordinary Work chat modes
`ask | plan | agent | debug | multitask`. UI labels and LLM prompts do not create
permissions or provider availability. Caller uses `executeCadRunMode({mode,input},{sam,authorizeMode})`
with the actual trusted `AgentSamClient` and an authorization callback.

| Mode | Existing SAM operation | Trust / outcome |
| ---- | ---------------------- | --------------- |
| `cad.inspect` | `cad.project.get` | Authorized project/revision read; receipt |
| `cad.create` | `cad.project.save` | Validated CAD document + expected revision, authorization and approval; new immutable revision |
| `cad.edit` | `cad.project.apply` | Typed operation + optimistic revision check; authorized edit receipt |
| `cad.export` | `cad.model.export` | Real GLB/STL/OBJ for an existing revision; valid artifact receipt |
| `cad.generate` | `cad.job.generate` | Authorized runner + project/workspace/engine + prompt; real job record |

Host contract: resolve OAuth principal, tenant/project scope, capability grants,
write approvals (existing Hooks runtime), job runner availability, canonical project
authority, asset bucket, and results/revisions. The SDK refuses missing host ports.
The LLM produces structured proposals/inputs; SAM validates and executes.
A chat response does not count as CAD success, and a local simulated robot
does not count as verified physical grasp.

**Current integration gate:** Local Studio's `runCadAssistantTurn()` still feeds
a Work conversation. Until an authorized host binds this run-mode dispatcher
to the floating CAD composer and returns real typed receipts, do not expose
these modes as working hosted UI actions or mark this product journey shipped.
Do not modify generic Work `AgentRunMode` to camouflage the missing bridge.

Acceptance: live host user selects CAD object, asks for change, sees a proposed
typed operation and approval, confirms, project revision actually advances in
canonical store, reloads, verifies model geometry, exports from the new revision,
and can restore. Also test missing permission, missing provider, stale revision,
and retries. Store source and deployment revision in release evidence.
