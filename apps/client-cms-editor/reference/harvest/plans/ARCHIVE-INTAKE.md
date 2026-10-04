# Archive Intake / Shopify Salvage

The harvest workflow accepts historical website/theme material as first-class donor input.

Supported intake:
- directory
- .zip
- .tar
- .tar.gz / .tgz
- single-file .gz
- Git .bundle

Primary command:

```bash
python3 scripts/harvest_archive.py \
  ~/Downloads/old-shopify-theme.zip \
  ~/Backups/site-backup.tar.gz \
  ~/Backups/old-site.bundle
```

macOS drag/drop into Terminal works because the CLI accepts one or many ordinary filesystem paths.

## Safety

Every source is unpacked into a quarantine directory beneath the harvest export.

The extractor:
- rejects absolute and parent-traversal archive paths,
- refuses archive symlinks/hardlinks/special files,
- limits file count,
- limits total unpacked bytes,
- skips build/cache junk by default,
- never executes code from an archive,
- never installs dependencies,
- never deploys/uploads/syncs.

Default limits:
- 50,000 entries
- 2 GiB unpacked bytes

Override only deliberately.

## Shopify detection

The scanner looks for the canonical theme directories:
- layout
- sections
- snippets
- templates
- config
- locales
- assets

It also scores theme markers such as layout/theme.liquid and config/settings_schema.json.

When a theme is detected, it creates:

`packages/shopify-theme.zip`

The canonical Shopify folders are placed directly at the ZIP root instead of nesting the original backup directory.

## Custom HTML salvage

Loose .html/.htm files are recorded as donor candidates.

A separate:
`packages/custom-html-liquid-salvage.zip`

is emitted when custom HTML/Liquid donor material is found, so favorite historical sections can be repurposed without pretending they are already normalized CMS blocks.

## Compact archival output

Every intake emits:
`packages/normalized-source.tar.gz`

This is the preferred compact archival artifact for object storage.

Optional:
`--emit-zip`

also creates:
`packages/normalized-source.zip`

Avoid creating every format for every artifact by default. Redundant ZIP + TAR + raw image copies are exactly how R2 archives become unnecessarily bloated.

## Git bundle

For a Git .bundle input, or a direct Git repository folder, the workflow can emit:
`packages/repository.bundle`

A Git bundle is preferred over zipping .git because it preserves repository history in a purpose-built portable format.

## SQLite integration

If:
`<out>/local/inneranimals-cms.sqlite`

already exists, archive intake records:
- ingest
- every extracted file hash/size/category
- produced package hashes/sizes

into local archive_* tables.

This remains local provenance and does not make the historical archive production authority.

## Expected storage pattern

For R2 later, prefer storing:
- one compact normalized-source.tar.gz for archival recovery,
- one ARCHIVE_MANIFEST.json for cheap inspection/search,
- shopify-theme.zip only when Shopify interoperability matters,
- repository.bundle only when Git history matters,
- optimized media once in canonical asset storage instead of repeated inside many packages.

No R2 upload is performed by this script.

## One-shot tooling lab with dragged archives

The full AgentSam acceptance lab now accepts archive paths positionally:

```bash
python3 scripts/harvest_tooling_lab.py \
  --sdk repo://agentsam-sdk \
  --replace-export \
  --replace-db \
  ~/Downloads/theme-one.zip \
  ~/Backups/old-site.bundle \
  ~/Backups/host-backup.tar.gz
```

This runs donor harvest -> local CMS SQLite -> archive intake -> AgentSam safe probes in one command.

Use `--emit-zip` on `harvest_archive.py` only when a general ZIP is actually useful. Use `--emit-tar` only for tools that specifically require an uncompressed tar. The compact default remains `normalized-source.tar.gz`.
