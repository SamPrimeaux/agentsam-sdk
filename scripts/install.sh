#!/usr/bin/env bash
# AgentSam installer — npm bootstrap mode (standalone SEA artifacts come later).
# Served from https://agentsam.inneranimalmedia.com/install
# Product identity is always explicit: --app-id <id> (or legacy --app alias).
# Never inject a silent default app into the installer body.
set -euo pipefail

ROOT_PACKAGE="${AGENTSAM_PACKAGE:-@inneranimalmedia/agentsam-sdk}"
PACKAGE="$ROOT_PACKAGE"
CHANNEL="${AGENTSAM_CHANNEL:-latest}"
VERSION=""
APP_SELECTOR=""
APP_PACKAGE=""
APP_BIN=""
APP_NEEDS_WRAPPER="0"
INSTALL_ROOT="${AGENTSAM_HOME:-$HOME/.agentsam}"
BIN_DIR="${AGENTSAM_BIN_DIR:-$HOME/.local/bin}"
MODE="npm-global"

usage() {
  cat <<'EOF'
AgentSam installer

  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --version 2.6.10
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app-id local-studio
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app ecommerce
  curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --channel beta

Flags:
  --version <ver>   Install a specific npm package version
  --channel <name>  latest|beta (npm dist-tag)
  --app-id <id>     Stable app id (local-studio|cad-creator|client-cms-editor|ecommerce-cms-agentsam|database-editor)
  --app <alias>     Legacy alias: studio|cad|cms|ecommerce|database
  --prefix <dir>    Legacy wrapper bin directory (default: ~/.local/bin)
  --help            Show this help
EOF
}

select_app() {
  case "$1" in
    cad|cad-creator)
      APP_SELECTOR="cad-creator"
      APP_PACKAGE="@inneranimalmedia/agentsam-cad-creator"
      APP_BIN="agentsam-cad-creator"
      ;;
    cms|client-cms-editor)
      APP_SELECTOR="client-cms-editor"
      APP_PACKAGE="@inneranimalmedia/client-cms-editor"
      APP_BIN="agentsam-cms"
      ;;
    studio|local-studio)
      APP_SELECTOR="local-studio"
      APP_PACKAGE="@inneranimalmedia/agentsam-local-studio"
      APP_BIN="agentsam-studio"
      ;;
    ecommerce|ecommerce-cms-agentsam)
      APP_SELECTOR="ecommerce-cms-agentsam"
      APP_PACKAGE="@inneranimalmedia/ecommerce-cms-agentsam"
      APP_BIN="agentsam-ecommerce"
      ;;
    database|database-editor)
      APP_SELECTOR="database-editor"
      APP_PACKAGE="@inneranimalmedia/agentsam-database-editor"
      APP_BIN="agentsam-database-editor"
      ;;
    *)
      echo "unknown app: $1 (expected studio, cad, cms, ecommerce, database-editor, or a known --app-id)" >&2
      exit 2
      ;;
  esac
  PACKAGE="$APP_PACKAGE"
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
printf '  package %s\n' "$PACKAGE"
if [ -n "$APP_SELECTOR" ]; then
  printf '  app_id  %s\n' "$APP_SELECTOR"
fi

REQUESTED="$CHANNEL"
SPEC="$PACKAGE@$CHANNEL"
if [ -n "$VERSION" ]; then
  REQUESTED="$VERSION"
  SPEC="$PACKAGE@$VERSION"
fi

echo
echo "Installing $SPEC ..."
npm install --global "$SPEC"

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"

if [ "$APP_NEEDS_WRAPPER" = "1" ]; then
  AGENTSAM_COMMAND="$(command -v agentsam || true)"
  if [ -z "$AGENTSAM_COMMAND" ]; then
    AGENTSAM_COMMAND="agentsam"
  fi
  APP_LAUNCHER="$BIN_DIR/$APP_BIN"
  {
    printf '%s\n' '#!/usr/bin/env sh' 'set -eu'
    printf 'AGENTSAM_BIN=${AGENTSAM_BIN:-%q}\n' "$AGENTSAM_COMMAND"
    printf 'exec "$AGENTSAM_BIN" app preview %q "$@"\n' "$APP_SELECTOR"
  } > "$APP_LAUNCHER"
  chmod +x "$APP_LAUNCHER"
fi

RESOLVED_VERSION="$(
  npm list --global "$PACKAGE" --depth=0 --json 2>/dev/null |
    node -e '
      let s = "";
      process.stdin.on("data", d => s += d);
      process.stdin.on("end", () => {
        try {
          const j = JSON.parse(s);
          const name = process.argv[1];
          process.stdout.write(j.dependencies?.[name]?.version || "");
        } catch {}
      });
    ' "$PACKAGE"
)"
if [ -z "$RESOLVED_VERSION" ]; then
  RESOLVED_VERSION="unknown"
fi

if [ -n "$APP_SELECTOR" ]; then
  if [ "$APP_NEEDS_WRAPPER" = "1" ]; then
    EXECUTABLE="$BIN_DIR/$APP_BIN"
  else
    EXECUTABLE="$(command -v "$APP_BIN" || true)"
    if [ -z "$EXECUTABLE" ]; then
      EXECUTABLE="$APP_BIN"
    fi
  fi
else
  EXECUTABLE="$(command -v agentsam || true)"
  if [ -z "$EXECUTABLE" ]; then
    EXECUTABLE="agentsam"
  fi
fi

cat > "$INSTALL_ROOT/install-receipt.json" <<EOF
{
  "schema": "agentsam.install.v2",
  "receipt_schema": "agentsam.install.v2",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "distribution": "$MODE",
  "package": "$PACKAGE",
  "requested": "$REQUESTED",
  "requested_channel": $(if [ -z "$VERSION" ]; then printf '"%s"' "$CHANNEL"; else printf 'null'; fi),
  "requested_version": $(if [ -n "$VERSION" ]; then printf '"%s"' "$VERSION"; else printf 'null'; fi),
  "resolved_version": "$RESOLVED_VERSION",
  "os": "$OS",
  "arch": "$ARCH",
  "node": "$NODE_VERSION",
  "app_id": $(if [ -n "$APP_SELECTOR" ]; then printf '"%s"' "$APP_SELECTOR"; else printf 'null'; fi),
  "app": $(if [ -n "$APP_SELECTOR" ]; then printf '"%s"' "$APP_SELECTOR"; else printf 'null'; fi),
  "executable": "$EXECUTABLE",
  "bin_dir": "$BIN_DIR",
  "standalone_ready": false,
  "checksum_contract": "sha256sums-future"
}
EOF

echo
echo "✓ AgentSam installed"
printf '  package     %s@%s\n' "$PACKAGE" "$RESOLVED_VERSION"
printf '  executable  %s\n' "$EXECUTABLE"
printf '  config      %s\n' "$INSTALL_ROOT"
printf '  receipt     %s/install-receipt.json\n' "$INSTALL_ROOT"
echo
echo "Run:"
echo
if [ -n "$APP_SELECTOR" ]; then
  printf '  %s\n' "$APP_BIN"
else
  echo "  agentsam"
fi
echo
