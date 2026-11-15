#!/usr/bin/env python3
"""Private, resumable R2 backup of Local Studio's Mac intake gallery.

All indexed source media is retained by content hash; duplicate entries are aliases.
This tool never alters or deletes local originals and never enables public R2 access.
Run with operator-managed CF_ACCOUNT/R2 S3 credentials (not embedded in code).
"""
import argparse
import collections
import concurrent.futures
import datetime
import hashlib
import json
import mimetypes
import os
import re
import shutil
import pathlib
import sys
import tempfile
import threading

ROOT=pathlib.Path(__file__).resolve().parents[1]
INDEX=ROOT/"apps/local-studio/.local-media-intake/assets.json"
STATE=ROOT/"apps/local-studio/.local-media-intake/r2-private-backup"
BUCKET="media"
PREFIX="intake/backups/v1"
SCHEMA="inneranimal.local-media-backup.v1"

def client():
    import boto3
    from botocore.config import Config
    keys=("CLOUDFLARE_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY")
    absent=[k for k in keys if not os.getenv(k)]
    if absent:raise RuntimeError("Missing R2 operator environment variables: "+", ".join(absent))
    return boto3.client("s3",endpoint_url="https://"+os.environ["CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",config=Config(signature_version="s3v4",connect_timeout=8,read_timeout=30,
                                           retries={"max_attempts":5,"mode":"standard"}))

def sha256(p):
    h=hashlib.sha256()
    with open(p,"rb") as f:
        for block in iter(lambda:f.read(4*1024*1024),b""):h.update(block)
    return h.hexdigest()

def clean(s):return str(s).replace("\\","/")
def scan():
    j=json.loads(INDEX.read_text())
    assets=j.get("assets",[])
    entries=[]
    distinct={}
    missing=[]
    for i,a in enumerate(assets,1):
        path=pathlib.Path(a["_absolute_path"])
        if not path.is_file():
            missing.append(a.get("relative_path",str(path)))
            continue
        st=path.stat()
        if st.st_size!=a.get("size_bytes"):
            raise RuntimeError("Source changed size since index: "+str(path))
        digest=sha256(path)
        ext=path.suffix.lower()
        if not ext or len(ext)>10: ext=".bin"
        key=f"{PREFIX}/objects/sha256/{digest[:2]}/{digest}{ext}"
        if digest in distinct:
            key=distinct[digest]["key"]
        else:
            distinct[digest]={
                "sha256":digest,"key":key,"size":st.st_size,
                "contentType":a.get("content_type") or mimetypes.guess_type(path.name)[0] or "application/octet-stream",
                "_source":str(path)}
        entries.append({
            "sourceId":a.get("id"),"origin":a.get("origin",""),"relativePath":clean(a.get("relative_path","")),
            "filename":a.get("filename",path.name),"collection":a.get("collection","other"),
            "kind":a.get("media_kind","file"),"contentType":a.get("content_type"),
            "size":st.st_size,"sha256":digest,"objectKey":key})
    if missing:raise RuntimeError(str(len(missing))+" indexed sources no longer exist; first 5: "+str(missing[:5]))
    return j,entries,list(distinct.values())

def save_atomic(p,obj):
    p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix(p.suffix+".tmp")
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2))
    tmp.replace(p)

def put_json(s,key,obj):
    payload=json.dumps(obj,ensure_ascii=False,separators=(",",":"),sort_keys=True).encode()
    s.put_object(Bucket=BUCKET,Key=key,Body=payload,ContentType="application/json",
                 CacheControl="private, max-age=0, no-store")
    return len(payload)

def remote_verify(s,objects):
    failures=[]
    def verify(o):
        try:
            h=s.head_object(Bucket=BUCKET,Key=o["key"])
            return None if (h["ContentLength"]==o["size"] and
                            h.get("Metadata",{}).get("sha256")==o["sha256"]) else o["key"]+": HEAD mismatch"
        except Exception as e:return o["key"]+": "+str(e)[:180]
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for result in pool.map(verify,objects):
            if result:failures.append(result)
    return failures

def publish(s,j,entries,objects,workers):
    STATE.mkdir(parents=True,exist_ok=True)
    marker=STATE/"uploaded.json"
    try:done=json.loads(marker.read_text())
    except (OSError,ValueError):done={}
    done_lock=threading.Lock()
    def store(o):
        try:
            key=o["key"]
            if done.get(key)==o["sha256"]:
                return ("cached",key,None)
            try:
                head=s.head_object(Bucket=BUCKET,Key=key)
                if head["ContentLength"]==o["size"] and head.get("Metadata",{}).get("sha256")==o["sha256"]:
                    return ("already-exists",key,None)
            except s.exceptions.ClientError as e:
                if e.response.get("ResponseMetadata",{}).get("HTTPStatusCode")!=404: raise
            from boto3.s3.transfer import TransferConfig
            s.upload_file(o["_source"],BUCKET,key,ExtraArgs={
                "ContentType":o["contentType"],
                "CacheControl":"private, max-age=0, no-store",
                "Metadata":{"sha256":o["sha256"],"origin":"agentsam-local-media-intake"}},
                Config=TransferConfig(multipart_threshold=16*1024*1024,
                                      multipart_chunksize=16*1024*1024,
                                      max_concurrency=1,use_threads=False))
            return ("uploaded",key,None)
        except Exception as e:return ("failed",o["key"],str(e)[:220])
    uploaded=0;skipped=0;failures=[]
    print(f"PRIVATE_BACKUP_START unique={len(objects)} entries={len(entries)} bytes={sum(o['size'] for o in objects)} bucket={BUCKET}",flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for n,(status,key,error) in enumerate(pool.map(store,objects),1):
            if status=="failed":failures.append({"key":key,"error":error})
            else:
                with done_lock:done[key]=next(x["sha256"] for x in objects if x["key"]==key)
                if status=="uploaded":uploaded+=1
                else:skipped+=1
            if n%50==0 or n==len(objects):
                save_atomic(marker,done)
                print(f"BACKUP_PROGRESS {n}/{len(objects)} uploaded={uploaded} existing={skipped} failures={len(failures)}",flush=True)
    if failures:
        save_atomic(STATE/"errors.json",failures)
        raise RuntimeError(f"{len(failures)} upload errors; manifest withheld; first error: {failures[0]}")
    print("VERIFYING_ALL_OBJECTS",len(objects),flush=True)
    bad=remote_verify(s,objects)
    if bad:
        save_atomic(STATE/"verification-errors.json",bad)
        raise RuntimeError(f"{len(bad)} remote verification failures; manifest withheld; first: {bad[0]}")
    # Private manifest is published only after every unique object is verified.
    utc=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot_key=f"{PREFIX}/snapshots/{utc}.json"
    unique_bytes=sum(x["size"] for x in objects)
    stats={
        "schemaVersion":SCHEMA,"createdAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sourceIndexGeneratedAt":j.get("generated_at"),"bucket":BUCKET,
        "entryCount":len(entries),"uniqueObjects":len(objects),"uniqueBytes":unique_bytes,
        "sourceRawBytes":sum(x["size"] for x in entries),
        "collectionCounts":dict(collections.Counter(a["collection"] for a in entries)),
        "originCounts":dict(collections.Counter(a["origin"] for a in entries)),
        "visibility":"private (bucket has no public domain or r2.dev access)",
        "noLocalFilesDeleted":True}
    manifest={**stats,"entries":entries}
    put_json(s,snapshot_key,manifest)
    latest={**stats,"snapshotKey":snapshot_key}
    put_json(s,f"{PREFIX}/latest.json",latest)
    # Confirm cloud manifest present & matching.
    check=json.loads(s.get_object(Bucket=BUCKET,Key=snapshot_key)["Body"].read())
    assert len(check["entries"])==len(entries)
    save_atomic(STATE/"result.json",{**latest,"uploadedThisRun":uploaded,
                        "existingThisRun":skipped,"verifiedObjects":len(objects)})
    print("PRIVATE_BACKUP_VERIFIED",json.dumps({**latest,"uploaded":uploaded,"existing":skipped}),flush=True)
    return 0

def restore(s,destination,max_files=None):
    """Restore original paths into a new folder without deleting/overwriting files."""
    current=json.loads(s.get_object(Bucket=BUCKET,Key=f"{PREFIX}/latest.json")["Body"].read())
    manifest=json.loads(s.get_object(Bucket=BUCKET,Key=current["snapshotKey"])["Body"].read())
    base=pathlib.Path(destination).expanduser().resolve()
    base.mkdir(parents=True,exist_ok=True)
    restored=0
    preserved=0
    downloaded={}
    entries=manifest["entries"][:max_files] if max_files else manifest["entries"]
    for n,a in enumerate(entries,1):
        rel=pathlib.PurePosixPath(a["relativePath"])
        if rel.is_absolute() or not rel.parts or any(x in ("..",".") for x in rel.parts):
            raise RuntimeError("Unsafe path in remote manifest: "+a["relativePath"])
        folder=re.sub(r"[^a-z0-9]+","-",a["origin"].lower()).strip("-") or "unknown"
        target=base/folder/pathlib.Path(*rel.parts)
        if not target.resolve().is_relative_to(base):
            raise RuntimeError("Unsafe restore path: "+str(target))
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():
            if target.is_file() and target.stat().st_size==a["size"] and sha256(target)==a["sha256"]:
                preserved+=1
                continue
            raise RuntimeError("Restore target exists with different contents; refusing overwrite: "+str(target))
        temp=target.with_name(target.name+".r2-part")
        if a["sha256"] in downloaded:
            shutil.copyfile(downloaded[a["sha256"]],temp)
        else:
            s.download_file(BUCKET,a["objectKey"],str(temp))
        if temp.stat().st_size!=a["size"] or sha256(temp)!=a["sha256"]:
            temp.unlink(missing_ok=True)
            raise RuntimeError("Download integrity failed: "+str(target))
        temp.replace(target)
        downloaded[a["sha256"]]=target
        restored+=1
        if n%100==0 or n==len(entries):
            print(f"RESTORE_PROGRESS {n}/{len(entries)} restored={restored} existing_verified={preserved}",flush=True)
    print("RESTORE_VERIFIED",json.dumps({"restored":restored,"existingVerified":preserved,
        "destination":str(base),"entries":len(entries),"sourceSnapshot":current["snapshotKey"]}),flush=True)

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--publish",action="store_true")
    p.add_argument("--verify",action="store_true")
    p.add_argument("--restore-dir",help="Restore private R2 snapshot to a NEW local directory without overwriting files")
    p.add_argument("--restore-limit",type=int,help="Restore only first N entries for a small integrity check")
    p.add_argument("--workers",type=int,default=6)
    opts=p.parse_args()
    STATE.mkdir(parents=True,exist_ok=True)
    if opts.restore_dir:
        restore(client(),opts.restore_dir,opts.restore_limit)
        return 0
    if opts.verify:
        s=client()
        j=json.loads(s.get_object(Bucket=BUCKET,Key=f"{PREFIX}/latest.json")["Body"].read())
        x=json.loads(s.get_object(Bucket=BUCKET,Key=j["snapshotKey"])["Body"].read())
        distinct={a["sha256"]:{"key":a["objectKey"],"sha256":a["sha256"],"size":a["size"]} for a in x["entries"]}
        failed=remote_verify(s,list(distinct.values()))
        print("CLOUD_BACKUP_VERIFICATION",json.dumps({"entries":len(x["entries"]),"unique":len(distinct),
                    "failures":failed[:10]}),flush=True)
        return 1 if failed else 0
    j,entries,objects=scan()
    stats={"sourceIndexGeneratedAt":j.get("generated_at"),"entries":len(entries),
           "uniqueObjects":len(objects),"uniqueBytes":sum(x["size"] for x in objects),
           "sourceRawBytes":sum(x["size"] for x in entries),
           "collections":dict(collections.Counter(a["collection"] for a in entries)),
           "bucket":BUCKET,"prefix":PREFIX}
    save_atomic(STATE/"plan.json",stats)
    print("BACKUP_PLAN",json.dumps(stats),flush=True)
    if not opts.publish:return 0
    return publish(client(),j,entries,objects,opts.workers)

if __name__=="__main__":
    try:sys.exit(main())
    except Exception as e:print("PRIVATE_BACKUP_FAILED",repr(e),file=sys.stderr,flush=True);sys.exit(1)
