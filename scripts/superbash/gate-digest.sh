#!/usr/bin/env bash
# superbash digest · gate-digest
# purpose: run the repo's repeated gates and return pass/fail + ONE tail line each — never the log (the usual 200-line paste)
# cwd: repository root · read-only checks · no arguments · output: ONE JSON line, schema agentsam.digest.gates.v1
# exit 1 if any gate failed. Gates that package.json does not define are skipped. Edit the next line to change the set.
GATES="brand:check release:train:check errors:check verify:registry"
esc() { LC_ALL=C tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
if [ ! -f package.json ]; then
  printf '{"schema":"agentsam.digest.gates.v1","ok":false,"error":"no_package_json"}\n'
  exit 2
fi
set +e
fail=0; ran=0; rows=""
for g in $GATES; do
  grep -q "\"$g\":" package.json || continue
  ran=$((ran+1))
  s=$(date +%s)
  out=$(npm run -s "$g" 2>&1); code=$?
  e=$(date +%s)
  tail=$(printf '%s\n' "$out" | grep -v '^[[:space:]]*$' | tail -n 1 | cut -c1-120 | esc)
  ok=true; if [ "$code" -ne 0 ]; then ok=false; fail=$((fail+1)); fi
  rows="${rows:+$rows,}{\"name\":\"$g\",\"ok\":$ok,\"exit\":$code,\"seconds\":$((e-s)),\"tail\":\"$tail\"}"
done
all=true; if [ "$fail" -gt 0 ]; then all=false; fi
printf '{"schema":"agentsam.digest.gates.v1","ok":%s,"ran":%s,"failed":%s,"gates":[%s]}\n' "$all" "$ran" "$fail" "$rows"
[ "$fail" -eq 0 ]
