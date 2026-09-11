#!/usr/bin/env bash
# Move stuffed src/ into app/frontend + app/backend. Run AFTER mobile-shell is on main.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [[ -d app/frontend/src ]]; then
  echo "app/frontend/src already exists. Abort."
  exit 1
fi

mkdir -p app/frontend app/backend

[[ -d src ]] && git mv src app/frontend/src
[[ -d public ]] && git mv public app/frontend/public
[[ -d worker ]] && git mv worker app/backend/worker
[[ -d migrations ]] && git mv migrations app/backend/migrations
[[ -d server ]] && git mv server app/backend/server

for f in wrangler.workmode.toml wrangler.toml wrangler.toml.example; do
  [[ -f "$f" ]] && git mv "$f" "app/backend/$f"
done

if [[ -f tsconfig.json ]]; then
  python3 - <<'PY'
from pathlib import Path
p = Path("tsconfig.json")
raw = p.read_text()
raw = raw.replace('"src/*"', '"app/frontend/src/*"')
raw = raw.replace('"./src/', '"./app/frontend/src/')
p.write_text(raw)
print("updated tsconfig.json paths")
PY
fi

if [[ -f vite.config.ts ]]; then
  python3 - <<'PY'
from pathlib import Path
p = Path("vite.config.ts")
t = p.read_text()
t = t.replace('"/src/lib/db.ts"', '"/app/frontend/src/lib/db.ts"')
t = t.replace('join(root, "migrations")', 'join(root, "app/backend/migrations")')
t = t.replace("`src/lib/db.ts`", "`app/frontend/src/lib/db.ts`")
t = t.replace("`src/routes/", "`app/frontend/src/routes/")
p.write_text(t)
print("updated vite.config.ts")
PY
fi

if [[ -f package.json ]]; then
  python3 - <<'PY'
from pathlib import Path
p = Path("package.json")
t = p.read_text()
t = t.replace("src/lib/", "app/frontend/src/lib/")
t = t.replace("wrangler deploy -c wrangler.workmode.toml", "wrangler deploy -c app/backend/wrangler.workmode.toml")
p.write_text(t)
print("updated package.json")
PY
fi

git add -A
echo
echo "Review git status, then:"
echo "  git commit -m \"Restructure into app/frontend and app/backend\""
echo "  git push"
echo
git status --short | head -80
