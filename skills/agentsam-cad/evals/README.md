# AgentSam CAD skill evaluation prompts

Use these five prompts as routing regressions when the skill or CAD operation catalog changes.
The expected behavior is deliberately strict: choose an implemented route, state the limits, and
never infer an engine capability from a file extension or schema alone.

## 1. Safe IFC property edit

**Prompt:** "I have a building IFC. Compare it with yesterday's version, update the fire-rating
property on two identified doors, and give me the changed file without disturbing the GlobalIds."

**Expected route:** discover `agentsam cad ifc status`; inspect and validate the source; diff against
the prior file; use the allowlisted `cad.bim.ifc.edit` operation to a new output path; validate and
diff the output; verify GlobalIds and the edited-object boundary. Do not route this to parametric CAD
geometry editing or overwrite the source IFC.

## 2. Exact mechanical solid with a through-hole

**Prompt:** "Make an 80 × 50 × 4 mm plate with a 10 mm through-hole, export STEP, and prove the hole
is real rather than just a circular mark in the preview."

**Expected route:** check OCCT/FreeCAD readiness; prefer the exact B-Rep lane (OCCT or FreeCAD), build
from a typed/approved request, inspect the exported STEP by reopening it, compare measured volume
to the expected value and verify the output hash/receipt. A Blender mesh route is acceptable only
when the request explicitly asks for a mesh; dimensions alone do not prove the hole.

## 3. Mesh import vs parametric reconstruction

**Prompt:** "Open this STL in IAMScene and turn it into an editable mechanical part I can change by
feature later."

**Expected route:** ask for/confirm source units, use the IAMScene format registry for STL mesh
import, preserve the original, and explain that mesh import is not parametric B-Rep reconstruction.
Do not claim that IAMScene or a source-format reference automatically creates an editable feature
history. Route a separate, explicitly authorized reconstruction task through a real FreeCAD/OCCT
host if one advertises it.

## 4. Multi-gigabyte generated artifact

**Prompt:** "Generate the model through the CAD job runner, then download the 5 GB GLB to the project
workspace without loading it all into memory."

**Expected route:** submit/status/execute through `AgentSamClient.cad_jobs` with a trusted host
invoker; obtain the host artifact receipt; use `CadServiceClient.download_to()` for bounded-memory,
resumable transfer; verify byte count and SHA-256 before promotion. Do not use inline `download()` or
create another queue.

## 5. Canonical v2 project vs local legacy CLI

**Prompt:** "This `cad.project.v2` file validates, but `agentsam cad project validate` rejects it.
Can you make the v2 project work?"

**Expected route:** explain that v2 is the canonical portable project contract but the local
`agentsam cad project` file-store runtime is still v1. Check whether the connected SAM host's
`cad.project.*` adapter advertises v2 support. If not, report the integration gap and do not add a
second project store or tell the user to downgrade/rescale the source.
