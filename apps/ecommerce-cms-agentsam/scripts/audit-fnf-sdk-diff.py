#!/usr/bin/env python3
"""Read-only SHA-256 divergence audit of portable ecommerce CMS directories."""
import argparse,collections,hashlib,json,pathlib,subprocess
SKIP={"node_modules","dist","build",".git",".wrangler",".next"}
def scan(path):
 out={}
 for p in sorted(path.rglob("*")):
  if not p.is_file() or any(v in SKIP for v in p.relative_to(path).parts):continue
  try:out[p.relative_to(path).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
  except OSError:continue
 return out
def main():
 ap=argparse.ArgumentParser()
 ap.add_argument("--fnf",required=True,type=pathlib.Path)
 ap.add_argument("--sdk",required=True,type=pathlib.Path)
 ap.add_argument("--out",required=True,type=pathlib.Path)
 args=ap.parse_args()
 a,b=scan(args.fnf),scan(args.sdk)
 k1,k2=set(a),set(b)
 grouped={}
 for group in sorted({k.split("/")[0] for k in k1|k2}):
  grouped[group]={"fnf_only":sum(k.split("/")[0]==group for k in k1-k2),"sdk_only":sum(k.split("/")[0]==group for k in k2-k1),"changed":sum(k.split("/")[0]==group and a[k]!=b[k] for k in k1&k2),"same":sum(k.split("/")[0]==group and a[k]==b[k] for k in k1&k2)}
 result={"scope":{"fnf":str(args.fnf),"sdk":str(args.sdk)},"summary":{"fnf":len(a),"sdk":len(b),"fnf_only":len(k1-k2),"sdk_only":len(k2-k1),"changed":sum(a[k]!=b[k] for k in k1&k2),"same":sum(a[k]==b[k] for k in k1&k2)},"groups":grouped,"files":{"fnf_only":sorted(k1-k2),"sdk_only":sorted(k2-k1),"changed":sorted(k for k in k1&k2 if a[k]!=b[k])}}
 args.out.parent.mkdir(parents=True,exist_ok=True)
 args.out.write_text(json.dumps(result,indent=2)+"\n")
 print(json.dumps(result["summary"]))
if __name__=="__main__":main()
