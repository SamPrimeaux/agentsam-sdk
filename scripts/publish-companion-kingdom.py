#!/usr/bin/env python3
"""Publish the user-owned InnerAnimal companion media collection to the public brand R2 bucket.

Source of truth is the existing companion catalog plus the local media intake index.
Does not publish arbitrary Downloads, unreviewed personal photos, or customer screenshots.
Assets are immutable/content-addressed; latest.json is updated only after verified success.
"""
import argparse
import collections
import concurrent.futures as futures
import datetime as dt
import hashlib
import json
import mimetypes
import os
import re
import sys
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V1 = ROOT / "assets/brand/inneranimal-companions/v1"
INTAKE = ROOT / "apps/local-studio/.local-media-intake/assets.json"
OUT = ROOT / "apps/local-studio/.local-media-intake/kingdom-publication"
BUCKET = "brand"
ORIGIN = "https://brand.inneranimalmedia.com"
PREFIX = "companions/kingdom/v1"
CHARACTERS = set()
MIME_OVERRIDES = {".glb": "model/gltf-binary", ".webp": "image/webp",
                  ".svg": "image/svg+xml", ".avif": "image/avif", ".apng": "image/apng",
                  ".gif": "image/gif", ".usdz": "model/vnd.usdz+zip"}
ALLOWED = {".png", ".apng", ".jpg", ".jpeg", ".svg", ".webp", ".avif",
           ".gif", ".ico", ".icns", ".glb", ".gltf", ".mov", ".mp4", ".webm"}
BAD_SUBSTRINGS = ("/meauxchessaudit-", "/fnf-cms", "bella-old-selfie", "geauxxx",
                  "inneranimalmedia-wireframe", "/customer-", "pricing", "dashboard",
                  "proof_top_", "proof_beauty_")
STATES = ("idle", "thinking", "working", "success", "error", "waiting", "blinking",
          "resting", "attention", "signature", "listening", "sleeping", "happy",
          "asking", "curious", "attentive", "welcome", "alert", "head-tilt")
def slug(s):
    s = re.sub(r"[^a-z0-9_-]+", "-", str(s).lower())
    return re.sub(r"-+", "-", s).strip("-") or "untitled"
def sha_file(p):
    h = hashlib.sha256()
    with open(p,"rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""): h.update(b)
    return h.hexdigest()
def is_media(p):
    return p.suffix.lower() in ALLOWED or (p.suffix == "" and p.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n")
def kind_of(p):
    ext=p.suffix.lower()
    if ext in (".glb", ".gltf"): return "model"
    if ext in (".mov", ".mp4", ".webm"): return "video"
    return "image"
def classify(a):
    origin=a.get("origin","")
    rel=a["relative_path"].replace("\\","/")
    low=rel.lower()
    if any(b in "/"+low for b in BAD_SUBSTRINGS): return None
    if a.get("origin")=="Curated companion archive":
        parts=[p.lower() for p in Path(rel).parts]
        family=next((p for p in parts if p in ("animations","frames","atlases","avatars","previews","icons","reference","artwork","hero","archetypes","concepts","motions","sprite")),"archive-art")
        return (a["archive_character"],"edition-"+family,"legacy" if a["archive_character"]!="kingdom-story" else "story")
    if low.startswith("inneranimal-companions/v1/"):
        parts=rel.split("/")
        if len(parts) > 3 and parts[2] in CHARACTERS:
            return (parts[2], parts[3] if len(parts)>4 else "assets", "canon")
    if "agentsam-gorilla/" in low: return ("studio-gorilla", "studio-ui", "legacy")
    if "agentsam_gorilla_character_kit_v1/" in low: return ("legacy-gorilla", "character-kit", "legacy")
    for name in ("geaux","meaux","bella","roux","bruneaux","nyra","toro","coder","architect","engineer","py"):
        # Explicit companion production boards and source naming only.
        if low.startswith("ia-companion-"+name+"-") or low.startswith("ia-field-operations-"+name+"-"):
            return (name,"storyboards","concept")
    if "ia-field-operations-four-companion" in low: return ("field-operations","storyboards","concept")
    for animal,char in (("bear","bruneaux"),("bull","toro"),("wolf","roux"),("panther","nyra")):
        if "ia-archetype-"+animal+"-badge" in low: return (char,"archetype","concept")
    if low.endswith("meaux-robot.glb"): return ("meaux","models","concept")
    if "spritesheet" in low and "pet_" in low: return ("unassigned-pet-art","explorations","concept")
    if low == "geaux-12pt.png": return ("geaux","brand-references","concept")
    if low.endswith("3d gorrilla:meaux.png"): return ("meaux","concepts","concept")
    if "meauxstack" in low and origin in ("Archived brand kit previews","Mac Downloads"):
        return ("meaux","scenes","concept")
    if "primetechpy-companion-concept" in low: return ("py","concepts","concept")
    if low.startswith("ia-companion-"): return ("story-unassigned","storyboards","concept")
    if "media-kit/outputs/dispatch/sprite-sheet.png" in low:
        return ("legacy-gorilla","explorations","concept")
    return None
def archive_candidates():
    """Retain every distinct visual edition from the curated companion release archives."""
    downloads=Path.home()/"Downloads"
    archived=[]
    roots=[downloads,downloads/"07_archives/inneranimal"]
    seen=set()
    for root in roots:
        for path in sorted(root.glob("InnerAnimal-*.zip")):
            name=path.name
            if " (1)" in name or name in seen: continue
            seen.add(name)
            match=re.fullmatch(r"InnerAnimal-(Geaux|Meaux|Coder|Architect|Engineer|Py|Bella|Field-Operations|Explore-Wave1-Creative-Assets)-v([0-9.]+)\.zip", name,flags=re.I)
            if not match: continue
            label, version=match.group(1).lower(), match.group(2)
            edition=slug(label)+"-v"+version.replace(".","-")
            with zipfile.ZipFile(path) as archive:
                for member in archive.infolist():
                    if member.is_dir() or member.file_size > 35_000_000:continue
                    inner=Path(member.filename)
                    if inner.is_absolute() or ".." in inner.parts:continue
                    if inner.suffix.lower() not in ALLOWED:continue
                    character=label
                    if label=="field-operations":
                        character=next((ch for ch in ("roux","bruneaux","nyra","toro") if ch in (p.lower() for p in inner.parts)),"field-operations")
                    elif label=="explore-wave1-creative-assets":character="kingdom-story"
                    destination=OUT/"archive-extracted"/edition/inner
                    if not destination.exists() or destination.stat().st_size!=member.file_size:
                        destination.parent.mkdir(parents=True,exist_ok=True)
                        with archive.open(member) as inp,open(destination,"wb") as out:shutil.copyfileobj(inp,out)
                    archived.append({"_absolute_path":str(destination),
                                     "origin":"Curated companion archive",
                                     "relative_path":"archives/"+edition+"/"+inner.as_posix(),
                                     "archive_character":character,
                                     "archive_edition":edition,"collection":"companions"})
    return archived

def build(existing_assets=None):
    catalog=json.loads((V1/"catalog.json").read_text())
    CHARACTERS.update(c["id"] for c in catalog["companions"])
    index=json.loads(INTAKE.read_text())
    intake=index["assets"]
    by_sha={}
    skipped=collections.Counter()
    source_counts=collections.Counter()
    # Canonical first: never prefer a duplicated staging file over source.
    candidates=[]
    for p in sorted(V1.rglob("*")):
        if p.is_file() and is_media(p):
            relative=p.relative_to(ROOT/"assets/brand").as_posix()
            a={"_absolute_path":str(p),"relative_path":relative,
               "origin":"Companion & brand source","collection":"companions"}
            candidates.append(a)
    # Curated archive editions preserve historic sprites, animated GIFs and story artwork.
    candidates.extend(archive_candidates())
    # The local intake contains legacy kits, associated mascot art, and concept boards.
    for a in sorted(intake, key=lambda a:({"Companion & brand source":0,
                                            "Archived brand kit previews":1,
                                            "Studio public brand":2,
                                            "CMS brand media":3,
                                            "Mac Downloads":4}.get(a.get("origin"),5),
                                           a.get("relative_path",""))):
        if a.get("collection")!="companions" and not any((
                a.get("relative_path","").lower().startswith("agentsam-gorilla/"),
                a.get("relative_path","").lower().endswith("meaux-robot.glb"),
                "meauxstack" in a.get("relative_path","").lower(),
                "ia-archetype-" in a.get("relative_path","").lower(),
                a.get("relative_path","").lower() in ("geaux-12pt.png","inneranimal-ia/3d gorrilla:meaux.png"))):
            skipped["not-companion"]+=1
            continue
        candidates.append(a)
    for a in candidates:
        p=Path(a["_absolute_path"])
        if not p.is_file(): skipped["missing"]+=1;continue
        if not is_media(p): skipped["non-media-or-archive"]+=1;continue
        info=classify(a)
        if not info: skipped["unrelated-or-ambiguous"]+=1;continue
        owner,family,classification=info
        digest=sha_file(p)
        if digest in by_sha:
            existing=by_sha[digest]
            alias={"origin":a["origin"],"relativePath":a["relative_path"]}
            if alias not in existing["sourceAliases"]: existing["sourceAliases"].append(alias)
            if owner not in existing["relatedCharacterIds"]: existing["relatedCharacterIds"].append(owner)
            skipped["exact-duplicates"]+=1
            continue
        try:
            from PIL import Image
            if kind_of(p)=="image" and p.suffix.lower() not in (".svg",".ico",".icns"):
                with Image.open(p) as im:
                    dims={"width":im.width,"height":im.height}
                    if getattr(im,"n_frames",1)>1:dims["imageFrames"]=im.n_frames
            else:dims={}
        except Exception: dims={}
        suffix=p.suffix.lower() or ".png"
        mime=MIME_OVERRIDES.get(suffix,mimetypes.guess_type(p.name)[0] or "application/octet-stream")
        stem=slug(p.stem if p.suffix else p.name)
        short=digest[:12]
        key=f"{PREFIX}/characters/{slug(owner)}/{slug(family)}/{stem}.{short}{suffix}"
        state=next((s for s in STATES if re.search(r"(^|[-_/])"+re.escape(s)+r"($|[-_/])", p.stem.lower())),None)
        by_sha[digest]={
           "id":"sha256:"+digest,"characterId":owner,"relatedCharacterIds":[owner],
           "family":family,"classification":classification,"state":state,
           "name":p.name,"type":kind_of(p),"contentType":mime,"bytes":p.stat().st_size,
           "sha256":digest,"objectKey":key,"publicUrl":ORIGIN+"/"+key,
           "dimensions":dims,"edition":a.get("archive_edition"),"sourceAliases":[{"origin":a["origin"],"relativePath":a["relative_path"]}],
           "_upload_path":str(p)
        }
        source_counts[owner]+=1
    # Cloud is the durable archive of past public editions. Re-publishing on a
    # different machine never removes historic objects missing from its Downloads.
    cloud_only=0
    for old in existing_assets or []:
        digest=old.get("sha256")
        if not digest: continue
        if digest in by_sha:
            current=by_sha[digest]
            current["objectKey"]=old["objectKey"]
            current["publicUrl"]=old["publicUrl"]
            if not current.get("edition"):current["edition"]=old.get("edition")
            for key in ("sourceAliases","relatedCharacterIds"):
                for item in old.get(key,[]):
                    if item not in current[key]:current[key].append(item)
        else:
            by_sha[digest]={**old,"_upload_path":None}
            cloud_only+=1
            source_counts[old.get("characterId","unassigned")]+=1
    assets=sorted(by_sha.values(),key=lambda x:(x["characterId"],x["family"],x["name"],x["sha256"]))
    now=dt.datetime.now(dt.timezone.utc).isoformat()
    public_assets=[{k:v for k,v in a.items() if k!="_upload_path"} for a in assets]
    by_id=collections.defaultdict(list)
    for a in public_assets:
        for owner in a["relatedCharacterIds"]:
            by_id[owner].append(a)
    habitat_docs=[]
    for h in catalog["habitats"]:
        ids=h["companionIds"]
        doc={**h,"assetCount":len({a["sha256"] for c in ids for a in by_id.get(c,[])}),
             "characters":[{"id":c,"assetCount":len(by_id.get(c,[]))} for c in ids],
             "schemaVersion":"inneranimal.companion-habitat.v1"}
        habitat_docs.append(doc)
    master={
       "schemaVersion":"inneranimal.companion-kingdom.v1","generatedAt":now,
       "visibility":"public","rights":"InnerAnimalMedia proprietary brand assets; public view access is not a reuse license",
       "bucket":BUCKET,"publicBaseUrl":ORIGIN+"/"+PREFIX,"exploreUrl":ORIGIN+"/"+PREFIX+"/explore.html",
       "sourceCatalogVersion":catalog.get("schemaVersion"),"characterCount":len(catalog["companions"]),
       "uniqueMediaCount":len(public_assets),"totalBytes":sum(a["bytes"] for a in assets),
       "characters":catalog["companions"],"habitats":habitat_docs,
       "duoDynamics":catalog.get("duoDynamics",[]),"onboarding":catalog.get("onboarding",{}),
       "milestoneUnlocks":catalog.get("milestoneUnlocks",[]),
       "costumePacks":catalog.get("costumePacks",[]),
       "assetIndexUrl":ORIGIN+"/"+PREFIX+"/assets.json",
       "note":"Character art status follows the canonical catalog; planned species do not imply runtime art."
    }
    deliver={
      PREFIX+"/assets.json":public_assets,
      PREFIX+"/index.json":master,
      PREFIX+"/catalog-source.json":catalog
    }
    source_metadata=[]
    for p in sorted(V1.rglob("*.json")):
        if p.name=="catalog.json": continue
        relative=p.relative_to(V1).as_posix()
        try: body=json.loads(p.read_text())
        except ValueError: continue
        key=f"{PREFIX}/source-metadata/{relative}"
        deliver[key]=body
        source_metadata.append({"path":relative,"url":ORIGIN+"/"+key})
    master["sourceMetadata"] = source_metadata
    for h in habitat_docs:deliver[f'{PREFIX}/habitats/{h["id"]}/index.json']=h
    for c in catalog["companions"]:
        deliver[f'{PREFIX}/characters/{c["id"]}/index.json']={
            "schemaVersion":"inneranimal.companion.v1","character":c,"assets":by_id.get(c["id"],[]),
            "habitatIds":c.get("habitatIds",[]),"public":True}
    for owner,group in by_id.items():
        if owner not in CHARACTERS:
            deliver[f'{PREFIX}/lineages/{owner}/index.json']={
              "schemaVersion":"inneranimal.companion-lineage.v1","id":owner,
              "classification":"archive or concept; not a runtime selectable character",
              "assets":group,"public":True}
    summary={"generatedAt":now,"intakeRecords":len(intake),
        "intakeCompanionRecords":sum(a.get("collection")=="companions" for a in intake),
        "uniquePublicMedia":len(assets),"cloudOnlyPreserved":cloud_only,"mediaBytes":sum(a["bytes"] for a in assets),
        "byCharacter":dict(source_counts),"skipped":dict(skipped),
        "metadataObjects":len(deliver),
        "releasePrefix":PREFIX,"targetBucket":BUCKET}
    return assets,deliver,summary
def client():
    import boto3
    from botocore.config import Config
    for name in ("CLOUDFLARE_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY"):
        if not os.environ.get(name): raise RuntimeError("missing "+name+" in operator environment")
    return boto3.client("s3",
        endpoint_url="https://"+os.environ["CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",
        region_name="auto",aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4",retries={"max_attempts":4,"mode":"standard"},
                      connect_timeout=8,read_timeout=20))
def publish(args,deliver,summary):
    import botocore
    s=client()
    state_path=OUT/"published-sha256.json"
    try:done=json.loads(state_path.read_text())
    except (OSError, ValueError):done={}
    failed=[]
    ok=0
    def push(a):
        key=a["objectKey"]
        if done.get(key)==a["sha256"]: return "cached",key,None
        if a.get("_upload_path") is None:
            try:
                head=s.head_object(Bucket=BUCKET,Key=key)
                if head["ContentLength"]==a["bytes"]:return "preserved",key,None
                return "failed",key,"R2 historic object size mismatch"
            except Exception as e:return "failed",key,"R2 historic object unavailable: "+str(e)[:180]
        try:
            with open(a["_upload_path"],"rb") as f:
                s.put_object(Bucket=BUCKET,Key=key,Body=f,ContentType=a["contentType"],
                             CacheControl="public, max-age=31536000, immutable",
                             Metadata={"sha256":a["sha256"],"character":slug(a["characterId"]),
                                       "family":slug(a["family"])})
            return "uploaded",key,None
        except Exception as e:return "failed",key,str(e)[:240]
    print("publishing",len(args),"media to",BUCKET,PREFIX,flush=True)
    with futures.ThreadPoolExecutor(max_workers=8) as pool:
        for i,(status,key,error) in enumerate(pool.map(push,args),1):
            if status=="failed":failed.append((key,error))
            else:
                ok+=1
                if status=="uploaded":
                    done[key]=next(a["sha256"] for a in args if a["objectKey"]==key)
            if i%50==0 or i==len(args):
                state_path.write_text(json.dumps(done,indent=2))
                print(f"progress {i}/{len(args)} success={ok} failed={len(failed)}",flush=True)
    if failed:
        (OUT/"errors.json").write_text(json.dumps(failed,indent=2))
        print("media failures; index not published",failed[:6],flush=True)
        return 1
    # All media succeeded; only now publish discoverable metadata.
    for key,body in sorted(deliver.items(),key=lambda k:k[0].endswith("/index.json")):
        payload=json.dumps(body,ensure_ascii=False,separators=(",",":"),sort_keys=True).encode()
        s.put_object(Bucket=BUCKET,Key=key,Body=payload,ContentType="application/json",
                     CacheControl="public, max-age=120")
    explorer=V1/"explore.html"
    if explorer.exists():
        s.put_object(Bucket=BUCKET,Key=PREFIX+"/explore.html",Body=explorer.read_bytes(),
                     ContentType="text/html; charset=utf-8",CacheControl="public, max-age=120")
    latest={"schemaVersion":"inneranimal.companion-kingdom-pointer.v1",
            "version":"v1","url":ORIGIN+"/"+PREFIX+"/index.json",
            "assetsUrl":ORIGIN+"/"+PREFIX+"/assets.json","exploreUrl":ORIGIN+"/"+PREFIX+"/explore.html",
            "generatedAt":summary["generatedAt"],"mediaCount":summary["uniquePublicMedia"]}
    s.put_object(Bucket=BUCKET,Key="companions/kingdom/latest.json",
                 Body=json.dumps(latest,indent=2).encode(),ContentType="application/json",
                 CacheControl="public, max-age=60")
    # Verify private R2 HEADs and public HTTPS independently.
    sample=args[0::max(1,len(args)//8)][:8]
    verified=[]
    for a in sample:
        head=s.head_object(Bucket=BUCKET,Key=a["objectKey"])
        if head["ContentLength"]!=a["bytes"]:raise RuntimeError("bad upload size "+a["objectKey"])
        verified.append(a["objectKey"])
    import subprocess
    for url in [ORIGIN+"/"+PREFIX+"/index.json",ORIGIN+"/companions/kingdom/latest.json",sample[0]["publicUrl"]]:
        response=subprocess.run(["curl","-sSIL","--max-time","12","-o","/dev/null","-w","%{http_code}",url],
                                capture_output=True,text=True,timeout=15)
        if response.returncode or response.stdout.strip()!="200":
            raise RuntimeError(f"public URL not readable {url}: {response.stdout.strip()} {response.stderr[:160]}")
    summary["published"]=True
    summary["verifiedSampleKeys"]=verified
    summary["indexUrl"]=ORIGIN+"/"+PREFIX+"/index.json"
    summary["assetIndexUrl"]=ORIGIN+"/"+PREFIX+"/assets.json"
    summary["latestUrl"]=ORIGIN+"/companions/kingdom/latest.json"
    (OUT/"result.json").write_text(json.dumps(summary,indent=2))
    print("PUBLICATION_OK",json.dumps(summary,indent=2),flush=True)
    return 0
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--publish",action="store_true")
    opts=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    existing=None
    if opts.publish:
        s=client()
        try:
            existing=json.loads(s.get_object(Bucket=BUCKET,Key=PREFIX+"/assets.json")["Body"].read())
        except s.exceptions.NoSuchKey:
            existing=[]
    assets,deliver,summary=build(existing)
    (OUT/"plan.json").write_text(json.dumps(summary,indent=2))
    (OUT/"assets.json").write_text(json.dumps([{k:v for k,v in a.items() if k!="_upload_path"} for a in assets],indent=2))
    print("KINGDOM_DRY_RUN" if not opts.publish else "KINGDOM_PUBLISH_PLAN",json.dumps(summary,indent=2),flush=True)
    if opts.publish: return publish(assets,deliver,summary)
    return 0
if __name__=="__main__":sys.exit(main())
