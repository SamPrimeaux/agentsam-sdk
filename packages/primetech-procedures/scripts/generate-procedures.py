import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "procedures"
colorway_ids = ["technical-slate","lagoon","industrial-ember","alloy-blue","prime-electric","prime-spectrum","reverse","core-mono"]
string = {"type":"string","minLength":1,"maxLength":240}
output = {"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"],"additionalProperties":True}
colorway = {
    "type":"object","required":["id","foreground","background"],
    "properties":{
        "id":{"type":"string","enum":colorway_ids},
        "foreground":{"type":"string","pattern":"^#[0-9a-fA-F]{3,8}$"},
        "background":{"type":"string","pattern":"^#[0-9a-fA-F]{3,8}$"}
    },"additionalProperties":False
}
schemas = {
"primetech.icon-family.build": {
    "required":["sourceSvgPath","colorways"],
    "properties":{
        "sourceSvgPath":string,"outputDir":string,
        "colorways":{"type":"array","minItems":8,"maxItems":8,"items":colorway},
        "sizes":{"type":"array","minItems":1,"maxItems":12,"items":{"type":"integer","minimum":16,"maximum":4096}}
    }
},
"primetech.typeface.package": {
    "required":["sourcePath"],
    "properties":{"sourcePath":string,"outputDir":string,"licenseText":{"type":"string","maxLength":20000},"specimenText":{"type":"string","maxLength":4000}}
},
"primetech.sprite-atlas.build": {
    "required":["framePaths"],
    "properties":{
        "framePaths":{"type":"array","minItems":1,"maxItems":256,"items":string},
        "outputDir":string,"columns":{"type":"integer","minimum":1,"maximum":32},
        "cellWidth":{"type":"integer","minimum":1,"maximum":4096},"cellHeight":{"type":"integer","minimum":1,"maximum":4096},
        "padding":{"type":"integer","minimum":0,"maximum":128},"fps":{"type":"integer","minimum":1,"maximum":60},"loop":{"type":"boolean"}
    }
},
"primetech.visuals.compare": {
    "required":["referencePath","renderedPath"],
    "properties":{
        "referencePath":string,"renderedPath":string,"outputDir":string,
        "pixelThreshold":{"type":"integer","minimum":1,"maximum":255},
        "maxMeanAbsoluteError":{"type":"number","minimum":0,"maximum":255},
        "maxChangedPixelRatio":{"type":"number","minimum":0,"maximum":1}
    }
},
"primetech.design-system.package": {
    "required":["tokensPath"],
    "properties":{"tokensPath":string,"outputDir":string,"projectName":{"type":"string","minLength":1,"maxLength":160}}
},
"primetech.assets.package": {
    "required":["assetPaths"],
    "properties":{
        "assetPaths":{"type":"array","minItems":1,"maxItems":512,"items":string},
        "outputDir":string,"packageName":{"type":"string","minLength":1,"maxLength":120}
    }
},
"primetech.ebook.package": {
    "required":["sourcePath"],
    "properties":{"sourcePath":string,"outputDir":string}
},
"primetech.production-board.manage": {
    "required":["action"],
    "properties":{
        "action":{"type":"string","enum":["create","get","list","begin","complete","fail","resume"]},
        "title":{"type":"string","minLength":1,"maxLength":160},
        "objective":{"type":"string","minLength":1,"maxLength":1200},
        "brief":{"type":"string","maxLength":12000},
        "projectId":{"type":["string","null"],"maxLength":160},
        "tags":{"type":"array","maxItems":32,"items":{"type":"string","maxLength":48}},
        "boardId":{"type":"string","pattern":"^ptb_[a-f0-9]{24}$"},
        "generationId":{"type":"string","minLength":1,"maxLength":160},
        "idempotencyKey":{"type":"string","minLength":1,"maxLength":200},
        "kind":{"type":"string","pattern":"^[a-z][a-z0-9_.-]{1,79}$"},
        "generationBrief":{"type":"string","minLength":1,"maxLength":8000},
        "prompt":{"type":"string","maxLength":12000},
        "sourceRefs":{"type":"array","maxItems":64,"items":{"type":"string","maxLength":1024}},
        "artifacts":{"type":"array","maxItems":256,"items":{"type":"object","additionalProperties":True}},
        "quality":{"type":"object","additionalProperties":True},
        "error":{"type":"object","required":["code"],"properties":{"code":{"type":"string","minLength":1,"maxLength":120},"message":{"type":"string","maxLength":1000}},"additionalProperties":False},
        "retryable":{"type":"boolean"},"expectedRevision":{"type":"integer","minimum":1}
    }
}
}
summaries = {
"primetech.icon-family.build":"Build a verified icon family from an approved SVG master with three shapes, eight colorways, raster sizes and source checksums.",
"primetech.typeface.package":"Validate Typeface Studio glyph geometry and produce a verified static TTF, source package and specimen.",
"primetech.sprite-atlas.build":"Pack ordered character or pet frames into a transparent sprite atlas with frame metadata and preview.",
"primetech.visuals.compare":"Compare reference and rendered images and write diff, overlay, metrics and evidence report.",
"primetech.design-system.package":"Validate design tokens, calculate contrast and package CSS variables and documentation.",
"primetech.assets.package":"Package approved creative assets with source hashes, metadata and delivery manifest.",
"primetech.ebook.package":"Build and validate an EPUB 3 archive with navigation, preview and source provenance.",
"primetech.production-board.manage":"Manage a revisioned creative production board and resumable generation receipts."
}
for operation, schema in schemas.items():
    directory = root / operation
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema":"inneranimalmedia.primetech.procedure.v1",
        "id":operation,
        "version":"1.0.0",
        "summary":summaries[operation],
        "effect":"project_write",
        "capabilities":[operation],
        "runtime":{"kind":"sam_operation","operation":operation},
        "input_schema":{"type":"object",**schema,"additionalProperties":False},
        "output_schema":output,
        "verification":{"kind":"output_schema"},
        "flags":{"network":False,"physical_hardware":False,"requires_operator_review":True}
    }
    (directory / "procedure.json").write_text(json.dumps(manifest,indent=2)+"\n")
print(json.dumps({"count":len(schemas),"procedures":list(schemas)},indent=2))
