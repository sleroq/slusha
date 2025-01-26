#!/usr/bin/env bash

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
cd "$(dirname "$SCRIPTPATH")"

source ./scripts/env.bash

while true; do
    deno run --allow-net --allow-env --allow-write --allow-read --allow-import main.ts
done
