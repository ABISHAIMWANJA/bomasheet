#!/usr/bin/env bash
#
# Set (or change) the free-tier row cap on an already-deployed BomaSheet.
#
#   export DOKPLOY_URL=https://dokploy.bomalogic.com
#   export DOKPLOY_API_KEY=...
#   MAX_FREE_ROW_LIMIT=1000 ./set-row-limit.sh
#
# This mechanism already ships in Teable's backend (record.service.ts
# creditCheck(), gated on the space.credit column) but is disabled by default
# (0 = unlimited). This script only sets the env var that turns it on -- it
# does not touch anything else in the environment, and does not affect any
# individual space that already has its own `credit` override set.

cd "$(dirname "$0")"
# shellcheck source=_lib.sh
source ./_lib.sh

PROJECT_NAME="${PROJECT_NAME:-BomaSheet}"
APP_NAME="${APP_NAME:-bomasheet}"
MAX_FREE_ROW_LIMIT="${MAX_FREE_ROW_LIMIT:?set MAX_FREE_ROW_LIMIT, e.g. 1000. Use 0 to disable.}"

echo "==> Finding compose service '${APP_NAME}' in project '${PROJECT_NAME}'"
COMPOSE_ID=$(find_compose_id "${PROJECT_NAME}" "${APP_NAME}")
echo "    compose=${COMPOSE_ID}"

CURRENT_ENV=$(api_query "compose.one" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")" \
  | jqr "['result']['data']['json']['env'] or ''")
if [ -z "${CURRENT_ENV}" ]; then
  echo "Refusing to continue: read an empty environment. Overwriting it would discard existing secrets." >&2
  exit 1
fi

export NEW_ENV
NEW_ENV=$(CURRENT="${CURRENT_ENV}" LIMIT="${MAX_FREE_ROW_LIMIT}" python3 -c '
import os
lines = os.environ["CURRENT"].splitlines()
setting = "MAX_FREE_ROW_LIMIT=" + os.environ["LIMIT"]
out, replaced = [], False
for line in lines:
    if line.startswith("MAX_FREE_ROW_LIMIT="):
        out.append(setting); replaced = True
    elif line.strip():
        out.append(line)
if not replaced:
    out.append(setting)
print("\n".join(out))
')

echo "==> Setting MAX_FREE_ROW_LIMIT=${MAX_FREE_ROW_LIMIT}"
api "compose.update" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID'], 'env': os.environ['NEW_ENV']}")" >/dev/null

echo "==> Redeploying"
api "compose.redeploy" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")" >/dev/null

if [ "${MAX_FREE_ROW_LIMIT}" = "0" ]; then
  echo "Done. Row limit disabled -- spaces are unlimited unless they have their own space.credit override."
else
  echo "Done. New spaces are capped at ${MAX_FREE_ROW_LIMIT} rows unless their space.credit is set individually."
fi
