#!/usr/bin/env bash
# superbash digest · repo-state
# purpose: one-line answer to "what state is this checkout in?" (replaces ~6 separate git tool calls)
# cwd: any git checkout · read-only · no arguments · output: ONE JSON line, schema agentsam.digest.repo-state.v1
esc() { LC_ALL=C tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '{"schema":"agentsam.digest.repo-state.v1","ok":false,"error":"not_a_git_repo"}\n'
  exit 2
fi
branch=$(git branch --show-current); [ -n "$branch" ] || branch="DETACHED"
head=$(git rev-parse --short HEAD 2>/dev/null || echo none)
changes=$(git status --porcelain | wc -l | tr -d ' ')
untracked=$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')
stashes=$(git stash list | wc -l | tr -d ' ')
worktrees=$(git worktree list | wc -l | tr -d ' ')
base=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
if [ -z "$base" ] && git rev-parse -q --verify origin/main >/dev/null 2>&1; then base=origin/main; fi
ahead=null; behind=null
if [ -n "$base" ]; then
  counts=$(git rev-list --left-right --count "$base...HEAD" 2>/dev/null || true)
  if [ -n "$counts" ]; then behind=${counts%%[[:space:]]*}; ahead=${counts##*[[:space:]]}; fi
fi
last=$(git log -1 --format=%cI 2>/dev/null || true)
subject=$(git log -1 --format=%s 2>/dev/null | cut -c1-80 | esc)
printf '{"schema":"agentsam.digest.repo-state.v1","branch":"%s","head":"%s","changes":%s,"untracked":%s,"vs":"%s","ahead":%s,"behind":%s,"stashes":%s,"worktrees":%s,"last_commit":"%s","last_subject":"%s"}\n' \
  "$(printf %s "$branch" | esc)" "$head" "$changes" "$untracked" "$(printf %s "$base" | esc)" "$ahead" "$behind" "$stashes" "$worktrees" "$last" "$subject"
