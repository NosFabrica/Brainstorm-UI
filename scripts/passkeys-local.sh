#!/usr/bin/env bash
# The passkey flows against the real stack, on this machine:
#   Postgres + Redis → brainstorm_server (its migrations, its code) → vite → Playwright.
#
#   npm run e2e:local                     # every flow
#   npm run e2e:local -- -g "B\."         # one flow; arguments go to Playwright
#   npm run e2e:local -- --serve          # just the stack, until Ctrl-C: UI on :5000
#
# Needs: Postgres binaries (initdb, pg_ctl, psql), redis-server, poetry, and a
# brainstorm_server checkout with its dependencies installed (`poetry install`).
# BRAINSTORM_SERVER_DIR points at it (default: ../brainstorm_server); check out
# and pull the branch you want to test first. Nothing persists: the database
# lives in a temporary directory and goes when the run ends.
set -euo pipefail

UI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$(cd "${BRAINSTORM_SERVER_DIR:-$UI_DIR/../brainstorm_server}" && pwd)"
PG_BIN="${PG_BIN:-$(pg_config --bindir 2>/dev/null || echo /usr/lib/postgresql/16/bin)}"
PG_PORT="${PASSKEYS_PG_PORT:-55432}"
REDIS_PORT="${PASSKEYS_REDIS_PORT:-56379}"
API_PORT="${PASSKEYS_API_PORT:-8000}"

for port in 5000 "$API_PORT" "$PG_PORT" "$REDIS_PORT"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "port $port is already in use — stop whatever holds it (a dev server?) and rerun" >&2
    exit 1
  fi
done

WORK="$(mktemp -d -t passkeys-local.XXXXXX)"
PIDS=()
cleanup() {
  # Each service runs in its own process group (setsid): npx and poetry are
  # wrappers, and killing one leaves vite or uvicorn holding the port.
  for pid in "${PIDS[@]}"; do kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done
  redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1 || true
  as_pg "$PG_BIN/pg_ctl" -D "$WORK/pg" -m fast stop >/dev/null 2>&1 || true
  # The database goes; the logs stay for whoever is reading a failure.
  if [ -n "$WORK" ] && [ -d "$WORK/pg" ]; then rm -rf -- "$WORK/pg"; fi
  echo "logs kept in $WORK (server.log, vite.log, pg.log)"
}
trap cleanup EXIT
trap 'exit 130' INT TERM # through EXIT, so Ctrl-C and kill clean up too

# initdb refuses to run as root; hand Postgres to its own user there.
if [ "$(id -u)" = 0 ]; then
  id postgres >/dev/null 2>&1 || useradd --system --no-create-home postgres
  chown postgres "$WORK"
  as_pg() { su postgres -s /bin/bash -c "$(printf '%q ' "$@")"; }
else
  as_pg() { "$@"; }
fi

echo "→ Postgres on :$PG_PORT"
as_pg "$PG_BIN/initdb" -D "$WORK/pg" -U postgres --auth=trust >/dev/null
as_pg "$PG_BIN/pg_ctl" -D "$WORK/pg" -o "-p $PG_PORT -k $WORK" -l "$WORK/pg.log" -w start >/dev/null
psql -h localhost -p "$PG_PORT" -U postgres -qc "create database brainstorm"

echo "→ Redis on :$REDIS_PORT"
redis-server --port "$REDIS_PORT" --save '' --daemonize yes --logfile "$WORK/redis.log"

export DB_URL="postgresql+asyncpg://postgres@localhost:$PG_PORT/brainstorm"
export DEPLOY_ENVIRONMENT=TEST AUTH_ALGORITHM=HS256 AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=60
export AUTH_SECRET_KEY="passkeys-local-$(openssl rand -hex 16)"
export SQL_ADMIN_USERNAME=admin SQL_ADMIN_PASSWORD=admin SQL_ADMIN_SECRET_KEY=admin
# Neo4j and the relays are never reached on these paths; the lifespan that would is skipped.
export NEO4J_DB_URL=bolt://127.0.0.1:9 NEO4J_DB_USERNAME=neo4j NEO4J_DB_PASSWORD=neo4j
export REDIS_HOST=localhost REDIS_PORT="$REDIS_PORT"
export NOSTR_TRANSFER_FROM_RELAY=ws://127.0.0.1:9 NOSTR_TRANSFER_TO_RELAY=ws://127.0.0.1:9
export NOSTR_UPLOAD_TA_EVENTS_RELAY=ws://127.0.0.1:9 NOSTR_UPLOAD_TA_EVENTS_RELAY_PUBLIC_URL=ws://127.0.0.1:9
export CUTOFF_OF_VALID_GRAPERANK_SCORES=0.02 PERFORM_NOSTR_FULL_SYNC=false
export FRONTEND_URL=http://localhost:5000 PUBLIC_BASE_URL="http://localhost:$API_PORT"
export PASSKEY_ORIGINS=http://localhost:5000 TRUSTED_PROXY_HOPS=0

echo "→ brainstorm_server migrations ($SERVER_DIR @ $(git -C "$SERVER_DIR" rev-parse --short HEAD))"
(cd "$SERVER_DIR" && poetry run alembic upgrade head >"$WORK/alembic.log" 2>&1) || {
  cat "$WORK/alembic.log" >&2
  exit 1
}

echo "→ brainstorm_server on :$API_PORT"
(cd "$SERVER_DIR" && PYTHONPATH="$SERVER_DIR" exec setsid poetry run uvicorn --app-dir "$UI_DIR/scripts/passkeys-local" \
  serve_local:app --host 127.0.0.1 --port "$API_PORT" >"$WORK/server.log" 2>&1) &
PIDS+=($!)

echo "→ UI on :5000"
(cd "$UI_DIR" && VITE_API_URL="http://localhost:$API_PORT" VITE_NIP85_RELAY_URL=ws://127.0.0.1:9 \
  VITE_SEARCH_RELAY_URL=ws://127.0.0.1:9 exec setsid npx vite --port 5000 --strictPort >"$WORK/vite.log" 2>&1) &
PIDS+=($!)

wait_for() {
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "$@" && return 0
    sleep 1
  done
  echo "timed out waiting for $*" >&2
  return 1
}
wait_for -X POST "http://localhost:$API_PORT/passkeyVault/challenge"
wait_for "http://localhost:5000/login"

if [ "${1:-}" = "--serve" ]; then
  echo "stack up: UI http://localhost:5000, API http://localhost:$API_PORT, psql -h localhost -p $PG_PORT -U postgres brainstorm"
  echo "Ctrl-C to stop"
  wait
fi

echo "→ Playwright"
cd "$UI_DIR"
PASSKEYS_PG_PORT="$PG_PORT" PASSKEYS_SERVER_LOG="$WORK/server.log" \
  npx playwright test -c e2e/local/playwright.config.ts "$@"
