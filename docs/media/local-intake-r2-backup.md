# Local Studio intake — private R2 media backup

The localhost `/media` **Mac intake** is a local-preview index, not a remote media provider. The application also offers its existing `R2 buckets` provider view.

## Storage separation

- **Public companions:** The character, habitat, animation, and historic-edition archive is in public R2 bucket `brand`, browsable at https://brand.inneranimalmedia.com/companions/kingdom/v1/explore.html. This is a proprietary-public-view archive, not an open reuse license.
- **Full private intake:** The complete Local Studio intake is snapshotted into existing private R2 bucket `media`, prefix `intake/backups/v1/`. The bucket has no custom domain and public r2.dev access is disabled.
- **Local originals:** No backup or restore command deletes the originals.

## Immutable files and recoverable manifest

The operator backup script `scripts/backup-local-media-intake.py` computes SHA-256 for each indexed media entry, stores one private binary per unique digest, retains aliases for repeated originals or staged copies, then remotely verifies the size and SHA-256 object metadata for **every** unique object. Only after complete verification does it publish an immutable private snapshot (`snapshots/<UTC-timestamp>.json`) and update `latest.json`. Files are content addressed; updates never silently overwrite earlier binaries.

The snapshot manifest includes each indexed entry's origin, relative path, filename, media collection/kind, size, content type, object key, and digest. It does not include the workstation's absolute source path.

## Commands

Use the approved operator environment with `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Never put secrets into the repository.

From the `agentsam-sdk` repository:

    # Refresh the local media index after adding/changing Mac assets
    node apps/local-studio/scripts/build-local-media-intake.mjs

    # Dry-run scan / deduplicate / report without writing R2
    python3 scripts/backup-local-media-intake.py

    # Publish a private backup with remote integrity verification
    python3 scripts/backup-local-media-intake.py --publish

    # Audit all objects in the latest cloud snapshot; does not require original files
    python3 scripts/backup-local-media-intake.py --verify

    # Recover source filenames and folders on another computer to a new directory
    python3 scripts/backup-local-media-intake.py --restore-dir /path/to/empty/recovered-media

Restore refuses to overwrite any existing file with differing content. It verifies the SHA-256 digest and size of every downloaded file. `--restore-limit 5` is useful for a small recovery smoke test.

## Initial verified snapshot

- November 15, 2026: 2,059 local-index entries -> 1,425 unique private objects, 1,274,859,022 unique bytes.
- All 1,425 unique object HEAD checks passed, and the private manifest was published.
- Snapshot: `media/intake/backups/v1/snapshots/20261115T091431Z.json`.
- Five files were successfully restored from private R2 in a separate recovery test directory with hash checks.

This is a **verified point-in-time backup**, not continuous synchronization. New files added to the Mac must be reindexed and backed up again. The localhost Mac-intake tab still uses its local index, and no account-level Media Library records have been silently fabricated or migrated. Cloud-stored files can be browsed through the authenticated R2 buckets provider using the `media` bucket, or recovered by this script.
