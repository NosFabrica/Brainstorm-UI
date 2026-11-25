#!/bin/sh
set -e

# Overridable only so the test (client/src/test/dockerEntrypoint.test.ts) can run
# this against a scratch copy; the image always uses the defaults.
UI_HTML_ROOT="${UI_HTML_ROOT:-/usr/share/nginx/html}"
UI_NGINX_ETC="${UI_NGINX_ETC:-/etc/nginx}"

CONFIG_FILE="$UI_HTML_ROOT/config.js"

if [ -f "$CONFIG_FILE" ]; then
  for var in VITE_API_URL VITE_NIP85_RELAY_URL VITE_SEARCH_RELAY_URL VITE_TAG_RELAY_URLS VITE_FEATURE_AGENT_SUITE VITE_FEATURE_ASSISTANTS_ADMIN VITE_IMG_PROXY VITE_PUBLIC_ORIGIN VITE_HOUSE_OBSERVER; do
    eval value=\"\$$var\"
    # Escape sed delimiters in value
    escaped=$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')
    sed -i "s|__${var}__|${escaped}|g" "$CONFIG_FILE"
  done
fi

# --- Preconnect hints --------------------------------------------------------
# The app talks to the API and the relays on origins only known at deploy time,
# so index.html carries a marker the build cannot fill. Same env as config.js;
# wss:// origins preconnect over https:// — same host, same TCP + TLS.
PRECONNECT=""
for url in "$VITE_API_URL" "$VITE_SEARCH_RELAY_URL" "$VITE_NIP85_RELAY_URL"; do
  [ -n "$url" ] || continue
  origin=$(printf '%s' "$url" | sed -e 's|^ws|http|' -e 's|\(https\{0,1\}://[^/]*\).*|\1|')
  case "$PRECONNECT" in *"\"$origin\""*) continue ;; esac
  PRECONNECT="${PRECONNECT}<link rel=\"preconnect\" href=\"$origin\" crossorigin>"
done

if [ -n "$PRECONNECT" ]; then
  escaped=$(printf '%s' "$PRECONNECT" | sed -e 's/[\/&|]/\\&/g')
  for page in index 200 404; do
    file="$UI_HTML_ROOT/${page}.html"
    [ -f "$file" ] && sed -i "s|<!--PRECONNECT-->|${escaped}|" "$file"
  done
fi

# --- Inline config -----------------------------------------------------------
# <script src="/config.js"> is parser-blocking: every page load paid a round trip
# for it before anything else in <head> ran (and up to the worker's 4s slow-
# network wait on a flaky link). So the pages carry config.js's contents inline,
# between markers index.html keeps for it; config.js itself stays, for the APK
# (which has no entrypoint and loads it from the tag the markers hold), the
# service worker's install list, and anything else that reads it.
#
# The inline copy IS config.js as substituted above, so the two can't disagree
# and no value is re-quoted here. Only `<` is rewritten, to `\x3C`: every value
# sits inside a JS string, where that escape reads back as `<`, and without it a
# value containing `</script>` or `<!--` would end the script early in HTML.
#
# The markers stay around the inline copy, so a container restart replaces it
# again rather than finding nothing to replace.
if [ -f "$CONFIG_FILE" ]; then
  INLINE_CONFIG=$(mktemp)
  sed -e 's/</\\x3C/g' "$CONFIG_FILE" > "$INLINE_CONFIG"
  for page in index 200 404; do
    file="$UI_HTML_ROOT/${page}.html"
    [ -f "$file" ] && grep -q '<!--CONFIG-START-->' "$file" || continue
    awk -v config="$INLINE_CONFIG" '
      /<!--CONFIG-START-->/ {
        print "<!--CONFIG-START--><script>"
        while ((getline line < config) > 0) print line
        close(config)
        print "</script><!--CONFIG-END-->"
        skip = 1
      }
      skip && /<!--CONFIG-END-->/ { skip = 0; next }
      !skip { print }
    ' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  done
  rm -f "$INLINE_CONFIG"
fi

# --- Security headers --------------------------------------------------------
# Every response carries these (nginx.conf includes the file at server level and
# in each location with an add_header of its own, since a location that adds
# any header inherits none). Written here rather than in nginx.conf because the
# policy names the page's inline scripts by their SHA-256, and one of them, the
# inline config above, is only known now.
#
# CSP_MODE: `enforce` (the default), `report-only` (the browser reports a
# violation in the console and blocks nothing: the switch to flip if a deploy
# turns out to need something the policy refuses), or `off`.
#
# What the app reaches, and why each source list is what it is:
#   script-src   our own files, the inline scripts by hash, and wasm (the
#                signature verifier compiles nostr-wasm from bytes).
#   style-src    'unsafe-inline': Radix and the toast/charts libraries set
#                style attributes and inject <style>; CSS can't run script.
#   connect-src  https: and wss:. Relays, NIP-05, LNURL, Blossom servers and
#                link previews are wherever their owners put them.
#   img/media    any web address, data: and blob: (pictures and voice notes
#                come from anyone's host; DM attachments are blob: URLs).
#   frame-src    https: (YouTube, Twitch, zap.stream, OpenStreetMap players).
#   frame-ancestors 'none': nobody frames the page that holds a reader's keys.
HEADERS_FILE="$UI_NGINX_ETC/security-headers.conf"
CSP_MODE="${CSP_MODE:-enforce}"

# The base64 SHA-256 of every inline <script> in the pages, one per line: the
# CSP's 'sha256-…' sources. Byte-exact (LC_ALL=C): the hash is of the text
# between <script …> and </script>, as the browser sees it. Comments are
# skipped, so a `<script` written in one is not taken for a script; a script
# with a src, or a data block (a type that isn't JavaScript), needs no hash.
inline_script_hashes() {
  scratch=$(mktemp -d)
  n=0
  for page in index 200 404; do
    file="$UI_HTML_ROOT/${page}.html"
    [ -f "$file" ] || continue
    n=$((n + 1))
    LC_ALL=C awk -v out="$scratch/$n" '
      { doc = doc $0 "\n" }
      END {
        count = 0
        rest = doc
        for (;;) {
          s = index(rest, "<script")
          c = index(rest, "<!--")
          if (c > 0 && (s == 0 || c < s)) {
            rest = substr(rest, c + 4)
            e = index(rest, "-->")
            if (e == 0) break
            rest = substr(rest, e + 3)
            continue
          }
          if (s == 0) break
          rest = substr(rest, s)
          t = index(rest, ">")
          if (t == 0) break
          tag = tolower(substr(rest, 1, t))
          rest = substr(rest, t + 1)
          k = index(rest, "</script>")
          if (k == 0) break
          body = substr(rest, 1, k - 1)
          rest = substr(rest, k + 9)
          if (tag ~ /[ \t\n]src[ \t\n]*=/) continue
          if (tag ~ /[ \t\n]type[ \t\n]*=/ && tag !~ /type[ \t\n]*=[ \t\n]*"?(text\/javascript|module|application\/javascript)"?[ \t\n>]/) continue
          count++
          f = out "." count
          printf "%s", body > f
          close(f)
        }
      }
    ' "$file"
  done
  for f in "$scratch"/*; do
    [ -f "$f" ] || continue
    sha256sum "$f" | LC_ALL=C awk '
      BEGIN { H = "0123456789abcdef"; B = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/" }
      {
        hex = tolower($1); out = ""
        for (i = 1; i <= length(hex); i += 6) {
          chunk = substr(hex, i, 6); bytes = length(chunk) / 2; v = 0
          for (j = 1; j <= length(chunk); j++) v = v * 16 + index(H, substr(chunk, j, 1)) - 1
          for (j = bytes; j < 3; j++) v = v * 256
          out = out substr(B, int(v / 262144) % 64 + 1, 1) substr(B, int(v / 4096) % 64 + 1, 1)
          out = out (bytes > 1 ? substr(B, int(v / 64) % 64 + 1, 1) : "=") (bytes > 2 ? substr(B, v % 64 + 1, 1) : "=")
        }
        print out
      }'
  done | sort -u
  rm -rf "$scratch"
}

SCRIPT_SOURCES="'self' 'wasm-unsafe-eval'"
for hash in $(inline_script_hashes); do
  SCRIPT_SOURCES="$SCRIPT_SOURCES 'sha256-$hash'"
done
CSP="default-src 'self'; script-src $SCRIPT_SOURCES; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:; media-src 'self' https: http: data: blob:; font-src 'self' data:; connect-src 'self' https: wss: data: blob:; frame-src 'self' https:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

{
  case "$CSP_MODE" in
    off) ;;
    report-only) echo "add_header Content-Security-Policy-Report-Only \"$CSP\" always;" ;;
    *) echo "add_header Content-Security-Policy \"$CSP\" always;" ;;
  esac
  echo 'add_header X-Content-Type-Options "nosniff" always;'
  echo 'add_header X-Frame-Options "DENY" always;'
  echo 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;'
  echo 'add_header Permissions-Policy "camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), serial=(), hid=(), midi=(), display-capture=()" always;'
  echo 'add_header Strict-Transport-Security "max-age=31536000" always;'
} > "$HEADERS_FILE"
# -----------------------------------------------------------------------------

# --- Site trust signals ------------------------------------------------------
# robots.txt and the Canonical line of security.txt are per-deployment, but the
# image is shared across production, the production alias, and staging. Both are
# therefore written here at container start rather than baked into the build.

# robots.txt — fails CLOSED. Only a deployment that explicitly sets
# ALLOW_INDEXING=true is indexable; everything else disallows crawling, so a
# staging deployment can never compete with production in search results.
ROBOTS_FILE="$UI_HTML_ROOT/robots.txt"
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
SECURITY_FILE="$UI_HTML_ROOT/.well-known/security.txt"
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
# Same rules as OG_UPSTREAM: FQDN under Kubernetes. Unreachable → /img/ redirects to the original.
: "${IMG_UPSTREAM:=imgproxy:8080}"

# Trusted proxy hops for /img/'s per-IP rate limit. Always written, empty when
# unset, because nginx cannot conditionally include a file that may not exist.
REALIP_FILE="$UI_NGINX_ETC/img-realip.conf"
: > "$REALIP_FILE"
if [ -n "${IMG_TRUSTED_CIDR}" ]; then
  for cidr in $(printf '%s' "${IMG_TRUSTED_CIDR}" | tr ',' ' '); do
    echo "set_real_ip_from ${cidr};" >> "$REALIP_FILE"
  done
  {
    echo "real_ip_header X-Forwarded-For;"
    echo "real_ip_recursive on;"
  } >> "$REALIP_FILE"
fi
export OG_RESOLVER OG_UPSTREAM IMG_UPSTREAM IMG_REFERER_HOSTS

TEMPLATE="$UI_NGINX_ETC/templates/default.conf.template"
if [ -f "$TEMPLATE" ]; then
  envsubst '${OG_RESOLVER} ${OG_UPSTREAM} ${IMG_UPSTREAM} ${IMG_REFERER_HOSTS}' < "$TEMPLATE" > "$UI_NGINX_ETC/conf.d/default.conf"
fi

exec "$@"
