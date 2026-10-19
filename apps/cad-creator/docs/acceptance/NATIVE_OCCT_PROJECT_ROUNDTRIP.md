# CAD Creator — Native OCCT Project Round-Trip Acceptance

Date: 2026-10-18 · Product: `cad-creator` · Canonical project contract: `cad.project.v1`

## Observed local evidence (Sams-iMac)

| Gate | Evidence | State |
| --- | --- | --- |
| Native dependency | Homebrew OpenCascade 7.9.3 development library + CMake/Clang on macOS | Verified locally |
| C++ engine | `services/cad/occt/main.cpp`, `CMakeLists.txt`, native binary at `~/.agentsam/bin/agentsam-occt` | Compiled; `--doctor` passed |
| SDK provider | `src/lib/cad/occt-native-provider.mjs` with bounded subprocess doctor, authorized artifact root, STEP reopen, SHA-256 | Verified locally |
| Canonical project | `design_model_build`, `design_model_inspect`, `design_model_export` on saved `cad.project.v1` revision | Verified locally |
| CAD Creator API | Local `/api/cad/project/tools/:name`, `native/doctor` and scoped artifact route | Real HTTP proof passed |
| Reusable CAD copilot | `@inneranimalmedia/agentsam-workbench/agent` `MiniAgentSam`; embedded requests via existing Local Studio host bridge | Built; end-user visual acceptance pending |
| Embedded packaging | CAD app built for `/cad-creator/` and staged into Local Studio public assets | Build passed locally |
| Desktop installer | Complete Local Studio `desktop-dist` + Chrome smoke + signed app/DMG | **Blocked / not verified** |
| Hosted/production tool binding | Account authorization, SAM dispatch, deployment, output verification | **Not verified; tools must remain inactive** |

Real HTTP test on `127.0.0.1:5395` used an actual saved project revision and OCCT 7.9.3. It produced a 15,455-byte STEP artifact, independently reopened and inspected the solid (16,387,064 mm³), downloaded the file over the scoped local artifact route, and confirmed its SHA-256 digest. Browser UI acceptance was not established by this HTTP proof.

Local exact-command verification:

```sh
cmake -S services/cad/occt -B /tmp/agentsam-occt-build -G 'Unix Makefiles' -DAGENTSAM_OCCT_PREFIX="$(brew --prefix opencascade)"
cmake --build /tmp/agentsam-occt-build -j 4
/tmp/agentsam-occt-build/agentsam-occt --doctor
AGENTSAM_TEST_OCCT_NATIVE=1 node --test test/integration/cad-project-occt-contract.test.mjs
npm --prefix apps/cad-creator run typecheck
npm --prefix apps/cad-creator run build
npm --prefix apps/cad-creator test
npm run verify:boundaries
```

Native execution is optional and fails closed if the kernel cannot be probed. The selected primitive must exist in `parametricObjects` of the saved project; a browser-supplied path is never accepted as the output location. A revision content hash and artifact digest guard later inspect/export operations. OCCT does **not** substitute for Blender-based architectural scene rendering.

## D1 catalog reconciliation

Company inventory authority: existing `inneranimalmedia-business` D1 tables, **not** a new CAD-specific catalog.

- `agentsam_products`: `prod_665c3051791f4a18`, `cad-creator`, package `@inneranimalmedia/agentsam-cad-creator`, version 2.6.12, status `wired`.
- `agentsam_tools`: nine existing `cad.project.v1` operations and their `agentsam_tool_capabilities` mappings remain defined and **inactive** pending verified hosted binding.
- `agentsam_capabilities`: local-evidenced `design.solid.create`, `design.solid.inspect`, `design.solid.export.step` declared **inactive**, not automatically aliased into every `design_model_build` provider.
- `agentsam_plugins`: six **host-scoped, disabled** external native engine inventory records for OCCT, OpenSCAD, Blender, FreeCAD, build123d and IfcOpenShell. OCCT/OpenSCAD/Blender local doctor passed; FreeCAD CLI probe failed; build123d/IfcOpenShell Python modules were unavailable.
- `agentsam_workflows`: `cad.occt_step_roundtrip` revision 1 is a **draft** graph with six nodes and five edges. No hosted workflow run is claimed.
- `asset_relationships`: product-to-tool, workflow, CLI, repository, engine inventory and reusable miniAgentSam package linkage confirmed.

The D1 inventory was applied and read back through the SAM D1 connector on 2026-10-18. Operator/host-specific entries are not portable D1 schema migrations. Runtime activation must follow actual identity, permission, host installation and receipt verification, not a SQL toggle.

## Next capability packs — explicit unimplemented states

The existing README lists normalized target operations for BIM/IFC (IfcOpenShell), BREP (build123d), parametric OpenSCAD, Blender meshes/scenes/renders, layout planning and generative 3D assets. Those are directionally appropriate. The OCCT local primitive proof does **not** establish those APIs are implemented, callable, or safe to activate. Future providers should implement `{id,executionLanes,capabilities,discover,doctor,execute,inspect}` under the SAM operation registry, not duplicate app-only endpoints.

The product lifecycle should remain explicit: `IMPLEMENTED → VERIFIED → MERGED → BUILT → DEPLOYED → ACCEPTED → SHIPPED`, with `BLOCKED` describing any missing gate. No state is implied by an upstream step alone.
