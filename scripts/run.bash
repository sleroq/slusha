#!/usr/bin/env bash

set -e

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
cd "$(dirname "$SCRIPTPATH")"

source ./scripts/env.bash

deno run --allow-net --allow-env main.ts
