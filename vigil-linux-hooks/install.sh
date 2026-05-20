#!/usr/bin/env bash
set -euo pipefail
exec /usr/bin/node "$(dirname "$0")/install.js" "$@"
