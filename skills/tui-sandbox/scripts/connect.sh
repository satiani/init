#!/bin/bash
set -euo pipefail

# Connect to a running tui-sandbox container via tmux.
#
# Modes:
#   --pane    Open a split pane (default) — delegates to tmux skill's split-pane.sh
#   --window  Open a new tmux window named after the container, with a light-blue
#             status bar indicator matching the cpu/mem/date/time style
#
# Usage:
#   connect.sh <name> [--pane | --window]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMUX_SKILL_DIR="$HOME/.agents/skills/tmux"
USERNAME="satiani"

usage() {
    cat <<USAGE
Usage: $(basename "$0") <name> [--pane | --window]

Open a shell into a running tui-sandbox container via tmux.

Arguments:
  <name>     Container name (required)

Options:
  --pane     Open as a tmux split pane (default)
  --window   Open as a new tmux window named after the container
  -h, --help Show this help
USAGE
    exit 0
}

if [ $# -eq 0 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
fi

CONTAINER_NAME="$1"
shift
MODE="pane"

for arg in "$@"; do
    case "$arg" in
        --pane)   MODE="pane" ;;
        --window) MODE="window" ;;
        -h|--help) usage ;;
        *) echo "ERROR: Unknown option: $arg" >&2; exit 1 ;;
    esac
done

# ── Preflight ─────────────────────────────────────────────────────────────────
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "ERROR: Container '$CONTAINER_NAME' is not running." >&2
    echo "  Start it with: docker start $CONTAINER_NAME" >&2
    exit 1
fi

if [ -z "${TMUX:-}" ]; then
    echo "ERROR: Not inside a tmux session." >&2
    echo "  Run this from within tmux, or connect manually:" >&2
    echo "  docker exec -it -u $USERNAME -e TERM=xterm-256color $CONTAINER_NAME zsh -l" >&2
    exit 1
fi

DOCKER_CMD="docker exec -it -u $USERNAME -e TERM=xterm-256color $CONTAINER_NAME zsh -l"

# ── Connect ───────────────────────────────────────────────────────────────────
if [ "$MODE" = "pane" ]; then
    NEW_PANE=$(bash "$TMUX_SKILL_DIR/scripts/split-pane.sh" \
        -n "$CONTAINER_NAME" \
        -- $DOCKER_CMD)
    echo "$NEW_PANE"

elif [ "$MODE" = "window" ]; then
    # Create a new tmux window named after the container
    NEW_PANE=$(tmux new-window -d -n "$CONTAINER_NAME" -P -F '#{pane_id}' $DOCKER_CMD)

    # Style this window's indicator light blue (colour109) to match the
    # cpu/mem/date/time section of the status bar.
    # We use window-status-format on just this window.
    WIN_IDX=$(tmux display-message -p -t "$NEW_PANE" '#{window_index}')
    tmux set-window-option -t "$WIN_IDX" window-status-format \
        "#[fg=colour255,bg=colour109] #I |#[fg=colour255,bg=colour109] #W "
    tmux set-window-option -t "$WIN_IDX" window-status-current-format \
        "#[fg=colour67,bg=colour238,nobold,nounderscore,noitalics]#[fg=colour144,bg=colour67] #I | #W #[fg=colour67,bg=colour238,nobold,nounderscore,noitalics]"

    # Return focus to calling pane
    tmux select-pane -t "${TMUX_PANE}"

    echo "$NEW_PANE"
fi
