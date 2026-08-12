#!/bin/sh
set -e

CONFIG_FILE="/usr/share/nginx/html/config.js"

if [ -f "$CONFIG_FILE" ]; then
  for var in VITE_API_URL VITE_NIP85_RELAY_URL VITE_WOT_SEARCH_RELAY VITE_FEATURE_AGENT_SUITE VITE_FEATURE_ASSISTANTS_ADMIN; do
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
# CANONICAL_HOST is validated as a bare hostname before use. A typo that
# produced a malformed URI would invalidate the whole document, so a value that
# does not look like a hostname is dropped (with a warning) rather than emitted.
SECURITY_FILE="/usr/share/nginx/html/.well-known/security.txt"
if [ -f "$SECURITY_FILE" ] && [ -n "${CANONICAL_HOST}" ]; then
  if printf '%s' "${CANONICAL_HOST}" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'; then
    printf 'Canonical: https://%s/.well-known/security.txt\n' "${CANONICAL_HOST}" >> "$SECURITY_FILE"
  else
    echo "[entrypoint] WARN: CANONICAL_HOST='${CANONICAL_HOST}' is not a bare hostname; omitting Canonical from security.txt" >&2
  fi
fi
# -----------------------------------------------------------------------------

exec "$@"
