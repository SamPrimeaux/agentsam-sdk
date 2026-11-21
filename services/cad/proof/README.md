# CAD v2 multi-engine building acceptance

`building_source.py` reads the existing `cad.project.v2` source with a strict
architecture module. It does not create a new project schema or replace the
editable CAD model. The proof fixture is only a test input, not stock customer
data or a universal DreamHouse template.

A runtime containing FreeCAD, OpenCascade `agentsam-occt`, IfcOpenShell,
ezDXF, PyMuPDF, Blender, glTF-Transform and FFmpeg can run:

```sh
python3 services/cad/proof/building_proof.py all \
  --source services/cad/proof/fixtures/building-project.v2.json \
  --base <actual-sha256-of-source> --out /tmp/cad-building-proof
```

Or call `POST /v1/cad/building/export` on the authenticated Python CAD service
with `{ "source":{"kind":"file","mount":"work","path":"building.json"},"base":"<sha256>" }`.
`base` is a source-byte hash precondition. The runtime resolves `work` from its
authorized mounted roots, not from SDK or project root fields. A source file
need not belong to a separately created project. Results are isolated derived
files; original assets remain intact. The output receipt includes SHA-256 and
source identity/version for each artifact.

Required independent checks cover exact volume and STEP reopening, typed IFC
entities/voids/fills/storey, IfcOpenShell validation and unique GlobalIds,
source provenance property sets, DXF plan/measurements, architectural-scale
PDF and SVG drawing, rendered PNG, optimized GLB validation, and H.264 video
decoding. The model geometry is still limited to a rectangular shell with
north/south openings. An unsupported feature or loss is a hard failure,
never silent deletion or a green status.

The available local Docker `agentsam-cad:07e87e2fe7` is distinct from the
Cloudflare `iam-cad-worker`. Never infer production-host availability from
this proof. See `docs/architecture/SCHEMA_AUTHORITIES.md`.
