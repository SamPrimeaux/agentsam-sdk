#!/usr/bin/env bash
# superbash digest · worktree-sweep
# purpose: every worktree of this repo in one answer — dirty first, capped at 40 (replaces N x status/log/rev-list calls)
# cwd: any checkout of the repo · read-only · no arguments · output: ONE JSON line, schema agentsam.digest.worktrees.v1
esc() { LC_ALL=C tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '{"schema":"agentsam.digest.worktrees.v1","ok":false,"error":"not_a_git_repo"}\n'
  exit 2
fi
limit=40
base=origin/main; git rev-parse -q --verify "$base" >/dev/null 2>&1 || base=""
tmp=$(mktemp -d "${TMPDIR:-/tmp}/sbwt.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
git worktree list --porcelain > "$tmp/wt"
: > "$tmp/rows"
total=0; dirty_n=0; missing=0; ephemeral=0; path=""; branch=""; tilde='~'
flush() {
  [ -n "$path" ] || return 0
  total=$((total+1))
  b=${branch#refs/heads/}; [ -n "$b" ] || b="DETACHED"
  d=0; a=null; bh=null; last=""
  if [ -d "$path" ]; then
    d=$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    last=$(git -C "$path" log -1 --format=%cI 2>/dev/null || true)
    if [ -n "$base" ]; then
      c=$(git -C "$path" rev-list --left-right --count "$base...HEAD" 2>/dev/null || true)
      if [ -n "$c" ]; then bh=${c%%[[:space:]]*}; a=${c##*[[:space:]]}; fi
    fi
  else
    missing=$((missing+1))
  fi
  if [ "$d" -gt 0 ]; then dirty_n=$((dirty_n+1)); fi
  eph=false
  case "$path" in /private/tmp/*|/tmp/*|/private/var/*|/var/folders/*) eph=true; ephemeral=$((ephemeral+1));; esac
  shown=${path/#$HOME/$tilde}
  printf '%s\t{"branch":"%s","path":"%s","dirty":%s,"ahead":%s,"behind":%s,"last":"%s","ephemeral":%s}\n' \
    "$d" "$(printf %s "$b" | esc)" "$(printf %s "$shown" | esc)" "$d" "$a" "$bh" "$last" "$eph" >> "$tmp/rows"
}
while IFS= read -r line; do
  case "$line" in
    "worktree "*) flush; path=${line#worktree }; branch="";;
    "branch "*) branch=${line#branch };;
  esac
done < "$tmp/wt"
flush
rows=$(sort -rn "$tmp/rows" | awk -v n="$limit" 'NR<=n' | cut -f2- | paste -sd, -)
truncated=false; if [ "$total" -gt "$limit" ]; then truncated=true; fi
shown_n=$total; if [ "$total" -gt "$limit" ]; then shown_n=$limit; fi
printf '{"schema":"agentsam.digest.worktrees.v1","total":%s,"dirty":%s,"missing":%s,"ephemeral":%s,"shown":%s,"truncated":%s,"worktrees":[%s]}\n' \
  "$total" "$dirty_n" "$missing" "$ephemeral" "$shown_n" "$truncated" "$rows"
