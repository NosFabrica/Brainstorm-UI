#!/bin/sh
set -e

CONFIG_FILE="/usr/share/nginx/html/config.js"

if [ -f "$CONFIG_FILE" ]; then
  for var in VITE_API_URL VITE_NIP85_RELAY_URL VITE_WOT_SEARCH_RELAY VITE_TAG_RELAY_URLS VITE_FEATURE_AGENT_SUITE VITE_FEATURE_ASSISTANTS_ADMIN; do
    eval value=\"\$$var\"
    # Escape sed delimiters in value
    escaped=$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')
    sed -i "s|__${var}__|${escaped}|g" "$CONFIG_FILE"
  done
fi

# nginx does not read /etc/resolv.conf, but it needs a resolver to look up the
# brainstorm-og upstream lazily (which is what lets nginx boot when that service
# is absent). The first nameserver here is 127.0.0.11 under compose and the
# kube-dns ClusterIP in k8s, so one line covers both.
: "${OG_RESOLVER:=$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)}"
: "${OG_RESOLVER:=127.0.0.11}"
export OG_RESOLVER

TEMPLATE="/etc/nginx/templates/default.conf.template"
if [ -f "$TEMPLATE" ]; then
  envsubst '${OG_RESOLVER}' < "$TEMPLATE" > /etc/nginx/conf.d/default.conf
fi

exec "$@"
