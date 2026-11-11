#!/usr/bin/env bash
set -euo pipefail
sandboxd setup
exec sandboxd serve
