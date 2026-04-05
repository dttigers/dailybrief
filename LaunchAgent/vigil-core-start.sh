#!/bin/bash
# Wrapper script for Vigil Core API LaunchAgent
# Loads environment variables from .env file, then starts the server

ENV_FILE="$HOME/.config/dailybrief/.env"

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

exec /usr/local/bin/node "/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/dist/index.js"
