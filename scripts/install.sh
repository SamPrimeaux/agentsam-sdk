#!/usr/bin/env bash
# AgentSam installer — npm bootstrap mode (standalone SEA artifacts come later).
# Served from https://agentsam.inneranimalmedia.com/install
set -euo pipefail

PACKAGE="${AGENTSAM_PACKAGE:-@inneranimalmedia/agentsam-sdk}"
CHANNEL="${AGENTSAM_CHANNEL:-latest}"
VERSION=""
APP_SELECTOR=""
INSTALL_ROOT="${AGENTSAM_HOME:-$HOME/.agentsam}"
BIN_DIR="${AGENTSAM_BIN_DIR:-$HOME/.local/bin}"
MODE="npm"

usage() {
  cat <<'EOF'
AgentSam installer

  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --version 2.6.2
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app studio
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --channel beta

Flags:
  --version <ver>   Install a specific npm package version
  --channel <name>  latest|beta (npm dist-tag)
  --app <id>        cad|cms|studio (records preferred app; npm package still installs CLI)
  --prefix <dir>    Bin directory (default: ~/.local/bin)
  --help            Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    --channel) CHANNEL="${2:-}"; shift 2 ;;
    --app) APP_SELECTOR="${2:-}"; shift 2 ;;
    --prefix) BIN_DIR="${2:-}"; shift 2 ;;
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
  printf '  app     %s\n' "$APP_SELECTOR"
fi

SPEC="$PACKAGE@$CHANNEL"
if [ -n "$VERSION" ]; then
  SPEC="$PACKAGE@$VERSION"
fi

echo
echo "Installing $SPEC ..."
npm install --global "$SPEC"

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
cat > "$INSTALL_ROOT/install-receipt.json" <<EOF
{
  "schema": "agentsam.install.v1",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "package": "$SPEC",
  "mode": "$MODE",
  "os": "$OS",
  "arch": "$ARCH",
  "node": "$NODE_VERSION",
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
echo
echo "Run:"
echo
echo "  agentsam"
echo
