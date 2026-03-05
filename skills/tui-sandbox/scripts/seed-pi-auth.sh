#!/bin/bash
set -euo pipefail

usage() {
    cat <<USAGE
Usage: $(basename "$0") <container-name>

Pull Anthropic/OpenAI keys from macOS Keychain and seed them into a Linux container
using pass, then configure ~/.pi/agent/auth.json to read from pass.
USAGE
    exit 0
}

if [ $# -eq 0 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
fi

CONTAINER_NAME="$1"
USERNAME="satiani"

if ! command -v security >/dev/null 2>&1; then
    echo "ERROR: macOS 'security' command not found." >&2
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "ERROR: Container '$CONTAINER_NAME' is not running." >&2
    exit 1
fi

ANTHROPIC_KEY="$(security find-generic-password -ws 'anthropic-pi')"
OPENAI_KEY="$(security find-generic-password -s 'openai-api-key' -a 'pi-agent' -w)"

if [ -z "$ANTHROPIC_KEY" ] || [ -z "$OPENAI_KEY" ]; then
    echo "ERROR: Missing key(s) in macOS keychain." >&2
    exit 1
fi

docker exec \
    -u "$USERNAME" \
    -e ANTHROPIC_KEY="$ANTHROPIC_KEY" \
    -e OPENAI_KEY="$OPENAI_KEY" \
    "$CONTAINER_NAME" \
    zsh -lc '
set -euo pipefail

mkdir -p "$HOME/.pi/agent"

if ! command -v pass >/dev/null 2>&1; then
    echo "ERROR: pass is not installed in container" >&2
    exit 1
fi

GPG_KEY_ID=$(gpg --list-secret-keys --with-colons 2>/dev/null | awk -F: "/^sec:/ {print \$5; exit}")
if [ -z "${GPG_KEY_ID:-}" ]; then
    cat > /tmp/pi-pass-gpg.batch <<"EOF"
%no-protection
Key-Type: eddsa
Key-Curve: ed25519
Subkey-Type: ecdh
Subkey-Curve: cv25519
Name-Real: satiani sandbox pass
Name-Email: satiani@local
Expire-Date: 0
EOF
    gpg --batch --generate-key /tmp/pi-pass-gpg.batch >/dev/null 2>&1
    rm -f /tmp/pi-pass-gpg.batch
    GPG_KEY_ID=$(gpg --list-secret-keys --with-colons | awk -F: "/^sec:/ {print \$5; exit}")
fi

pass init "$GPG_KEY_ID" >/dev/null
printf "%s\n" "$ANTHROPIC_KEY" | pass insert -m -f pi/anthropic >/dev/null
printf "%s\n" "$OPENAI_KEY" | pass insert -m -f pi/openai >/dev/null

cat > "$HOME/.pi/agent/auth.json" <<"JSON"
{
  "anthropic": {
    "type": "api_key",
    "key": "!pass show pi/anthropic"
  },
  "openai": {
    "type": "api_key",
    "key": "!pass show pi/openai"
  }
}
JSON
chmod 600 "$HOME/.pi/agent/auth.json"
'

echo "✓ Seeded pi auth in container '$CONTAINER_NAME' via pass"
