#!/usr/bin/env bash
# AgentSam installer — npm bootstrap mode (standalone SEA artifacts come later).
# Served from https://agentsam.inneranimalmedia.com/install
# Product identity is always explicit: --app-id <id> (or legacy --app alias).
# Never inject a silent default app into the installer body.
set -euo pipefail

PACKAGE="${AGENTSAM_PACKAGE:-@inneranimalmedia/agentsam-sdk}"
CHANNEL="${AGENTSAM_CHANNEL:-latest}"
VERSION=""
APP_SELECTOR=""
APP_BIN=""
INSTALL_ROOT="${AGENTSAM_HOME:-$HOME/.agentsam}"
BIN_DIR="${AGENTSAM_BIN_DIR:-$HOME/.local/bin}"
MODE="npm"

usage() {
  cat <<'EOF'
AgentSam installer

  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --version 2.6.2
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app-id database-editor
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app studio
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --channel beta

Flags:
  --version <ver>   Install a specific npm package version
  --channel <name>  latest|beta (npm dist-tag)
  --app-id <id>     Stable app id (database-editor|local-studio|cad-creator|client-cms-editor|…)
  --app <alias>     Legacy alias: cad|cms|studio (maps to --app-id)
  --prefix <dir>    Bin directory (default: ~/.local/bin)
  --help            Show this help
EOF
}

select_app() {
  case "$1" in
    cad|cad-creator)
      APP_SELECTOR="cad-creator"
      APP_BIN="agentsam-cad-creator"
      ;;
    cms|client-cms-editor)
      APP_SELECTOR="client-cms-editor"
      APP_BIN="agentsam-cms"
      ;;
    studio|local-studio)
      APP_SELECTOR="local-studio"
      APP_BIN="agentsam-studio"
      ;;
    database|database-editor)
      APP_SELECTOR="database-editor"
      APP_BIN="agentsam-database-editor"
      ;;
    *)
      echo "unknown app: $1 (expected cad, cms, studio, database-editor, or a known --app-id)" >&2
      exit 2
      ;;
  esac
}

require_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "$1 requires a value" >&2
    exit 2
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) require_value "$@"; VERSION="$2"; shift 2 ;;
    --channel) require_value "$@"; CHANNEL="$2"; shift 2 ;;
    --app-id|--app) require_value "$@"; select_app "$2"; shift 2 ;;
    --prefix) require_value "$@"; BIN_DIR="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown flag: $1" >&2; usage; exit 2 ;;
  esac
done

printf '\nAgentSam installer\n\n'

OS="$(uname -s)"
ARCH="$(uname -m)"
printf '  OS      %s\n' "$OS"
printf '  arch    %s\n' "$ARCH"

case "$OS-$ARCH" in
  Darwin-arm64|Darwin-x86_64|Linux-x86_64|Linux-aarch64|Linux-arm64) ;;
  *)
    echo "Unsupported platform: $OS $ARCH" >&2
    exit 1
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js is required by this AgentSam release."
  echo "Install Node 22+ and rerun this installer."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found." >&2
  exit 1
fi

NODE_VERSION="$(node -p 'process.versions.node')"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "AgentSam requires Node 22 or newer (found $NODE_VERSION)." >&2
  exit 1
fi

printf '  Node    %s\n' "$NODE_VERSION"
printf '  mode    %s\n' "$MODE"
if [ -n "$APP_SELECTOR" ]; then
  printf '  app_id  %s\n' "$APP_SELECTOR"
fi

SPEC="$PACKAGE@$CHANNEL"
if [ -n "$VERSION" ]; then
  SPEC="$PACKAGE@$VERSION"
fi

echo
echo "Installing $SPEC ..."
npm install --global "$SPEC"

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
AGENTSAM_COMMAND="$(command -v agentsam || true)"
if [ -z "$AGENTSAM_COMMAND" ]; then
  AGENTSAM_COMMAND="agentsam"
fi

if [ -n "$APP_SELECTOR" ]; then
  APP_LAUNCHER="$BIN_DIR/$APP_BIN"
  {
    printf '%s\n' '#!/usr/bin/env sh' 'set -eu'
    printf 'AGENTSAM_BIN=${AGENTSAM_BIN:-%q}\n' "$AGENTSAM_COMMAND"
    printf 'exec "$AGENTSAM_BIN" app preview %q "$@"\n' "$APP_SELECTOR"
  } > "$APP_LAUNCHER"
  chmod +x "$APP_LAUNCHER"
fi

cat > "$INSTALL_ROOT/install-receipt.json" <<EOF
{
  "schema": "agentsam.install.v1",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "package": "$SPEC",
  "mode": "$MODE",
  "os": "$OS",
  "arch": "$ARCH",
  "node": "$NODE_VERSION",
  "app_id": $(if [ -n "$APP_SELECTOR" ]; then printf '"%s"' "$APP_SELECTOR"; else printf 'null'; fi),
  "app": $(if [ -n "$APP_SELECTOR" ]; then printf '"%s"' "$APP_SELECTOR"; else printf 'null'; fi),
  "bin_dir": "$BIN_DIR",
  "standalone_ready": false,
  "checksum_contract": "sha256sums-future"
}
EOF

echo
echo "✓ AgentSam installed"
if command -v agentsam >/dev/null 2>&1; then
  agentsam --version || true
  AGENTSAM_BIN="$(command -v agentsam)"
  printf '  agentsam    %s\n' "$AGENTSAM_BIN"
else
  echo "  agentsam binary not found on PATH; ensure npm global bin is on PATH"
fi
printf '  config      %s\n' "$INSTALL_ROOT"
printf '  receipt     %s/install-receipt.json\n' "$INSTALL_ROOT"
if [ -n "$APP_SELECTOR" ]; then
  printf '  app         %s\n' "$BIN_DIR/$APP_BIN"
fi
echo
echo "Run:"
echo
if [ -n "$APP_SELECTOR" ]; then
  printf '  %s\n' "$APP_BIN"
else
  echo "  agentsam"
fi
echo
