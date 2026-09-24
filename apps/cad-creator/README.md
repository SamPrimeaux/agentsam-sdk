# AgentSam Design Studio

> An AI-native spatial design environment for turning ideas, sketches, conversation, and structured data into editable 2D plans, synchronized 3D environments, renders, and design artifacts.

**AgentSam Design Studio** is an experimental CAD/BIM workspace exploring what professional design software can become when AI is treated as a native participant in the design process rather than an assistant layered on top of traditional tools.

The long-term goal is simple:

**Describe what you want to build, work directly with the geometry, and let AgentSam help carry the design from concept to structured spatial model.**

This repository is an early prototype of that vision.

---

## Repository workspace layout

This app is an independent npm workspace root inside the SDK repository. It intentionally does **not** join the SDK root workspace graph.

```text
apps/cad-creator/
├─ package.json
├─ package-lock.json
├─ frontend/
│  ├─ package.json
│  ├─ index.html
│  ├─ public/
│  └─ src/
├─ backend/
│  ├─ package.json
│  └─ src/server.ts
├─ shared/
│  └─ cad/
│     ├─ package.json
│     └─ src/
└─ reference/
   └─ donor/import artifacts
```

The frontend owns CAD/agent UI, the backend owns the application API/WebSocket bridge, and `shared/cad` owns the currently-active pure TypeScript CAD project/operation contracts. The imported `bun.lock` and unused duplicate donor schema are reference-only; the active workspace uses one root `package-lock.json`.

Run from `apps/cad-creator/`:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

The next architectural phase extracts product-neutral AgentSam contracts/workbench packages at the SDK `packages/` layer. CAD must consume those packages rather than depending on `apps/local-studio/`.

---

## Vision

Traditional CAD software is powerful, but much of the workflow still depends on manually translating intent into geometry:

**idea → sketch → measurements → CAD → model → render → revision**

AgentSam Design Studio explores a different workflow:

**intent → structured design → visual model → conversation → refinement**

The AI and the designer operate on the same underlying project state.

A request such as:

> Design a compact 24' × 30' modern villa with an open living area, one primary bedroom, a large kitchen island, and strong natural light.

should eventually be able to produce more than an image.

It should create an actual design model containing:

- walls
- rooms
- dimensions
- openings
- doors
- windows
- fixtures
- furniture
- materials
- elevations
- spatial relationships
- reusable parametric constraints

The resulting project should remain editable by both the human and AgentSam.

---

## What We Are Building

AgentSam Design Studio is intended to become a multimodal, AI-native environment combining several traditionally separate design workflows.

### Conversational CAD

Design and modify spaces using natural language.

```text
"Make the kitchen six feet wider."

"Move the bedroom door to the opposite wall."

"Add floor-to-ceiling windows facing the courtyard."

"Give the living room a more open circulation path."

AgentSam should translate those requests into deterministic edits against structured project geometry rather than simply generating another picture.

2D Planning

A lightweight CAD-style planning surface for:

walls
dimensions
rooms
openings
fixtures
furniture
snapping
measurements
constraints
direct manipulation

The 2D plan should remain the precise, inspectable representation of the design.

Live 3D

The same project model should drive a synchronized 3D representation.

Changes made in 2D, 3D, or through AgentSam should update the same underlying design state.

There should not be separate "AI geometry" and "CAD geometry."

There should be one project model with multiple ways to interact with it.

Sketch / Image → Structured Design

AgentSam should be able to inspect:

hand sketches
floor-plan images
reference photos
existing drawings
site images
diagrams

and use them as inputs for creating or modifying structured design geometry.

The goal is not merely image recognition.

The goal is image-to-editable-design-state.

Architectural Visualization

Structured geometry can become the foundation for higher-fidelity visualization:

material studies
lighting studies
interior concepts
exterior concepts
photorealistic renders
alternate design directions

Generated imagery should remain connected conceptually to the underlying design instead of becoming a disconnected rendering workflow.

Motion + Walkthroughs

Projects should also be capable of producing:

cinematic walkthroughs
flythroughs
camera-path studies
animated design presentations
iterative video edits

The intent is to move naturally from design → visualization → presentation inside the same environment.

AgentSam as the Design Copilot

AgentSam is intended to operate across the entire design workflow.

Rather than one enormous prompt controlling everything, specialized capabilities can cooperate around a shared design model:

                    AgentSam
                       │
        ┌──────────────┼──────────────┐
        │              │              │
      Planning       Vision        Reasoning
        │              │              │
        ├──────────────┼──────────────┤
        │                             │
      2D CAD                     Parametric Model
        │                             │
        └──────────────┬──────────────┘
                       │
                  Project State
                       │
            ┌──────────┼──────────┐
            │          │          │
           3D        Render      Video

Different models may eventually be routed according to their strengths:

spatial reasoning
multimodal understanding
structured generation
code/tool execution
image generation
video generation
long-horizon design work

The design environment should not depend permanently on a single model vendor or model generation.

Human + AI Editing

A core principle of the project is that AI generation must not remove human control.

Everything AgentSam creates should ultimately become something the designer can:

select
inspect
move
resize
delete
constrain
regenerate
override
undo
refine manually

Likewise, AgentSam should understand the changes the human makes.

The intended interaction is collaborative:

Human changes geometry
        ↓
AgentSam understands new project state
        ↓
AgentSam proposes or performs another change
        ↓
Human refines it
        ↓
Same project continues evolving

This is closer to pair-designing than prompting.

Collaboration

Design Studio is also intended to support shared design sessions.

Longer term, a project may include:

multiple live participants
presence and cursors
owner/editor/viewer roles
synchronized project state
comments and design discussions
AI-assisted collaborative sessions
version history
branches / design alternatives

AgentSam should be able to participate in the same collaborative environment as human team members.

Interoperability

The project is not intended to become a closed visual sandbox.

A serious design environment eventually needs pathways into and out of existing ecosystems.

Areas we want to explore include:

CAD interchange
BIM interchange
SVG / vector geometry
DXF
IFC
GLTF / GLB
OBJ
project JSON
images
PDFs
construction documentation
external rendering pipelines
fabrication workflows
GIS / site data
product and fixture catalogs

The exact formats and integrations will evolve as the underlying project model matures.

Current Prototype

The repository currently demonstrates several pieces of the concept:

interactive 2D architectural planning
synchronized 3D visualization
AI-assisted plan generation
sketch / image interpretation
structured architectural geometry
image generation and editing
video-generation workflows
real-time WebSocket collaboration
owner / editor / viewer collaboration roles

The current implementation uses a React/Three.js frontend with a lightweight TypeScript server and Gemini-powered multimodal capabilities.

This is still an experimental architecture.

Several systems currently represented directly in the prototype will eventually move behind stronger AgentSam runtime contracts, model routing, persistence, tool execution, and project-state services.

Architectural Direction

As the project matures, we want a clear separation between:

Design Studio UI
        │
        ▼
Design Commands / Tools
        │
        ▼
Canonical Project Model
        │
   ┌────┼─────┐
   ▼    ▼     ▼
  2D    3D   BIM/CAD
        │
        ▼
AgentSam Runtime
        │
   ┌────┼──────────────┐
   ▼    ▼              ▼
Models  Tools      External Systems

The canonical project model should remain independent from whichever model happened to create it.

AI proposes operations.

The design engine owns geometry.

The project model remains the source of truth.

Principles
AI-native, not AI-decorated

AI should participate directly in creating and modifying structured design state.

One model of the project

2D, 3D, AI, collaboration, rendering, and export should operate on the same underlying project.

Human control remains first-class

Generated geometry must remain editable and understandable.

Multimodal by default

Text, images, sketches, geometry, files, and eventually audio/video can all become legitimate design inputs.

Tools over magic

When possible, AgentSam should perform explicit design operations instead of repeatedly regenerating the entire project.

Model-agnostic architecture

Individual AI models will improve quickly.

The design platform should be able to adopt better models without redesigning the application around them.

Progressive fidelity

A project should be able to evolve naturally from:

idea
→ rough layout
→ dimensioned plan
→ spatial model
→ detailed design
→ visualization
→ documentation
→ export

without repeatedly starting over.

Aspirational Workflow

Imagine opening Design Studio with nothing but an empty canvas.

You say:

Create a small modern courtyard house for a narrow urban lot.

AgentSam creates an initial plan.

You drag one wall.

AgentSam immediately understands the revised dimensions.

You upload a photo and say:

Use this material language for the courtyard.

You switch to 3D.

You ask:

Show me what this feels like at sunset.

You inspect the result and say:

The kitchen feels isolated. Give me two alternatives without changing the exterior footprint.

AgentSam generates two editable design branches.

You select one.

The project continues from there.

That is the experience this repository is ultimately trying to build.

Status

Experimental / active development

AgentSam Design Studio is currently a research and prototyping project.

The interface, project schema, AI models, APIs, rendering architecture, and CAD/BIM implementation are expected to evolve substantially.

The goal at this stage is not to pretend the problem has already been solved.

The goal is to discover the right architecture for an AI-native design environment and keep turning successful experiments into durable product primitives.

Repository

AgentSamCadCreation currently serves as the focused experimentation ground for AgentSam Design Studio.

Successful concepts developed here can eventually graduate into the wider AgentSam platform while this repository remains useful for rapidly exploring spatial-design capabilities without coupling experimentation to the core runtime.

Long-Term Goal

Make sophisticated spatial design dramatically more accessible without reducing the precision, control, and interoperability expected from professional design software.

AgentSam should help bridge the distance between:

what someone can imagine

and

what they can actually design.


I especially like the **“AI proposes operations; the design engine owns geometry; the project model remains the source of truth”** principle for this repo. That prevents Design Studio from eventually turning into a pile of model-generated JSON that happens to resemble CAD.

Also, I noticed something useful while reading the prototype: `server.ts` still routes planning and sketch parsing through **`gemini-2.5-flash`** even though the actual AI Studio build that impressed you was 3.7 Flash. That lines up perfectly with the catalog audit we were just doing—this repo is a good candidate to move off hard-coded model names entirely and eventually ask AgentSam's model fleet/router for a `spatial_design` / `vision_design` capability instead. 

If you want, I can also **put this directly into `SamPrimeaux/AgentSamCadCreation` as `README.md` on a branch and open the PR**.

---

## Installable AgentSam app package

CAD Creator is packaged independently from the core SDK as:

```text
@inneranimalmedia/agentsam-sdk-cad-creator
```

The package deliberately contains both:

1. a **prebuilt local preview** so someone can install and try the actual UI immediately, and
2. a **curated editable scaffold** containing the frontend, backend, shared CAD contracts, and deployment manifests.

It deliberately does **not** publish `reference/`, donor ZIPs/snapshots, `node_modules`, local `.wrangler/state`, build caches, or local environment files.

### Try the packaged UI locally

Once published:

```bash
npx @inneranimalmedia/agentsam-sdk-cad-creator
```

or after installing it:

```bash
npm install @inneranimalmedia/agentsam-sdk-cad-creator
npx agentsam-cad-creator --port 3000
```

Then open:

```text
http://127.0.0.1:3000
```

The normal Design Studio shell loads first. The MuJoCo/robotics workspace remains a separate lazy chunk and is loaded only when the user enters or preloads the Robotics surface.

`GEMINI_API_KEY` is **not required to view and exercise the local UI**. It is required for Gemini-backed planning, image/video, and embodied-reasoning requests.

### Materialize an editable project

```bash
npx @inneranimalmedia/agentsam-sdk-cad-creator scaffold ./my-cad-app
cd ./my-cad-app
npm install
npm run dev
```

That gives the user an ordinary self-contained project rather than asking them to develop inside `node_modules`.

From there it is source-ready for a Git repository:

```bash
git init
git add .
git commit -m "Initial AgentSam CAD Creator app"
```

### Cloudflare status

`backend/worker/index.js` and `backend/wrangler.jsonc` ship with the scaffold. The Worker boundary currently implements health and robotics perception endpoints. The complete Node CAD API/WebSocket backend is **not yet fully Worker-native**, so `npm run cf:dry-run` verifies the existing Worker scaffold but should not be represented as a full production Cloudflare deployment of every CAD feature yet.

The intended progression is:

```text
npm package
  → local preview
  → editable scaffold
  → Git repo / customization
  → complete Worker route port
  → Cloudflare deployment
```


---

## `cad.project.v1` — the first reusable AgentSam CAD capability pack

`apps/cad-creator` is the reference product and proving ground for AgentSam CAD, but the reusable CAD machinery is SDK-owned. The product must not become a pile of app-local Blender, FreeCAD, OpenSCAD, BIM, or generative-provider code.

The durable boundary is:

```text
CAD Creator / Local Studio / CLI / MCP / workflows
                    │
                    ▼
          normalized AgentSam CAD tools
                    │
                    ▼
               cad.project.v1
                    │
        ┌───────────┼───────────┐
        │           │           │
   project state  workflows   artifacts
        │
        ▼
        engine / provider adapters
        │
        ├─ IfcOpenShell / BIM
        ├─ build123d / BREP
        ├─ CadQuery / alternate OCCT
        ├─ FreeCADCmd / OpenCASCADE
        ├─ OpenSCAD / deterministic CSG
        ├─ Blender headless / scene + render
        └─ optional GPU asset generators
```

**Rule:** AgentSam owns the operation contracts. Engines are replaceable implementations.

Do not make provider-specific commands such as `ifcopenshell_create_wall` or `blender_render_scene` the canonical agent contract. Prefer stable operations such as `design_wall_create`, `design_solid_boolean`, `design_render_preview`, and `design_ifc_export`, then let capability routing select the execution engine.

### Current `cad.project.v1` surface

This release establishes the first reusable CAD capability pack with nine AgentSam tools:

- `design_project_get`
- `design_project_validate`
- `design_apply_operation`
- `design_project_save`
- `design_project_restore`
- `design_model_build`
- `design_model_inspect`
- `design_model_render`
- `design_model_export`

The package also defines two reusable workflows:

- `cad.house_baseline`
- `cad.edit_preview`

and exposes the CLI surface:

```text
agentsam cad project ...
```

Project writes are revision-guarded. Builds and downstream artifacts are tied back to project revision/content evidence rather than treated as anonymous files.

### Next capability packs

Expand outward from `cad.project.v1`; do not bypass it with app-only integrations.

#### BIM / architecture

Target normalized operations such as:

```text
design.bim.project.create
design.bim.wall.create
design.bim.opening.create
design.bim.door.create
design.bim.window.create
design.bim.space.create
design.bim.roof.create
design.bim.stair.create
design.bim.validate
design.ifc.import
design.ifc.export
```

IfcOpenShell is the preferred initial headless BIM engine. Bonsai can serve as an optional Blender-side authoring and QA adapter, not as the canonical AgentSam contract.

#### Precise BREP / solid modeling

Target:

```text
design.solid.extrude
design.solid.revolve
design.solid.boolean
design.solid.fillet
design.solid.chamfer
design.solid.shell
design.solid.measure
design.solid.validate
```

Prefer build123d as the primary headless Python/OCCT adapter. CadQuery and FreeCAD/OpenCASCADE can provide alternate or interoperability lanes without changing the public operation vocabulary.

#### Parametric modeling

Keep OpenSCAD behind normalized operations such as:

```text
design.parametric.compile
design.parametric.measure
design.parametric.interference_check
design.parametric.export
```

The native OpenSCAD CLI/container lane is the production shape. Third-party OpenSCAD MCP projects are useful contract/reference material but are not required runtime dependencies.

#### Mesh / render

Blender remains a headless execution engine behind operations such as:

```text
design.mesh.inspect
design.mesh.repair
design.mesh.convert
design.scene.build
design.render.preview
design.render.final
```

The app should not depend on a live GUI session for production operation.

#### Layout / planning

Constraint-to-layout systems should produce a normalized plan—rooms, adjacency, walls, openings, circulation and constraints—before geometry is built. External layout projects can inform or plug into that solver boundary; they should not become geometry SSOT.

#### Generative assets

Image/text-to-3D systems belong in optional GPU lanes for furniture, fixtures, props and other assets:

```text
design.asset.generate
design.asset.reconstruct
design.asset.texture
design.asset.optimize
```

Generated assets are inputs to the project. They are not authoritative architectural geometry.

### Engine contract

New CAD engines should implement a common adapter shape rather than adding bespoke app routes:

```js
{
  id: "ifcopenshell",
  executionLanes: ["local", "container"],
  capabilities: [
    "design.bim.read",
    "design.bim.write",
    "design.ifc.import",
    "design.ifc.export"
  ],

  discover(ctx),
  doctor(ctx),
  execute(operation, input, ctx),
  inspect(artifact, ctx)
}
```

Engine discovery must be explicit and fail closed. A missing engine should produce a capability/doctor receipt, not silently substitute a different provider unless the caller explicitly permits fallback.

### Registry and company inventory

Reusable CAD machinery must remain visible in the AgentSam registry:

- `agentsam_products` owns the `agentsam-cad-creator` product and future packaged CAD modules.
- `agentsam_tools` owns normalized callable operations.
- `agentsam_capabilities` and tool-capability mappings describe what each tool can do.
- `agentsam_workflows` owns reusable CAD workflows.
- `agentsam_plugins`/engine inventory should represent installed or connectable execution engines.
- `asset_relationships` links CAD Creator to its tools, workflows, command surface, repository, reusable packages, and engines.

External engines such as IfcOpenShell, build123d, FreeCAD, OpenSCAD and Blender are dependencies/integrations, not InnerAnimalMedia products.

### Development rule

**No new CAD Creator engine or provider integration should merge unless its reusable operation contract and adapter boundary already have an AgentSam SDK home.**

Use CAD Creator as the production/reference host that proves the abstraction. When an operation survives real app usage, tests, failure cases, discovery, auth/authority rules and deployment, keep that machinery reusable rather than copying it into another app.

This is the same product-development pattern used elsewhere in AgentSam: the SDK owns normalized contracts and execution machinery; real applications prove them.
