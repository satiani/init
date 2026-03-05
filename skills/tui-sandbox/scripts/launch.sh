#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="tui-sandbox"

usage() {
    cat <<USAGE
Usage: $(basename "$0") <name>

Launch a new container from the tui-sandbox image.

Arguments:
  <name>    Container name (required, must be unique)

Examples:
  $(basename "$0") mybox
  $(basename "$0") devbox

Lifecycle:
  docker stop  <name>
  docker start <name>
  docker container prune   # clean up stopped containers
USAGE
    exit 0
}

if [ $# -eq 0 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
fi

CONTAINER_NAME="$1"

# ── Preflight ─────────────────────────────────────────────────────────────────
if ! docker info &>/dev/null; then
    echo "ERROR: Docker daemon not running" >&2; exit 1
fi

if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "ERROR: Image '$IMAGE_NAME' not found. Run build.sh first." >&2; exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "ERROR: Container '$CONTAINER_NAME' already exists." >&2
    echo "  Remove it first, or pick a different name." >&2; exit 1
fi

# ── Launch ────────────────────────────────────────────────────────────────────
echo "▸ Launching container '$CONTAINER_NAME'..."
docker run -dit \
    --name "$CONTAINER_NAME" \
    --hostname "$CONTAINER_NAME" \
    -e TERM=xterm-256color \
    "$IMAGE_NAME" >/dev/null

if [ "$(uname -s)" = "Darwin" ] && command -v security >/dev/null 2>&1; then
    if ! "$SCRIPT_DIR/seed-pi-auth.sh" "$CONTAINER_NAME"; then
        echo "⚠ Could not seed pi auth from macOS keychain; continuing." >&2
    fi
fi

echo ""
echo "✓ Container '$CONTAINER_NAME' running"
echo ""
echo "  Shell:  docker exec -it -u satiani -e TERM=xterm-256color $CONTAINER_NAME zsh -l"
echo "  Stop:   docker stop $CONTAINER_NAME"
echo "  Start:  docker start $CONTAINER_NAME"
