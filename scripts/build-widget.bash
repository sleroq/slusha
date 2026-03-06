#!/usr/bin/env bash

set -euo pipefail

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
ROOT=$(dirname "$SCRIPTPATH")

cd "$ROOT/widget"

deno task build
