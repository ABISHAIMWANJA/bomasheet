#!/usr/bin/env bash
#
# Deploy BomaClaw (the Telegram bot) as a sibling service inside the existing
# BomaSheet Dokploy project. Requires BomaSheet to already be deployed --
# this looks up the existing project by name rather than creating one.
#
#   export DOKPLOY_URL=https://dokploy.bomalogic.com
#   export DOKPLOY_API_KEY=...
#   export TELEGRAM_BOT_TOKEN=...      # from @BotFather
#   ./deploy-bomaclaw.sh
#
# OPENAI_API_KEY/OPENAI_API_ENDPOINT are reused from BomaSheet's own config if
# you've already run set-ai-config.sh; override here if this bot should use a
# different provider or model.

cd "$(dirname "$0")"
# shellcheck source=_lib.sh
source ./_lib.sh

PROJECT_NAME="${PROJECT_NAME:-BomaSheet}"
APP_NAME="${APP_NAME:-bomasheet}"
BOT_APP_NAME="${BOT_APP_NAME:-bomaclaw}"
REPO_URL="${REPO_URL:-https://github.com/ABISHAIMWANJA/bomasheet}"
REPO_BRANCH="${REPO_BRANCH:-claude/teable-fork-theme-gbjuzn}"
COMPOSE_PATH="${COMPOSE_PATH:-./dockers/examples/dokploy/bomaclaw/docker-compose.yaml}"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:?set TELEGRAM_BOT_TOKEN, from @BotFather}"
BOMACLAW_ENCRYPTION_KEY="${BOMACLAW_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
OPENAI_API_KEY="${OPENAI_API_KEY:?set OPENAI_API_KEY -- the same key BomaSheet AI features use}"
OPENAI_API_ENDPOINT="${OPENAI_API_ENDPOINT:-https://api.openai.com}"
AI_FIELD_MODEL="${AI_FIELD_MODEL:-gpt-3.5-turbo}"

echo "==> Finding existing project '${PROJECT_NAME}'"
ENVIRONMENT_ID=$(find_environment_id "${PROJECT_NAME}")
echo "    environment=${ENVIRONMENT_ID}"

echo "==> Finding BomaSheet's public origin (so the bot calls the right instance)"
BOMASHEET_COMPOSE_ID=$(find_compose_id "${PROJECT_NAME}" "${APP_NAME}")
BOMASHEET_QUERY_PAYLOAD=$(CID="${BOMASHEET_COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")
BOMASHEET_ENV=$(api_query "compose.one" "${BOMASHEET_QUERY_PAYLOAD}" \
  | jqr "['result']['data']['json']['env'] or ''")
BOMASHEET_ORIGIN=$(BOMASHEET_ENV="${BOMASHEET_ENV}" python3 -c "
import os
for line in os.environ['BOMASHEET_ENV'].splitlines():
    if line.startswith('PUBLIC_ORIGIN='):
        print(line.split('=', 1)[1]); break
")
if [ -z "${BOMASHEET_ORIGIN}" ]; then
  echo "Could not find PUBLIC_ORIGIN on the '${APP_NAME}' service -- deploy BomaSheet first." >&2
  exit 1
fi
echo "    ${BOMASHEET_ORIGIN}"

echo "==> Creating compose service '${BOT_APP_NAME}'"
COMPOSE_JSON=$(api "compose.create" "$(
  APP="${BOT_APP_NAME}" ENVID="${ENVIRONMENT_ID}" pyjson "{
    'name': os.environ['APP'],
    'description': 'BomaClaw Telegram bot',
    'environmentId': os.environ['ENVID'],
    'composeType': 'docker-compose',
    'appName': os.environ['APP'],
    'sourceType': 'git',
    'composeFile': '',
  }"
)")
COMPOSE_ID=$(jqr "['result']['data']['json']['composeId']" <<<"${COMPOSE_JSON}")
echo "    compose=${COMPOSE_ID}"

echo "==> Pointing it at ${REPO_URL} (${REPO_BRANCH})"
export ENV_BLOCK="TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
BOMASHEET_ORIGIN=${BOMASHEET_ORIGIN}
BOMACLAW_ENCRYPTION_KEY=${BOMACLAW_ENCRYPTION_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_API_ENDPOINT=${OPENAI_API_ENDPOINT}
AI_FIELD_MODEL=${AI_FIELD_MODEL}"

api "compose.update" "$(
  CID="${COMPOSE_ID}" URL="${REPO_URL}" BRANCH="${REPO_BRANCH}" CPATH="${COMPOSE_PATH}" \
  pyjson "{
    'composeId': os.environ['CID'],
    'sourceType': 'git',
    'customGitUrl': os.environ['URL'],
    'customGitBranch': os.environ['BRANCH'],
    'composePath': os.environ['CPATH'],
    'env': os.environ['ENV_BLOCK'],
  }"
)" >/dev/null
echo "    source and environment set"

echo "==> Deploying"
api "compose.deploy" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")" >/dev/null

cat <<EOF

Deployment started. Watch the build log in Dokploy.

  Service: ${BOT_APP_NAME}
  Talks to: ${BOMASHEET_ORIGIN}

Save this now -- it is not stored anywhere else:

  BOMACLAW_ENCRYPTION_KEY=${BOMACLAW_ENCRYPTION_KEY}

Once it's running, open Telegram, find your bot (the username you set with
@BotFather), and send /start.
EOF
