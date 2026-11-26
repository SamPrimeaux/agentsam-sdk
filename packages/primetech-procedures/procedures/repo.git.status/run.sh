#!/usr/bin/env bash
# Pinned, read-only procedure; the trusted host already selects the project cwd.
set -euo pipefail
if [[ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" != "true" ]]; then
  printf '%s\n' 'Not a Git worktree' >&2
  exit 2
fi
tracked=$(git status --porcelain=v1 --untracked-files=no | awk 'END { print NR + 0 }')
untracked=$(git ls-files --others --exclude-standard | awk 'END { print NR + 0 }')
printf '{"schema":"inneranimalmedia.primetech.git-status.v1","ok":true,"tracked_changes":%s,"untracked_files":%s,"engine":"git"}\n' "$tracked" "$untracked"
