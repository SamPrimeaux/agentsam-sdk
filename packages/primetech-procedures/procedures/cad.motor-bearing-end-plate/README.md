# CAD/CAM Model 01 — Motor / Bearing End Plate

This versioned PrimeTech procedure produces a real parametric CAD artifact set using the installed FreeCAD/OpenCASCADE kernel.

## Run
Invoke procedure cad.motor-bearing-end-plate.build@0.1.0 through the existing PrimeTech procedure handler. Input must include:
- output_dir: a project-relative location under .agentsam/artifacts/cam/<part>/<revision> (optional; the default is supplied).
- variant: candidate-150mm.

AGENTSAM_FREECAD_PYTHON may point to the host's FreeCAD Python runtime. Standard FreeCAD install locations are discovered as fallbacks. Blender, ImageMagick, and Chrome are used only for the review render and document outputs.

## Parametric source
parameters.json contains the original requested specification and a separately identified candidate. Geometry is regenerated from that parameter source; build_freecad.py constructs a native FreeCAD feature history and exports STEP/STL in one FreeCAD session.

## Current geometry decision
The original 120 mm OD cannot accommodate a separate 60 x 30 x 4 mm pocket while clearing the 52 mm counterbore and remaining inside the circular boundary. Candidate B uses a 150 mm OD and a tangential pocket placement at a 51 mm radial center. This is a proposal, not an approved revision.

## Output
Native FCStd, STEP, STL, verification and feasibility JSON, a dimensioned SVG/PDF drawing, simulation-only CAM plan, illustrative path-layer preview, a seven-page PDF review deck, source snapshot, manifest, and ZIP bundle.

The review-only CAM output is marked UNVERIFIED and not approved for physical machining; no hardware is actuated. The generic NC review file is not a validated machine program.
