#!/usr/bin/env bash

set -e

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
cd "$(dirname "$SCRIPTPATH")"

source ./scripts/env.bash

export WEB_DEV_SERVER_URL="http://127.0.0.1:5173/"
(
    cd web
    deno task dev
) &
WEB_DEV_SERVER_PID=$!
trap 'kill "$WEB_DEV_SERVER_PID"' EXIT

deno run --allow-net --allow-ffi --allow-env --allow-write --allow-read --allow-import --allow-sys --allow-run main.ts
