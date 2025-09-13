#!/usr/bin/env bash

set -euo pipefail

# Ensure we run from repo root so relative binds resolve correctly
SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
cd "$(dirname "$SCRIPTPATH")"

# Ensure host paths exist so the container user can write to them
mkdir -p ./tmp ./log
touch ./memory.json

# With SELinux enabled, use Z for labeling; U adjusts ownership for the container user
MOUNT_OPTS="Z,U"

podman run --name slusha-bot -it \
  --userns=keep-id \
  -e BOT_TOKEN=your_bot_token \
  -e AI_TOKEN=your_ai_token \
  -v "$(pwd)/memory.json:/app/memory.json:${MOUNT_OPTS}" \
  -v "$(pwd)/slusha.config.js:/app/slusha.config.js:ro,Z" \
  -v "$(pwd)/tmp:/app/tmp:${MOUNT_OPTS}" \
  -v "$(pwd)/log:/app/log:${MOUNT_OPTS}" \
  slusha:latest