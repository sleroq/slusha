#!/usr/bin/env bash

set -e

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
cd "$(dirname "$SCRIPTPATH")"

deno compile \
	--output 'out/slusha' \
	--target 'x86_64-unknown-linux-gnu' \
	--allow-net \
	--allow-env \
	--allow-write \
	--allow-read main.ts
