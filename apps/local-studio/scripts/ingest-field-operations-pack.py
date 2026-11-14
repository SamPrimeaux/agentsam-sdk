#!/usr/bin/env python3
"""Reproducible, local-only intake for the approved Field Operations companion pack.
Does not upload, deploy, or modify existing creative briefs outside four companion manifests.
Usage: python3 apps/local-studio/scripts/ingest-field-operations-pack.py [path-to-zip]
"""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / 'assets/brand/inneranimal-companions/v1'
ARCHIVE = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / 'Downloads/InnerAnimal-Field-Operations-v1.0.0.zip'
CHARACTERS = ('roux', 'bruneaux', 'nyra', 'toro')
STATES = ('idle', 'working', 'thinking', 'attention', 'success', 'signature', 'waiting', 'error', 'resting', 'blinking')
BASE = 'InnerAnimal-Field-Operations-v1.0.0/'

def apng_frames(data):
    i = 8
    while i + 12 <= len(data):
        size = int.from_bytes(data[i:i+4], 'big')
        kind = data[i+4:i+8]
        if kind == b'acTL':
            return int.from_bytes(data[i+8:i+12], 'big')
        i += size + 12
    return 0

with zipfile.ZipFile(ARCHIVE) as z:
    if z.testzip():
        raise RuntimeError('Damaged Field Operations archive')
    archive_sha = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
    for name in CHARACTERS:
        prefix = BASE + name + '/'
        source = json.loads(z.read(prefix + 'companion.json'))
        original = OUTPUT / name / 'companion.json'
        planned = json.loads(original.read_text())
        if source.get('id') != name or source.get('visualApproval') != 'approved' or len(source.get('states', {})) != 10:
            raise RuntimeError('Unapproved or incomplete package: ' + name)
        assets = [n for n in z.namelist() if n.startswith(prefix) and n.endswith('.png')]
        for n in assets:
            relative = n[len(prefix):]
            if not relative.startswith(('atlases/', 'avatars/', 'animations/', 'frames/')) or '..' in Path(relative).parts:
                raise RuntimeError('Unsafe input path: ' + n)
            target = OUTPUT / name / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(n))
        states = {}
        for state in STATES:
            block = source['states'][state]
            src = block['animation']
            encoded = (OUTPUT / name / src).read_bytes()
            if apng_frames(encoded) != 4:
                raise RuntimeError('Expected 4 APNG frames: ' + name + '/' + state)
            states[state] = {'src': src, 'frames': 4, 'fps': block['fps'], 'loop': block['loop']}
        for key in ('avatar', 'icon', 'portrait', 'atlas'):
            if not (OUTPUT / name / source[key]).exists():
                raise RuntimeError('Missing ' + key + ' for ' + name)
        planned.update({
            'version': source['version'],
            'status': 'production-review-candidate',
            'availability': 'preview',
            'assetStatus': 'runtime-ready',
            'sourcePackage': ARCHIVE.name,
            'sourceSha256': archive_sha,
            'frameSize': source['frameSize'],
            'frameCount': 40,
            'runtimeStateCount': 10,
            'animationFrameCount': 40,
            'structuralValidation': {'ok': True, 'errors': [], 'warnings': ['4-frame transparent APNG for each runtime state; independent character rigging is not certified.']},
            'atlas': source['atlas'],
            'avatar': source['avatar'],
            'icon': source['icon'],
            'portrait': source['portrait'],
            'states': states,
            'ingestNote': 'Imported, validated APNG runtime art from the approved Field Operations package. Local preview only until release approval.',
        })
        original.write_text(json.dumps(planned, indent=2, ensure_ascii=False) + '\n')
        meta_dir = OUTPUT / name / 'metadata'
        meta_dir.mkdir(exist_ok=True)
        (meta_dir / 'source-manifest-v1.0.0.json').write_text(json.dumps(source, indent=2, ensure_ascii=False) + '\n')
        print(f'{name}: {len(assets)} image assets; 10 validated APNGs; 40 frames; approved for local preview')
    print('Archive SHA256:', archive_sha)
