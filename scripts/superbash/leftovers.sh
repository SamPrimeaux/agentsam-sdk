#!/usr/bin/env bash
# superbash digest · leftovers
# purpose: find work that was "preserved" instead of landed — backup/archive/preserve paths, wip-style branches, stashes
# cwd: any git checkout · read-only · no arguments · output: ONE JSON line, schema agentsam.digest.leftovers.v1
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '{"schema":"agentsam.digest.leftovers.v1","ok":false,"error":"not_a_git_repo"}\n'
  exit 2
fi
path_pat='\.(bak|orig|rej|old|swp|tmp)(\.|$)|~$|(^|/)(preserve[^/]*|archive[sd]?|backups?|_incoming)(/|$)'
skip_pat='(^|/)(node_modules|dist|build|\.wrangler|\.output|target|\.next|\.venv)(/|$)'
branch_pat='(^|[-_/.])(wip|preserve[a-z]*|archive[a-z]*|backup|bak|old|tmp|temp|snapshot|recover[a-z]*|salvage|rescue|scratch)($|[-_/.])'
paths=$(git ls-files -co --exclude-standard | grep -E -v "$skip_pat" | grep -E "$path_pat" || true)
branches=$(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes | grep -E -i "$branch_pat" || true)
stashes=$(git stash list | wc -l | tr -d ' ')
list_json() { awk -v max="$1" 'function jesc(s){gsub(/\\/,"\\\\",s);gsub(/"/,"\\\"",s);return s} NF { n++; if (n <= max) printf "%s\"%s\"", (n > 1 ? "," : ""), jesc($0) } END { printf "\n" }' | tr -d '\n'; }
count_of() { printf '%s\n' "$1" | awk 'NF' | wc -l | tr -d ' '; }
pc=$(count_of "$paths"); bc=$(count_of "$branches")
ptrunc=false; if [ "$pc" -gt 15 ]; then ptrunc=true; fi
btrunc=false; if [ "$bc" -gt 10 ]; then btrunc=true; fi
printf '{"schema":"agentsam.digest.leftovers.v1","paths":{"count":%s,"truncated":%s,"shown":[%s]},"branches":{"count":%s,"truncated":%s,"shown":[%s]},"stashes":%s}\n' \
  "$pc" "$ptrunc" "$(printf '%s\n' "$paths" | list_json 15)" "$bc" "$btrunc" "$(printf '%s\n' "$branches" | list_json 10)" "$stashes"
