#!/usr/bin/env python3
"""Create a manifest and ZIP from the durable output directory."""
import hashlib,json,sys,zipfile
from pathlib import Path
def sha256(p):
 h=hashlib.sha256()
 with p.open("rb") as f:
  for c in iter(lambda:f.read(1024*1024),b""): h.update(c)
 return h.hexdigest()
def main():
 if len(sys.argv)!=2: raise SystemExit("usage: finalize_bundle.py output_dir")
 root=Path(sys.argv[1]).resolve(strict=True)
 manifest_path=root/"artifact-manifest.json"; bundle_path=root/"cam-motor-bearing-end-plate-bundle.zip"
 files=[]
 for p in sorted(root.rglob("*")):
  if not p.is_file(): continue
  rel=p.relative_to(root).as_posix()
  if p in (manifest_path,bundle_path) or rel.startswith(".") or p.name==".DS_Store": continue
  files.append({"path":rel,"bytes":p.stat().st_size,"sha256":sha256(p)})
 manifest={"schema":"inneranimalmedia.cam.artifact-manifest.v1","project_key":"cam-motor-bearing-end-plate-001","part_id":"motor-bearing-end-plate","revision":"candidate-150mm-001","design_status":"proposal_not_approved","storage_contract":{"primary":"Cloudflare R2","mirror":"external removable volume","manifest_lists":["path","bytes","sha256"]},"bundle":bundle_path.name,"files":files}
 manifest_path.write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 with zipfile.ZipFile(bundle_path,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for p in sorted(root.rglob("*")):
   if p.is_file() and p!=bundle_path and not p.relative_to(root).as_posix().startswith(".") and p.name!=".DS_Store": z.write(p,p.relative_to(root).as_posix())
 print(json.dumps({"ok":True,"file_count":len(files),"manifest":manifest_path.name,"bundle":bundle_path.name,"bundle_bytes":bundle_path.stat().st_size,"bundle_sha256":sha256(bundle_path)},sort_keys=True))
if __name__=="__main__": main()
