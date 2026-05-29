#!/bin/sh
set -e

CONFIG_FILE="/app/dist/config.js"

if [ -f "$CONFIG_FILE" ]; then
  for var in VITE_API_URL VITE_NIP85_RELAY_URL VITE_FEATURE_AGENT_SUITE VITE_FEATURE_ASSISTANTS_ADMIN; do
    eval value=\"\$$var\"
    # Escape sed delimiters in value
    escaped=$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')
    sed -i "s|__${var}__|${escaped}|g" "$CONFIG_FILE"
  done
fi

exec serve -s dist -l 3000
