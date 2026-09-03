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

# --- Site trust signals ------------------------------------------------------
# robots.txt and the Canonical line of security.txt are per-deployment, but the
# image is shared across production, the production alias, and staging. Both are
# therefore written here at container start rather than baked into the build.

# robots.txt — fails CLOSED. Only a deployment that explicitly sets
# ALLOW_INDEXING=true is indexable; everything else disallows crawling, so a
# staging deployment can never compete with production in search results.
ROBOTS_FILE="/usr/share/nginx/html/robots.txt"
if [ "${ALLOW_INDEXING}" = "true" ]; then
  printf 'User-agent: *\nAllow: /\n' > "$ROBOTS_FILE"
else
  printf 'User-agent: *\nDisallow: /\n' > "$ROBOTS_FILE"
fi

# security.txt Canonical — RFC 9116 §2.5.2: if the URL the file was retrieved
# from matches none of its Canonical fields, the contents SHOULD NOT be trusted.
# So the field is appended only when a public hostname is configured, and
# OMITTED otherwise — the field is optional, which makes absence safe and a
# wrong value actively harmful.
#
# CANONICAL_HOSTS accepts a comma- or space-separated LIST, and emits one
# Canonical line per host. This is required, not a convenience: a single
# deployment serves more than one hostname (prod-values.yaml lists both
# brainstorm.nosfabrica.com and brainstorm.world under domains.ui), and a
# document naming only one of them is invalid on the other. RFC 9116 permits
# repeated Canonical fields for exactly this case.
#
# Each host is validated as a bare hostname. A typo that produced a malformed
# URI would invalidate the whole document, so a bad entry is dropped with a
# warning rather than emitted.
SECURITY_FILE="/usr/share/nginx/html/.well-known/security.txt"
if [ -f "$SECURITY_FILE" ]; then
  # Strip first, then append. A container RESTART re-runs this entrypoint
  # against the same writable layer, so appending unconditionally would add a
  # duplicate set of Canonical lines on every restart.
  sed -i '/^Canonical: /d' "$SECURITY_FILE"
fi
if [ -f "$SECURITY_FILE" ] && [ -n "${CANONICAL_HOSTS}" ]; then
  for host in $(printf '%s' "${CANONICAL_HOSTS}" | tr ',' ' '); do
    if printf '%s' "$host" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'; then
      printf 'Canonical: https://%s/.well-known/security.txt\n' "$host" >> "$SECURITY_FILE"
    else
      echo "[entrypoint] WARN: CANONICAL_HOSTS entry '$host' is not a bare hostname; omitting it from security.txt" >&2
    fi
  done
fi
# -----------------------------------------------------------------------------

# nginx does not read /etc/resolv.conf, but it needs a resolver to look up the
# brainstorm-og upstream lazily (which is what lets nginx boot when that service
# is absent). The first nameserver here is 127.0.0.11 under compose and the
# kube-dns ClusterIP in k8s, so one line covers both.
: "${OG_RESOLVER:=$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)}"
: "${OG_RESOLVER:=127.0.0.11}"

# Defaults to the compose service name. Kubernetes MUST override it: the chart
# names the Service `<release>-brainstorm-og`, so the bare name does not resolve
# there — and because an unresolvable upstream falls back to the SPA, getting
# this wrong fails silently as "unfurls don't work".
: "${OG_UPSTREAM:=brainstorm-og:8080}"
export OG_RESOLVER OG_UPSTREAM

TEMPLATE="/etc/nginx/templates/default.conf.template"
if [ -f "$TEMPLATE" ]; then
  envsubst '${OG_RESOLVER} ${OG_UPSTREAM}' < "$TEMPLATE" > /etc/nginx/conf.d/default.conf
fi

exec "$@"
