#!/usr/bin/env bash
#
# Phase 1: create a NEW Dokploy project for BomaSheet and deploy it.
#
# No DNS required. The app is published on port 3000 of the VPS, so you can use
# it immediately and attach a real domain later with ./attach-domain.sh.
#
#   export DOKPLOY_URL=https://dokploy.bomalogic.com
#   export DOKPLOY_API_KEY=...          # do not commit this
#   ./deploy.sh
#
# Creates its own project and touches nothing already on the VPS.

cd "$(dirname "$0")"
# shellcheck source=_lib.sh
source ./_lib.sh

PROJECT_NAME="${PROJECT_NAME:-BomaSheet}"
APP_NAME="${APP_NAME:-bomasheet}"
REPO_URL="${REPO_URL:-https://github.com/ABISHAIMWANJA/bomasheet}"
REPO_BRANCH="${REPO_BRANCH:-claude/teable-fork-theme-gbjuzn}"
COMPOSE_PATH="${COMPOSE_PATH:-./dockers/examples/dokploy/docker-compose.yaml}"

# Where users reach the app during phase 1. Defaults to the VPS on port 3000,
# addressed by the hostname your Dokploy panel already resolves to, so no new
# DNS record is needed. attach-domain.sh rewrites this later.
DOKPLOY_HOST="${DOKPLOY_URL#*://}"
DOKPLOY_HOST="${DOKPLOY_HOST%%/*}"
# Must match docker-compose.yaml's published host port for the app service.
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-http://${DOKPLOY_HOST}:3010}"

# Secrets: generated here if not supplied, so they never live in the repo.
SECRET_KEY="${SECRET_KEY:-$(openssl rand -hex 32)}"
BACKEND_SESSION_SECRET="${BACKEND_SESSION_SECRET:-$(openssl rand -hex 32)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 24)}"
POSTGRES_USER="${POSTGRES_USER:-bomasheet}"
POSTGRES_DB="${POSTGRES_DB:-bomasheet}"

# Free-tier row cap per space. This mechanism already exists in Teable
# (record.service.ts creditCheck(), gated on space.credit) but ships disabled
# upstream (default 0 = unlimited). 0 keeps that upstream behavior; set to
# match whatever free-tier row count you're offering. A space's individual
# `credit` column, when set, overrides this default for that one space --
# that's the lever for comping a specific customer more rows later.
MAX_FREE_ROW_LIMIT="${MAX_FREE_ROW_LIMIT:-1000}"

# AI chat and the AI field type both need an OpenAI-compatible endpoint. Left
# empty by default -- both features error clearly rather than silently doing
# nothing when unset. Set via ./set-ai-config.sh once you have a key, for a
# fresh deploy or one already running.
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
OPENAI_API_ENDPOINT="${OPENAI_API_ENDPOINT:-https://api.openai.com}"
AI_FIELD_MODEL="${AI_FIELD_MODEL:-gpt-3.5-turbo}"

# Instance-level feature gating. Emails listed here see features named in
# BETA_FEATURES; everyone else does not, until a name is removed from that
# list. There is no admin role in the database -- this is config only, so
# rolling a feature out is an env change, not a schema change.
INSTANCE_ADMIN_EMAILS="${INSTANCE_ADMIN_EMAILS:-}"
BETA_FEATURES="${BETA_FEATURES:-aiField}"

echo "==> Creating project '${PROJECT_NAME}'"
PROJECT_JSON=$(api "project.create" "$(
  NAME="${PROJECT_NAME}" pyjson "{'name': os.environ['NAME'], 'description': 'BomaSheet - AGPL fork of Teable'}"
)")
PROJECT_ID=$(jqr "['result']['data']['json']['project']['projectId']" <<<"${PROJECT_JSON}")
ENVIRONMENT_ID=$(jqr "['result']['data']['json']['environment']['environmentId']" <<<"${PROJECT_JSON}")
echo "    project=${PROJECT_ID}"
echo "    environment=${ENVIRONMENT_ID}"

echo "==> Creating compose service '${APP_NAME}'"
COMPOSE_JSON=$(api "compose.create" "$(
  APP="${APP_NAME}" ENVID="${ENVIRONMENT_ID}" pyjson "{
    'name': os.environ['APP'],
    'description': 'BomaSheet application stack',
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
export ENV_BLOCK="PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
BRAND_NAME=BomaSheet
TIMEZONE=UTC
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
SECRET_KEY=${SECRET_KEY}
BACKEND_SESSION_SECRET=${BACKEND_SESSION_SECRET}
MAX_FREE_ROW_LIMIT=${MAX_FREE_ROW_LIMIT}
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_API_ENDPOINT=${OPENAI_API_ENDPOINT}
AI_FIELD_MODEL=${AI_FIELD_MODEL}
INSTANCE_ADMIN_EMAILS=${INSTANCE_ADMIN_EMAILS}
BETA_FEATURES=${BETA_FEATURES}"

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

echo "==> Deploying (first build takes several minutes)"
api "compose.deploy" "$(CID="${COMPOSE_ID}" pyjson "{'composeId': os.environ['CID']}")" >/dev/null

cat <<EOF

Deployment started. Watch the build log in Dokploy.

  Project:  ${PROJECT_NAME}
  Service:  ${APP_NAME}
  Reach it: ${PUBLIC_ORIGIN}

Save these now -- they are not stored anywhere else:

  POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
  SECRET_KEY=${SECRET_KEY}
  BACKEND_SESSION_SECRET=${BACKEND_SESSION_SECRET}

No DNS was needed and no domain was attached. Once your DNS provider is back and
sheet.bomalogic.com resolves to this VPS, run:

  ./attach-domain.sh

That switches PUBLIC_ORIGIN to the real domain, requests the certificate, and
redeploys. Existing sessions are invalidated by the origin change, so you will
log in again -- harmless now, which is exactly why it is worth doing before you
have users.
EOF
