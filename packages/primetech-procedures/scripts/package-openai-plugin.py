#!/usr/bin/env python3
"""Build the existing PrimeTech Design Studio OpenAI plugin archive from canonical package skills."""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path


def main() -> int:
    package_root = Path(__file__).resolve().parents[1]
    repo_root = package_root.parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=repo_root / 'primetech-design-studio-0.3.0.zip')
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    if output == package_root or package_root in output.parents:
        raise SystemExit('Output archive must be outside the npm package directory.')

    plugin = json.loads((package_root / 'plugin.json').read_text())
    codex = json.loads((package_root / '.codex-plugin' / 'plugin.json').read_text())
    interface = plugin['extensions']['com.openai']['interface']
    if plugin['name'] != 'primetech-design-studio' or codex['name'] != plugin['name']:
        raise SystemExit('Plugin identity mismatch; refusing to build an update archive.')
    if codex['version'] != plugin['version']:
        raise SystemExit('OpenAI and Codex plugin versions do not match.')
    if interface['category'] != 'Creativity' or len(interface['shortDescription']) > 30:
        raise SystemExit('OpenAI listing metadata does not satisfy the listing constraints.')

    skill_dirs = sorted(p for p in (package_root / 'skills').iterdir() if p.is_dir() and (p / 'SKILL.md').is_file())
    if len(skill_dirs) != 9:
        raise SystemExit(f'Expected exactly nine canonical skills, found {len(skill_dirs)}.')
    names: set[str] = set()
    files: list[tuple[Path, str]] = []

    def add(source: Path, archive_path: str) -> None:
        if not source.is_file():
            raise SystemExit(f'Missing plugin source file: {source}')
        files.append((source, archive_path))

    add(package_root / 'plugin.json', 'plugin.json')
    add(package_root / '.codex-plugin' / 'plugin.json', '.codex-plugin/plugin.json')
    add(package_root / 'agents' / 'openai.yaml', 'agents/openai.yaml')
    add(package_root / 'companion.json', 'companion.json')
    add(package_root / 'assets' / 'architect-icon.svg', 'assets/architect-icon.svg')
    add(package_root / 'assets' / 'primetech-design-studio.svg', 'assets/primetech-design-studio.svg')
    add(package_root / 'plugin.README.md', 'README.md')

    for skill_dir in skill_dirs:
        skill_file = skill_dir / 'SKILL.md'
        content = skill_file.read_text()
        frontmatter = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, flags=re.S)
        if not frontmatter:
            raise SystemExit(f'Missing YAML frontmatter: {skill_file}')
        name = re.search(r'^name:\s*(.+?)\s*$', frontmatter.group(1), flags=re.M)
        description = re.search(r'^description:\s*(.+?)\s*$', frontmatter.group(1), flags=re.M)
        if not name or not description or not name.group(1).strip() or not description.group(1).strip():
            raise SystemExit(f'Skill requires non-empty name and description: {skill_file}')
        normalized_name = name.group(1).strip().strip('"\'')
        if normalized_name in names:
            raise SystemExit(f'Duplicate skill name: {normalized_name}')
        names.add(normalized_name)
        add(skill_file, f'skills/{skill_dir.name}/SKILL.md')
        # Preserve any future skill references/support files, but omit AgentSam-only manifests.
        for child in sorted(skill_dir.rglob('*')):
            if child.is_file() and child.name != 'agentsam.skill.json' and child != skill_file:
                add(child, child.relative_to(package_root).as_posix())

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source, relative in files:
            archive.write(source, f"{plugin['name']}/{relative}")

    print(json.dumps({
        'ok': True,
        'plugin': plugin['name'],
        'display_name': interface['displayName'],
        'version': plugin['version'],
        'skills': len(skill_dirs),
        'files': len(files),
        'archive': str(output),
        'bytes': output.stat().st_size,
        'remote_mcp': False,
        'private_plugin_update_archive': True,
        'uploaded': False
    }, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
