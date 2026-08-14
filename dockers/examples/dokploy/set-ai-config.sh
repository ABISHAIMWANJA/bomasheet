#!/usr/bin/env bash
#
# Set the OpenAI-compatible credentials used by AI chat and the AI field type,
# on an already-deployed BomaSheet.
#
#   export DOKPLOY_URL=https://dokploy.bomalogic.com
#   export DOKPLOY_API_KEY=...
#   OPENAI_API_KEY=sk-... ./set-ai-config.sh
#
# OPENAI_API_ENDPOINT and AI_FIELD_MODEL are optional and default to OpenAI
# itself and gpt-3.5-turbo; override for a different OpenAI-compatible
# provider or model.

cd "$(dirname "$0")"
# shellcheck source=_lib.sh
source ./_lib.sh

PROJECT_NAME="${PROJECT_NAME:-BomaSheet}"
APP_NAME="${APP_NAME:-bomasheet}"
OPENAI_API_KEY="${OPENAI_API_KEY:?set OPENAI_API_KEY}"
OPENAI_API_ENDPOINT="${OPENAI_API_ENDPOINT:-https://api.openai.com}"
AI_FIELD_MODEL="${AI_FIELD_MODEL:-gpt-3.5-turbo}"

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
NEW_ENV=$(CURRENT="${CURRENT_ENV}" KEY="${OPENAI_API_KEY}" ENDPOINT="${OPENAI_API_ENDPOINT}" MODEL="${AI_FIELD_MODEL}" python3 -c '
import os
lines = os.environ["CURRENT"].splitlines()
wanted = {
    "OPENAI_API_KEY": os.environ["KEY"],
    "OPENAI_API_ENDPOINT": os.environ["ENDPOINT"],
    "AI_FIELD_MODEL": os.environ["MODEL"],
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

echo "==> Setting OPENAI_API_KEY / OPENAI_API_ENDPOINT / AI_FIELD_MODEL"
api "compose.update" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID'], 'env': os.environ['NEW_ENV']}")" >/dev/null

echo "==> Redeploying"
api "compose.redeploy" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")" >/dev/null

echo "Done. AI chat and AI fields should work once the redeploy finishes."
