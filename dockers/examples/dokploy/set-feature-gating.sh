#!/usr/bin/env bash
#
# Control who can see gated features on an already-deployed BomaSheet.
#
# Make a feature admin-only:
#   INSTANCE_ADMIN_EMAILS=you@example.com BETA_FEATURES=aiField ./set-feature-gating.sh
#
# Release a feature to everyone (drop it from BETA_FEATURES):
#   INSTANCE_ADMIN_EMAILS=you@example.com BETA_FEATURES= ./set-feature-gating.sh
#
# There is no admin role in the database -- admins are named by email here, so
# rolling a feature out is a config change and a redeploy, never a migration.

cd "$(dirname "$0")"
# shellcheck source=_lib.sh
source ./_lib.sh

PROJECT_NAME="${PROJECT_NAME:-BomaSheet}"
APP_NAME="${APP_NAME:-bomasheet}"
INSTANCE_ADMIN_EMAILS="${INSTANCE_ADMIN_EMAILS:?set INSTANCE_ADMIN_EMAILS, comma-separated}"
# Intentionally allowed to be empty: empty means nothing is gated any more.
BETA_FEATURES="${BETA_FEATURES-}"

echo "==> Finding compose service '${APP_NAME}' in project '${PROJECT_NAME}'"
COMPOSE_ID=$(find_compose_id "${PROJECT_NAME}" "${APP_NAME}")
echo "    compose=${COMPOSE_ID}"

QUERY_PAYLOAD=$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")
CURRENT_ENV=$(api_query "compose.one" "${QUERY_PAYLOAD}" \
  | jqr "['result']['data']['json']['env'] or ''")
if [ -z "${CURRENT_ENV}" ]; then
  echo "Refusing to continue: read an empty environment. Overwriting it would discard existing secrets." >&2
  exit 1
fi

export NEW_ENV
NEW_ENV=$(CURRENT="${CURRENT_ENV}" ADMINS="${INSTANCE_ADMIN_EMAILS}" BETA="${BETA_FEATURES}" python3 -c '
import os
lines = os.environ["CURRENT"].splitlines()
wanted = {
    "INSTANCE_ADMIN_EMAILS": os.environ["ADMINS"],
    "BETA_FEATURES": os.environ["BETA"],
}
out, seen = [], set()
for line in lines:
    key = line.split("=", 1)[0]
    if key in wanted:
        out.append(f"{key}={wanted[key]}")
        seen.add(key)
    elif line.strip():
        out.append(line)
for key, value in wanted.items():
    if key not in seen:
        out.append(f"{key}={value}")
print("\n".join(out))
')

echo "==> INSTANCE_ADMIN_EMAILS=${INSTANCE_ADMIN_EMAILS}"
echo "==> BETA_FEATURES=${BETA_FEATURES:-(none - all features visible to everyone)}"
api "compose.update" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID'], 'env': os.environ['NEW_ENV']}")" >/dev/null

echo "==> Redeploying"
api "compose.redeploy" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")" >/dev/null

echo "Done. Sign out and back in for the change to take effect."
