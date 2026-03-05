#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTEXT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="tui-sandbox"
NO_CACHE=""

usage() {
    cat <<USAGE
Usage: $(basename "$0") [OPTIONS]

Build (or rebuild) the tui-sandbox Docker image.

Options:
  --rebuild    Full rebuild with no Docker cache
  -h, --help   Show this help
USAGE
    exit 0
}

for arg in "$@"; do
    case $arg in
        --rebuild) NO_CACHE="--no-cache" ;;
        -h|--help) usage ;;
    esac
done

if ! command -v docker &>/dev/null; then
    echo "ERROR: docker not found" >&2; exit 1
fi
if ! docker info &>/dev/null; then
    echo "ERROR: Docker daemon not running" >&2; exit 1
fi

echo "▸ Building image '$IMAGE_NAME' from $CONTEXT_DIR"
[ -n "$NO_CACHE" ] && echo "  (full rebuild, no cache)"
echo ""

docker build $NO_CACHE -t "$IMAGE_NAME" "$CONTEXT_DIR"

echo ""
echo "✓ Image '$IMAGE_NAME' built successfully"
echo "  Size: $(docker image inspect "$IMAGE_NAME" --format '{{.Size}}' | numfmt --to=iec 2>/dev/null || docker image inspect "$IMAGE_NAME" --format '{{.Size}}')"
