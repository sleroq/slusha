#!/usr/bin/env bash

set -e

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
cd "$(dirname "$SCRIPTPATH")"

source ./scripts/env.bash

trap 'break' SIGINT

while true; do
    deno run --allow-net --allow-ffi --allow-env --allow-write --allow-read --allow-import --allow-sys --allow-run main.ts
done
