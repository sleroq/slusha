#!/usr/bin/env bash

set -e

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
cd "$(dirname "$SCRIPTPATH")"

# Targets with extensions
targets=(
    "x86_64-unknown-linux-gnu"
    "x86_64-apple-darwin"
    "aarch64-apple-darwin"
    "x86_64-pc-windows-msvc"
)

# Extensions for each target
extensions=(
    ""
    "apple-x86_64"
    "apple-aarch64"
    "pc-windows-msvc"
)

for i in "${!targets[@]}"; do
    target=${targets[i]}
    ext=${extensions[i]}

    deno compile \
        --output "out/slusha$ext" \
        --target "$target" \
        --allow-net \
        --allow-env \
        --allow-write \
        --allow-read main.ts
done
