# CAD Creator professional inspector

The editor entry point is `frontend/src/app/CadCreatorApp.tsx`. The right dock selects families from the shared `@inneranimalmedia/agentsam-workbench/studio-panels` catalog. Native project records and imported scene elements retain separate edit paths. The active viewport registers its camera and renderer commands with `world-view-store.ts`.

| Family | Implementation and binding | Document or runtime result | Remaining coverage |
| --- | --- | --- | --- |
| Object & Transform | EngineeringWorkbench, CAD design operations, patchSceneElement | Selection, native dimensions and placement, imported offsets, rotation and visibility | General 2D path, text and typography selection belong to their respective editors |
| Geometry | EngineeringWorkbench and NativeSolidPanel | Native parameters, openings and OCCT inspection. Imported elements expose measured source bounds | Feature-history editing varies by generator |
| BIM & Engineering | Wall assembly operations, opening and space records | Layer composition, host relationships, opening geometry and room data | Full storey, host and quantity schedules |
| Materials | PbrMaterialPicker and shared agentsam-3d-viewer material factory | Searchable preset assignment. Imported elements also store individual color, metalness, roughness, opacity and emission overrides | User texture asset replacement, UV editing and map channels |
| Camera | WorldViewSection and active viewport | Registered worlds support orbit, walk, perspective and orthographic orbit, FOV, clipping, room navigation and named orbit views. The native viewport supplies its own camera list | Fly mode, focal-length entry and camera-object transform authoring |
| Environment | CadWorldViewport, Three.js Sky, HemisphereLight and Fog | Sky parameters, presets, ground bounce and distance fog in sceneSettings | HDRI asset selection and environment reflection controls |
| Lighting | CadLightingPanel, Three.js scene lights | Directional, point and spot lights, target, intensity, range, cone, shadows, manual sun direction and ambient settings | Geolocation/date solar solver, area light support and independent per-object shadow controls |
| Terrain & Site | TerrainEditorPanel hosted through a React portal into Properties | Existing terrain engine retains landforms, sculpt strokes, vegetation, JSON and CSV controls. Changes use the registered project's sceneSettings. Closing the dock releases the sculpt tool | Arbitrary parcel and exclusion polygons |
| Rendering | WorldViewSection and active renderer | Source colors, lit materials, wireframe, exposure, tone mapping, shadow resolution and PNG capture | Color-space, reflection quality and configurable export dimensions |
| Motion & Presentation | CadSequenceDock with active camera commands | Camera beats, duration, cut playback and registered-world glide transitions. Native model beats use its named views. The project stores the sequence | General object keyframes, scrubbing and full SamScene director interoperability |
| Analysis | CadProjectTakeoff | Computed areas, openings and wall lengths from current native geometry | Structural analysis requires a separate solver binding |
| Simulation | LazyRoboticsWorkspace and MujocoSimulationProvider | Opens the independent robot sandbox on demand and returns to the drawing | Structural, thermal and site simulation of the active CAD document remain unbound |
| Project | EngineeringWorkbench, ProjectRuntimePanel, hosted-project-source | Identity, units, grid, composition, revision I/O and saved project state | Authenticated host release acceptance |
| Source | CadInspectorSource and source bindings | Provenance and permitted edits follow the selected object | Exact editing rights depend on the source and host |

## Shared controls

`@inneranimalmedia/agentsam-workbench/shell` exports InspectorPicker, StudioToolButton, StudioCommandMenu, StudioCommandItem, StudioGlyph and ResizableStageHandle. A host supplies command handlers and permissions. SamSketch consumes the same Materials, Camera and Lighting panel definitions. The framework-independent `/studio-icons` entry point is consumed by SamSketch and the CAD timeline. The Create menu groups common, drawing, architecture and presentation commands. Each actionable CAD row calls its workspace handler.

## Local acceptance

- Desktop Chrome at 2560 × 1440. Dragged the split from 50% to approximately 57% and recovered the same split after reload.
- Mobile Chrome at 390 × 844. Opened Create, chose Wall and opened the right Properties drawer. Document width stayed at 390 CSS pixels.
- Native local service. Added a camera beat to a new test document, saved revision 1, reloaded the page, opened the saved revision by project ID and recovered the beat.
- Registered-project browser fixture. A real Three.js viewport loaded a test mesh. Created an orbit camera, added a beat, changed fog distance, added a point light, set its intensity, adjusted the site width, added a hill, assigned a gold material and edited roughness. Checked the document sent to Save and reopened the camera. The fixture supplied registry and asset responses. Production D1/R2 acceptance remains open.
- Local simulation. Opened the MuJoCo robot sandbox from Properties, paused the live physics loop, verified Resume became available and returned to the two CAD canvases.
