# Runbook for the current 57-package SDK

Assuming:

```bash
REPO=/Users/samprimeaux/agentsam-sdk
KIT=~/Downloads/agentsam-offline-knowledge-kit-v2/agentsam-offline-knowledge-kit-v2
```

## 1. Learn what your local tooling does

```bash
python3 "$KIT/scripts/catalog/doctor_remediation.py" --teach
```

This is the behavior to reproduce in the packaged `agentsam doctor`.

## 2. Inventory packages

```bash
python3 "$KIT/scripts/catalog/inventory_packages.py" --repo "$REPO"
```

## 3. Collect factual evidence for all packages

```bash
python3 "$KIT/scripts/catalog/collect_package_evidence.py" --repo "$REPO"
```

This writes evidence JSON under `packages/catalog/evidence/`.

## 4. Preview all 57 manifest drafts

```bash
python3 "$KIT/scripts/catalog/draft_package_manifests.py" \
  --repo "$REPO" \
  --dry-run
```

## 5. On the feature branch, create the missing drafts

```bash
python3 "$KIT/scripts/catalog/draft_package_manifests.py" \
  --repo "$REPO" \
  --write
```

Every generated file remains `catalog_status: needs-review`.
Nothing becomes a polished/public product definition merely because a script ran.

## 6. See the review queue

```bash
python3 "$KIT/scripts/catalog/review_queue.py" --repo "$REPO"
```

## 7. Test the richer software-decision flow

After copying `packages/catalog/assist/*.json` into the repo:

```bash
python3 "$KIT/scripts/catalog/simulate_assist.py" --repo "$REPO"
```

The real product implementation belongs in the AgentSam JS/TS CLI.

## 8. Build the aggregate after review

```bash
python3 "$KIT/scripts/catalog/build_catalog.py" --repo "$REPO"
```

Release/public gate:

```bash
python3 "$KIT/scripts/catalog/build_catalog.py" \
  --repo "$REPO" \
  --require-classified
```

Do not expect `--require-classified` to pass until the package review work is actually complete.
