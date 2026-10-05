#!/usr/bin/env bash
# Smoke test of a running production stack (`docker compose up -d`), also run in CI.
# It creates a first (admin) account, so use it on a new installation or a throwaway stack.
#   docker/smoke-test.sh [base-url]        default: http://localhost:8080
set -euo pipefail

BASE="${1:-http://localhost:8080}"
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

# Migrations ran to completion before the apps started.
migrate_id=$(docker compose ps -a -q migrate)
[ -n "$migrate_id" ] || fail "no migrate container"
[ "$(docker inspect -f '{{.State.ExitCode}}' "$migrate_id")" = "0" ] || fail "migrations did not succeed"
ok "migrations applied"

# The app answers through the reverse proxy.
code=000
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/login" || true)
  [ "$code" = "200" ] && break
  sleep 3
done
[ "$code" = "200" ] || fail "/login answered $code instead of 200"
ok "login page served"

# Security headers from the app.
headers=$(curl -sI "$BASE/login")
echo "$headers" | grep -qi "^content-security-policy:.*'nonce-" || fail "no nonce-based Content-Security-Policy"
echo "$headers" | grep -qi '^x-content-type-options: nosniff' || fail "no X-Content-Type-Options"
echo "$headers" | grep -qi '^x-frame-options: sameorigin' || fail "no X-Frame-Options"
ok "security headers present"

# Real-time notes: a WebSocket upgrade reaches the collab server...
upgrade=$(curl -s -i --http1.1 -m 4 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  -H "Origin: $BASE" "$BASE/collab" || true)
echo "$upgrade" | head -1 | grep -q '101' || fail "WebSocket upgrade on /collab failed: $(echo "$upgrade" | head -1)"
ok "collab WebSocket reachable"

# ...but its internal HTTP API is not exposed.
internal=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/collab/internal/projects/x/versions" || true)
[ "$internal" = "404" ] || fail "collab internal API answered $internal instead of 404"
ok "collab internal API not exposed"

# First sign-up becomes the admin; a backup then proves the database dump works in the image.
jar=$(mktemp)
trap 'rm -f "$jar"' EXIT
curl -fsS -c "$jar" -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Admin","email":"smoke.admin@example.com","password":"smoke-test-password-1"}' \
  "$BASE/api/auth/sign-up/email" >/dev/null || fail "sign-up of the first account"
ok "first account created"

backup=$(curl -fsS -b "$jar" -H "Origin: $BASE" -X POST "$BASE/api/admin/backups") || fail "backup request"
echo "$backup" | grep -q '"dumpError":null' || fail "backup without database dump: $backup"
ok "backup made (archive and database dump)"

docker compose exec -T web pg_dump --version >/dev/null || fail "pg_dump missing in the web image"
echo "All checks passed."
