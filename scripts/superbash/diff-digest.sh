#!/usr/bin/env bash
# superbash digest · diff-digest
# purpose: what does this branch change vs origin/main? files/lines, top directories, largest files — never the diff itself
# cwd: any git checkout · read-only · no arguments · output: ONE JSON line, schema agentsam.digest.diff.v1
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '{"schema":"agentsam.digest.diff.v1","ok":false,"error":"not_a_git_repo"}\n'
  exit 2
fi
base=origin/main; git rev-parse -q --verify "$base" >/dev/null 2>&1 || base=main
if ! git rev-parse -q --verify "$base" >/dev/null 2>&1; then
  printf '{"schema":"agentsam.digest.diff.v1","ok":false,"error":"no_base_ref"}\n'
  exit 2
fi
git diff --no-renames --numstat "$base...HEAD" | awk -v base="$base" '
  BEGIN { FS = "\t" }
  function jesc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
  {
    a = $1; d = $2; p = $3
    if (a == "-") { nb++; a = 0; d = 0 }
    files++; add += a; del += d
    n = split(p, parts, "/")
    dir = (n > 1) ? parts[1] : "(root)"
    if (n > 2 && (parts[1] == "apps" || parts[1] == "packages")) dir = parts[1] "/" parts[2]
    df[dir]++; da[dir] += a; dd[dir] += d
    tot[p] = a + d; pa[p] = a; pd[p] = d
  }
  END {
    printf "{\"schema\":\"agentsam.digest.diff.v1\",\"base\":\"%s\",\"files\":%d,\"insertions\":%d,\"deletions\":%d,\"binary\":%d,\"by_dir\":[", base, files, add, del, nb
    for (i = 1; i <= 10; i++) {
      best = ""; bf = -1
      for (k in df) if (!(k in used) && (df[k] > bf || (df[k] == bf && k < best))) { best = k; bf = df[k] }
      if (best == "") break
      used[best] = 1
      printf "%s{\"dir\":\"%s\",\"files\":%d,\"add\":%d,\"del\":%d}", (i > 1 ? "," : ""), jesc(best), df[best], da[best], dd[best]
    }
    printf "],\"largest\":["
    for (i = 1; i <= 8; i++) {
      best = ""; bt = -1
      for (k in tot) if (!(k in usedf) && (tot[k] > bt || (tot[k] == bt && k < best))) { best = k; bt = tot[k] }
      if (best == "") break
      usedf[best] = 1
      printf "%s{\"path\":\"%s\",\"add\":%d,\"del\":%d}", (i > 1 ? "," : ""), jesc(best), pa[best], pd[best]
    }
    printf "]}\n"
  }'
