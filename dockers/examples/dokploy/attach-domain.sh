#!/usr/bin/env bash
#
# Phase 2: attach the real domain once DNS resolves.
#
#   export DOKPLOY_URL=https://dokploy.bomalogic.com
#   export DOKPLOY_API_KEY=...
#   ./attach-domain.sh
#
# Reads the service's current environment and rewrites only PUBLIC_ORIGIN, so
# the secrets generated during deploy.sh are preserved rather than regenerated.

cd "$(dirname "$0")"
# shellcheck source=_lib.sh
source ./_lib.sh

PROJECT_NAME="${PROJECT_NAME:-BomaSheet}"
APP_NAME="${APP_NAME:-bomasheet}"
DOMAIN="${DOMAIN:-sheet.bomalogic.com}"
# Service name inside docker-compose.yaml that Traefik should route to.
SERVICE_NAME="${SERVICE_NAME:-bomasheet}"

echo "==> Checking that ${DOMAIN} resolves"
if ! getent hosts "${DOMAIN}" >/dev/null 2>&1 && ! host "${DOMAIN}" >/dev/null 2>&1; then
  cat >&2 <<EOF
${DOMAIN} does not resolve yet.

Let's Encrypt validates over HTTP, so requesting a certificate now would fail.
Failed validations count against Let's Encrypt's rate limit (5 per hostname per
hour), so repeatedly retrying will lock you out for a while. Add the DNS record
first, wait for it to propagate, then run this again.

To attach the domain anyway (for example if you use a DNS-01 resolver), re-run
with SKIP_DNS_CHECK=1.
EOF
  [ "${SKIP_DNS_CHECK:-0}" = "1" ] || exit 1
  echo "    SKIP_DNS_CHECK=1 set, continuing anyway"
fi

echo "==> Finding compose service '${APP_NAME}' in project '${PROJECT_NAME}'"
COMPOSE_ID=$(find_compose_id "${PROJECT_NAME}" "${APP_NAME}")
echo "    compose=${COMPOSE_ID}"

echo "==> Rewriting PUBLIC_ORIGIN to https://${DOMAIN}"
CURRENT_ENV=$(api "compose.one" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")" \
  | jqr "['result']['data']['json']['env'] or ''")

export NEW_ENV
NEW_ENV=$(CURRENT="${CURRENT_ENV}" DOMAIN="${DOMAIN}" python3 -c '
import os
lines = os.environ["CURRENT"].splitlines()
origin = "PUBLIC_ORIGIN=https://" + os.environ["DOMAIN"]
out, replaced = [], False
for line in lines:
    if line.startswith("PUBLIC_ORIGIN="):
        out.append(origin)
        replaced = True
    else:
        out.append(line)
if not replaced:
    out.append(origin)
print("\n".join(out))
')

api "compose.update" "$(
  CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID'], 'env': os.environ['NEW_ENV']}"
)" >/dev/null

echo "==> Attaching ${DOMAIN} with a Let's Encrypt certificate"
api "domain.create" "$(
  HOST="${DOMAIN}" CID="${COMPOSE_ID}" SVC="${SERVICE_NAME}" pyjson "{
    'host': os.environ['HOST'],
    'path': '/',
    'port': 3000,
    'https': True,
    'certificateType': 'letsencrypt',
    'domainType': 'compose',
    'composeId': os.environ['CID'],
    'serviceName': os.environ['SVC'],
  }"
)" >/dev/null

echo "==> Redeploying so the new origin takes effect"
api "compose.redeploy" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")" >/dev/null

cat <<EOF

Done. BomaSheet should come up at https://${DOMAIN} once the redeploy finishes
and the certificate is issued.

The origin change invalidates existing sessions, so log in again. If the
certificate does not appear within a few minutes, check Traefik's logs in
Dokploy -- the usual cause is DNS not having propagated to Let's Encrypt yet.
EOF
