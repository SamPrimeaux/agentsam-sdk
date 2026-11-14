#!/usr/bin/env python3
"""Extract *media only* from selected user-created brand archives into an ignored private preview cache.
No source archives are modified; no archive metadata, executable contents or nested ZIPs are extracted.
"""
import hashlib
import json
import shutil
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, BadZipFile

APP = Path(__file__).resolve().parents[1]
DOWNLOADS = Path.home() / 'Downloads'
CACHE = APP / '.local-media-intake' / 'archive-previews'
ARCHIVES = [
    'InnerAnimal-Explore-Wave1-Creative-Assets-v1.0.0.zip',
    'InnerAnimal-IA-Crisp-BrandMark-Kit.zip',
    'InnerAnimalMedia-Media-Pipeline-Kit.zip',
    'InnerAnimalMedia-Signature-Kit.zip',
    'ia-cloud-exports.zip',
    'inneranimalmedia-asset-intake-2026-11-13.zip',
]
MEDIA = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.icns',
         '.mp4', '.mov', '.m4v', '.webm', '.glb', '.gltf', '.stl', '.obj', '.fbx', '.usdz'}
MAX_FILE_BYTES = 36 * 1024 * 1024
MAX_TOTAL_BYTES = 240 * 1024 * 1024

def safe_path(name):
    path = PurePosixPath(name)
    return (not path.is_absolute() and not any(p in ('.', '..') for p in path.parts)
            and len(path.parts) <= 12 and path.suffix.lower() in MEDIA)

CACHE.mkdir(parents=True, exist_ok=True)
results = []
consumed = 0
for name in ARCHIVES:
    archive = DOWNLOADS / name
    if not archive.is_file():
        continue
    slug = archive.stem
    destination = CACHE / slug
    # All cache contents are regenerated to prevent stale previews after source changes.
    shutil.rmtree(destination, ignore_errors=True)
    destination.mkdir(parents=True, exist_ok=True)
    selected = []
    try:
        with ZipFile(archive) as source:
            for info in source.infolist():
                if info.is_dir() or not safe_path(info.filename):
                    continue
                if not 0 < info.file_size <= MAX_FILE_BYTES:
                    continue
                if consumed + info.file_size > MAX_TOTAL_BYTES:
                    raise RuntimeError('Local archive media preview size budget reached')
                path = destination.joinpath(*PurePosixPath(info.filename).parts)
                path.parent.mkdir(parents=True, exist_ok=True)
                # Enforce size again while decoding, to avoid malicious zip headers.
                with source.open(info) as contents, path.open('wb') as output:
                    remaining = MAX_FILE_BYTES
                    while chunk := contents.read(min(1024 * 1024, remaining + 1)):
                        remaining -= len(chunk)
                        if remaining < 0:
                            path.unlink(missing_ok=True)
                            raise RuntimeError('Archive file exceeded allowed preview size')
                        output.write(chunk)
                consumed += info.file_size
                selected.append(info.filename)
    except BadZipFile:
        shutil.rmtree(destination, ignore_errors=True)
        results.append({'archive': name, 'status': 'invalid_zip'})
        continue
    results.append({'archive': name, 'status': 'local_preview', 'media_files': len(selected),
                    'original_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()})
    print(f'[archive-preview] {name}: {len(selected)} media files')
report = {'version': 1, 'source': 'Mac Downloads', 'cache': 'private-ignore',
          'media_preview_bytes': consumed, 'archives': results}
(CACHE / '_provenance.json').write_text(json.dumps(report, indent=2) + '\n')
print('[archive-preview] total',sum(x.get('media_files',0) for x in results),'media previews,',round(consumed/1048576,1),'MB; source ZIPs unchanged')
