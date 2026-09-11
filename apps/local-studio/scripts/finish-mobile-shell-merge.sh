#!/usr/bin/env bash
# Resolve PR #5 on the iMac and merge Cursor mobile-shell into main.
set -euo pipefail
REPO="${REPO:-.}"
cd "$REPO"

git fetch origin
git checkout cursor/mobile-shell-multipage-0362
git pull origin cursor/mobile-shell-multipage-0362 || true

if ! git merge origin/main --no-edit; then
  echo "Resolving conflicts: keep mobile-shell UI + full workhorse CLI"
  git checkout --ours -- \
    scripts/as_workhorse.py \
    src/components/shell/app-shell.tsx \
    src/components/shell/nav-rail.tsx \
    src/components/shell/offline-banner.tsx \
    src/components/shell/studio-panels.tsx \
    src/components/shell/trail-workspace.tsx \
    src/components/workbench/command-palette.tsx \
    src/components/workbench/markdown.tsx \
    src/lib/work/store.ts \
    src/routes/_app/browse.tsx \
    src/routes/_app/cli.tsx \
    src/routes/_app/files.tsx \
    'src/routes/_app/trails/$trailId.tsx' || true
  git add -A
  git commit -m "Merge origin/main into mobile-shell; keep Cursor Studio UI and workhorse CLI"
fi

git push origin cursor/mobile-shell-multipage-0362
echo "Now merge PR: https://github.com/SamPrimeaux/AgentSam-Grok-Workmode/pull/5"
echo "  gh pr merge 5 --merge"
echo "Then run: bash scripts/restructure-app-layout.sh"
