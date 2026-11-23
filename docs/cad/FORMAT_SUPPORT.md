# CAD format identity and delivery policy

The root identity catalog is `contracts/source-types.v2.json`. The SDK's
`src/lib/cad/format-policy.js` only maps CAD-relevant filename suffixes to
canonical identities. It is **not** a competing format catalog, codec list,
file-content detector, or claim that CAD Creator can import the file.

The scene registry (`packages/iamscene/src/format-registry.ts`) separately
advertises **import**, **export**, **live reference**, and **round-trip** for
each adapter. An extension recognized by local CAD source discovery does not
grant import/edit/export functionality.

## Key format families

| Work | Common source / exchange | Presentation and deliverables |
| --- | --- | --- |
| Semantic building BIM | IFC, IFCZIP, IFCXML, FCStd, RVT | IFC, PDF, DXF, SVG, CSV |
| Precise solids / fabrication | STEP, IGES, BREP, FCStd, STL, 3MF, OBJ, PLY | STEP, STL, 3MF, DXF, SVG |
| Site / surveying | IFC, E57, LAS, LAZ, XYZ | PDF, SVG, DXF, GLB |
| Native scenes | IAMScene, IAMGeometry, BLEND, USD, USDZ, GLTF | GLB, MP4, MOV, PNG |
| Video editing | MOV, MP4, OTIO, WAV | MOV, MP4 |

Every delivery profile produces *planned intents*. A provider must explicitly
advertise an authorized operation, produce real artifact bytes, record the
source revision, and provide a receipt. Generated outputs are **not** considered
validated for delivery. Professional-review flags never claim permit readiness
or a legal seal.

## Known capability gaps

- **IFC:** the existing IfcOpenShell adapter inspects semantics, but general
  `cad.project.v2` import/edit/export parity and independent round-trip proof
  are separate engineering tasks.
- **STL/OBJ/PLY:** IAMScene can import triangle meshes. This is not parametric
  reconstruction and is not a CAD solid-editing operation.
- **SVG / MOV:** recognized for routing, archiving and delivery planning.
  They do not have IAMScene semantic import/export adapters.
- **3MF, RVT, DWG, IFCZIP, USD:** suffix recognition is not proof of a working
  reader, writer, license, engine installation, or round-trip support.
- **Native project formats:** FCStd and BLEND must retain their original
  source and a trusted external application engine; a GLB preview is not a
  replacement for the editable native file.

When implementing a codec, add a real fixture and test preservation of native
identity, units, orientation, semantic relationships, geometry, and sidecars;
do not promote 'recognized' to 'implemented' based on a successful upload.
