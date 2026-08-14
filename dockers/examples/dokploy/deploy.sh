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
BACKEND_SESSION_SECRET=${BACKEND_SESSION_SECRET}"

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
