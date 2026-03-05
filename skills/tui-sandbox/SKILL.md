---
name: tui-sandbox
description: >
  Create isolated Docker container sandboxes for TUI software, CLI tools, or anything you don't
  want on the host. Triggered by "create a sandbox", "isolated container", "tui sandbox",
  "docker sandbox", "launch a container", "scratch environment", or "disposable environment".
  Containers launch instantly from a pre-built image with the user's full dotfiles and toolchain.
---

# TUI Sandbox

Pre-built Docker image with the user's dotfiles and toolchain. Containers launch instantly.

## Quick reference

```bash
SKILL_DIR="<path to this skill>"

# Build the image (one-time, or after Dockerfile changes)
bash "$SKILL_DIR/scripts/build.sh"

# Rebuild from scratch (no cache)
bash "$SKILL_DIR/scripts/build.sh" --rebuild

# Launch a container (name is required)
# On macOS, this also auto-seeds Anthropic/OpenAI keys from Keychain into `pass`
# inside the container and writes ~/.pi/agent/auth.json to read from pass.
bash "$SKILL_DIR/scripts/launch.sh" mybox

# Manually (re)seed pi auth for a running container
bash "$SKILL_DIR/scripts/seed-pi-auth.sh" mybox

# Connect — split pane (default)
bash "$SKILL_DIR/scripts/connect.sh" mybox --pane

# Connect — new tmux window (named & colored light blue)
bash "$SKILL_DIR/scripts/connect.sh" mybox --window

# Multiple containers
bash "$SKILL_DIR/scripts/launch.sh" box1
bash "$SKILL_DIR/scripts/launch.sh" box2
bash "$SKILL_DIR/scripts/connect.sh" box1 --window
bash "$SKILL_DIR/scripts/connect.sh" box2 --window
```

## Scripts

### `scripts/build.sh [--rebuild]`

Builds the `tui-sandbox` Docker image from the Dockerfile. Run once initially, then again
whenever the Dockerfile is modified.

- `--rebuild` — full rebuild with `--no-cache`

### `scripts/launch.sh <name>`

Launches a single container with the given name. Name is **required** — this allows multiple
containers to coexist and be addressed independently. The container starts in the background
and stays running.

### `scripts/connect.sh <name> [--pane | --window]`

Opens a shell into a running container via tmux. Requires being inside a tmux session.

- `--pane` (default) — opens a split pane using the tmux skill's layout rules
- `--window` — opens a new tmux window named after the container, with a light-blue
  (`colour109`) status bar indicator matching the cpu/mem/date/time style

Both modes return focus to the calling pane. The script prints the new pane ID to stdout.

### Container lifecycle

```bash
docker stop  <name>           # pause (state preserved)
docker start <name>           # resume
docker container prune        # clean up all stopped containers
```

## Customizing the image

1. Edit the `Dockerfile` in this skill directory
2. Run `bash scripts/build.sh` (or `--rebuild` for a clean build)
3. New containers will use the updated image; existing ones are unaffected

### What's in the image

- **Base:** Ubuntu 24.04 with UTF-8 locale, 256-color terminal
- **User:** `satiani` with zsh, passwordless sudo
- **Dotfiles:** cloned from `github.com/satiani/init` and deployed via `deploy.sh`
- **Tools:** oh-my-zsh, rust, ripgrep, starship, fzf, zoxide, neovim, tmux with tpm, pass (password-store)
- **Packages:** git, curl, wget, build-essential, python3, pip, pipx, cmake, rsync, nodejs (latest current), npm, etc.
