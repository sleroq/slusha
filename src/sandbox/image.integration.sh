#!/bin/sh
set -eu

# Run on a Linux host with Docker and runsc installed.
cd "$(dirname "$0")"
docker build -t slusha-sandbox-image-test .
docker run --rm --runtime=runsc --network=none --read-only --cap-drop=ALL \
    --security-opt=no-new-privileges \
    --tmpfs /workspace:rw,size=24997888,uid=1000,gid=1000 \
    --tmpfs /tmp:rw,size=1048576,uid=1000,gid=1000 \
    slusha-sandbox-image-test sh -eu -c '
        test "$(id -u)" = 1000
        tar --version | grep -q "GNU tar"
        ! touch /outside 2>/dev/null
        echo hello > /workspace/file
        tar --sparse -cf /tmp/workspace.tar -C /workspace .
        mkdir /tmp/restored
        tar -xf /tmp/workspace.tar -C /tmp/restored
        test "$(cat /tmp/restored/file)" = hello
        if dd if=/dev/zero of=/workspace/full bs=1000000 count=26 2>/dev/null; then
            echo "workspace size limit was not enforced" >&2
            exit 1
        fi
        test "$(wc -c < /workspace/full)" -le 25000000
        rm /workspace/full
    '
