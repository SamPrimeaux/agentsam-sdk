"""Package structure concept source, verified exports, QA and authoring scripts."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

NAME="Barndominium-Structure-Concept-V2"
PREFIX="library/bim-starters/barndominium/v2/"

def sha(p):
    h=hashlib.sha256()
    with open(p,"rb") as f:
        for c in iter(lambda:f.read(1048576),b""):h.update(c)
    return h.hexdigest()

def main():
    b=Path(sys.argv[1]).resolve()
    r=Path(__file__).resolve().parent
    files={
        "source.FCStd":b/(NAME+".FCStd"),
        "model.ifc":b/(NAME+".ifc"),
        "preview.glb":b/(NAME+".glb"),
        "thumbnail.webp":b/"thumbnail.webp",
        "schedules/elements.csv":b/"elements.csv",
        "schedules/openings.csv":b/"openings.csv",
        "schedules/rooms-source.csv":b/"rooms-source.csv",
        "schedules/design-review-required.csv":b/"design-review-required.csv",
        "validation.json":b/"validation.json",
        "authoring/build_structure.py":r/"build_structure.py",
        "authoring/render_preview.py":r/"render_preview.py",
        "authoring/prepare_release.py":r/"prepare_release.py",
    }
    readme=b/"README.md"
    readme.write_text("""# Barndominium Structure V2 — Owner/Design Team Review

This is a genuinely editable FreeCAD structural-concept model and an IFC4 model,
NOT engineered or approved for construction, fabrication or permitting.

Contents:
- source.FCStd: 688 separately modeled FreeCAD objects, each with element ID
  and IFC classification metadata, suitable for native inspection and editing.
- model.ifc: 688 BIM elements, 26 explicit opening void/fill links,
  20 source room volumes as IfcSpace objects.
- preview.glb: 688 named preview mesh nodes, never the parametric source.
- thumbnail.webp: one current thumbnail for this release.
- schedules: full element, door/window opening, room and review registers.
- validation.json: machine QA and full assumptions/issues list.
- authoring: FreeCAD/IfcOpenShell and Blender source generators.

Original drawing basis: garage 38 by 42 ft; living 72 by 32 ft;
total gross enclosed 3900 sf; 60 by 8 ft porch; 24 by 10 ft patio.
Three 10 by 12 ft garage doors; 10 ft living ceiling; nominal 2x6 walls,
roof 6:12 and trusses 24 inches on center; porch roof 3:12.

DESIGN GATES (UNRESOLVED):
- 14-ft garage wall/eave assumed to admit 12-ft garage doors.
- Roof plan ridge orientation contradicts 18-ft ridge in source section.
  Living model follows section; garage roof valley/junction is NOT engineered.
- Foundations/slab reinforcement, bearing/lateral framing, garage portal
  frames, truss sizing, connectors, wind/uplift, flashing and site drainage
  need geotechnical and structural design.
- Bedroom glazing/egress, door swings and garage fire separation need review.
- All partitions are provisional plan approximations. MEP, interior finishes,
  cabinets, equipment and construction schedule still need coordination.
- Verify local code, soils, flood, setbacks and permit requirements.

Next agent: resolve owner/architect issues, finish engineering and all
interior/MEP systems, reconcile element IDs with model-derived schedules,
and run clash/IFC/quantity validation before any approval or active BIM release.

Regenerate with FreeCAD Python using authoring/build_structure.py and source
room-schedule.csv, then Blender render_preview.py. Prepare a release with
authoring/prepare_release.py. Original source remains at R2
cad/library/bim-starters/barndominium/v1.1/owner-review/ .
""")
    files["README.md"]=readme
    if any(not p.is_file() for p in files.values()):raise RuntimeError("missing file")
    receipt=json.loads((b/"validation.json").read_text())
    if receipt["invalid_brep_shapes"] or receipt["ifc_export_errors"] or receipt["model_elements"]!=688 or receipt["real_opening_boolean_cuts"]!=26:
        raise RuntimeError("source failed QA")
    package=b/(NAME+".zip")
    with zipfile.ZipFile(package,"w",zipfile.ZIP_DEFLATED,compresslevel=7) as z:
        for name,path in sorted(files.items()):z.write(path,arcname=name)
    with zipfile.ZipFile(package) as z:
        if z.testzip() or set(z.namelist()) != set(files):raise RuntimeError("corrupt ZIP")
    files[package.name]=package
    rows=[]
    for name,path in sorted(files.items()):
        typ=("application/zip" if name.endswith(".zip") else
             "application/octet-stream" if name.endswith(".FCStd") else
             "application/ifc" if name.endswith(".ifc") else
             "model/gltf-binary" if name.endswith(".glb") else
             "image/webp" if name.endswith(".webp") else
             "text/csv" if name.endswith(".csv") else
             "application/json" if name.endswith(".json") else
             "text/x-python" if name.endswith(".py") else "text/markdown")
        rows.append({"path":name,"key":PREFIX+name,"bytes":path.stat().st_size,"sha256":sha(path),"content_type":typ})
    manifest={
        "schema":"agentsam.cad.bim-starter.v1",
        "id":"barndominium",
        "title":"Barndominium — Native Structural Concept V2",
        "version":"2.0.0-structural-concept",
        "sourceFormat":"FCStd","sourceFile":"source.FCStd",
        "ifcFile":"model.ifc","previewFile":"preview.glb",
        "thumbnailFile":"thumbnail.webp","archiveFile":package.name,
        "sourceSha256":next(x["sha256"] for x in rows if x["path"]=="source.FCStd"),
        "previewSourceSha256":next(x["sha256"] for x in rows if x["path"]=="source.FCStd"),
        "objectCount":688,"meshCount":688,"materialCount":len(receipt["model_categories"]),
        "sourceSpaces":20,"openingCount":26,"ifcOpenings":26,
        "nativeBim":True,"engineeringApproved":False,
        "readyForConstruction":False,"modelStage":"structural_concept_unreviewed",
        "sourceTemplateSku":"SAM-SPACE-BARNDOMINIUM-V11",
        "parentTemplateSku":"SAM-BIM-BARNDOMINIUM-STARTER",
        "sourceR2Key":"library/bim-starters/barndominium/v1.1/owner-review/manifest.json",
        "sourceR2Bucket":"cad","modelElementGroups":receipt["model_categories"],
        "issuesOpen":len(receipt["open_design_issues"]),
        "statusReason":"Structural geometry and native exchange verified; engineering and interior/MEP coordination not approved",
        "files":rows
    }
    dest=b/"manifest.json"
    dest.write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps({"archive":str(package),"archive_bytes":package.stat().st_size,
        "manifest_sha256":sha(dest),"source_sha256":manifest["sourceSha256"],
        "members":len(rows),"prefix":PREFIX},indent=2))
if __name__=="__main__":main()
