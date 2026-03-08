#!/usr/bin/env bash
set -e

cd "$(dirname "$(dirname "$(readlink -f "$0")")")"

VERSION="${1:-latest}"
REGISTRY="localhost:5000"

docker build --platform linux/amd64 -t "${REGISTRY}/slusha:latest" -t "${REGISTRY}/slusha:${VERSION}" .
docker push "${REGISTRY}/slusha:latest"
if [[ "${VERSION}" != "latest" ]]; then
  docker push "${REGISTRY}/slusha:${VERSION}"
fi

ssh cumserver "podman pull ${REGISTRY}/slusha:latest && systemctl restart podman-slusha.service && systemctl status podman-slusha.service --no-pager"
