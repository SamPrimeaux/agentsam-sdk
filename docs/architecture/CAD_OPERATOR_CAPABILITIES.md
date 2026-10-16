# CAD operators: Design Studio donor → AgentSam capabilities

Status: portable SDK host-injected capability pack, **not** an automatically deployed CAD Creator chat integration.

## Audit — existing InnerAnimalMedia donor

- `inneranimalmedia/app/dashboard/components/designstudio/cad-studio/operators.ts` defines the existing operator palette. The `iamcad.operator.generateFreeCAD` / `generateBlender` identifiers shown in the modal are **descriptive labels**, not callable SDK tools.
- `OperatorModals.tsx` routes viewport controls to viewport-local handlers, Meshy operations to canonical API handlers, and FreeCAD/Blender/OpenSCAD operators to `dispatchCadChat`.
- `dispatchCadChat.ts` sends a conversation-composer event with preferred D1 catalog tools (`cad_generate`, `cad_job_status`) and a task type. It does not itself execute the CAD job.
- `src/api/cad.js` actually exposes authenticated CAD generation endpoints: `/api/cad/openscad/generate`, `/api/cad/freecad/script`, `/api/cad/blender/script`; job status `/api/cad/jobs/:id`; approval/dispatch path `/api/cad/jobs/:id/execute`. These create/execute separate job stages; generating a script does **not** prove compilation.
- `apps/cad-creator/shared/cad/src/domain/project-tools.js` defines the nine existing authoritative CAD project tools, including revision-guarded edits and GLB export. They remain the underlying project authority; we do not fork their schemas.
- CAD Creator's standalone Node server provides native FreeCAD/Blender/OpenSCAD endpoints. Its Cloudflare Worker is still a scaffold for native execution; do not advertise Worker-native FreeCAD.

## Ported SDK capability surface

Install with `createSamOS({ cad })` (direct SAM operations) or `createCadModelTools({ cad, modelAuthorize, hookRuntime, requestPermission, invocation })` for AgentSam's **existing model tool loop**.

**Revision/project operators:** `cad.project.get`, `cad.project.validate`, `cad.project.apply`, `cad.project.save`, `cad.project.restore`, `cad.model.build`, `cad.model.inspect`, `cad.model.render`, `cad.model.export`. These invoke the canonical `design_*` tool definitions and service, not JavaScript geometry substitutes.

**CAD job operators:** `cad.job.generate` (OpenSCAD/FreeCAD/Blender intent), `cad.job.status` (actual persisted job state), and `cad.job.execute` (explicitly approved existing job dispatch). The model/user supplies intent and project context rather than handwritten Blender/FreeCAD scripts. Do not report a completed GLB until status and artifact evidence confirm success.

Legacy labels are covered by `CAD_DONOR_OPERATOR_MAPPINGS`. Meshy operations continue to use their established Meshy tools. Viewport Add Cube / Delete Selected / Reset Scene remain local and do not need new remote LLM calls. Geometry repair requires a context-aware planner; the mapping deliberately does not pretend it is one generic tool.

## Host integration

Host runtime uses the *existing* identity, project authorization, model tools and hook adapters. Example (conceptual host wiring, not a standalone app):

```js
import { createCadHttpPorts, createCadModelTools } from '@inneranimalmedia/agentsam-sdk/sam';
import { createCompositeCapabilityAdapter } from '@inneranimalmedia/agentsam-hooks';

const ports = createCadHttpPorts({
  request: authorizedHostRequest, // server-owned actor session, NOT guest-provided fetch URL/credentials
});
const cadTools = createCadModelTools({
  cad: {
    ...ports,
    resolveTrustedContext: getTrustedActor,
    authorize: authorizeProjectCapability,
    requestApproval: showHostApproval,
  },
  modelAuthorize: authorizeModelTool,
  hookRuntime: existingHookRuntime,
  requestPermission: existingHostHookApproval,
  invocation: { session_id: currentSession.id, run_id: currentRun.id },
});
const modelTools = createCompositeCapabilityAdapter([existingTools, cadTools]);
// Pass modelTools to the existing AgentSam conversation / run engine.
```

Require trusted actor/tenant/account and project grant **on every call**, validate revision/approval for writes, enforce job ownership on server, and never pass OAuth tokens or arbitrary API endpoints from model arguments. Permissions and consent in Cloudflare OAuth do not automatically authorize a customer's R2 objects, FreeCAD native process, or another tenant's project.

Use already-connected project storage / R2 authorities and `agentsam_cad_jobs`; there is no new D1 table, second job store or second mini-chat UI.

## Verify

```sh
node --test test/integration/cad-operator-capabilities.test.mjs
node --test test/integration/sam-kernel.test.mjs
```

The CAD operator tests prove authorized handler invocations, approval rejection, exact existing project-tool delegation, real API route mapping, model descriptor discovery and pre-tool Hook execution. They do **not** prove the hosted CAD Creator UI has installed this pack, that the older cloud Worker compiles native geometry, or that a new FreeCAD/Blender file has been generated end-to-end.

The following **separate integration** is still required: register `cadTools` with the CAD Creator host's current model capability adapter, send selected project/revision/objects from the existing preview bridge into the conversation, surface approvals, then receive job progress/artifacts and reload the viewport. Use current host and miniAgentSam surfaces; never create another composer, standalone assistant or agent lane.
