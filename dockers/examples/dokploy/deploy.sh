#!/usr/bin/env bash
#
# Create a NEW Dokploy project for BomaSheet and deploy it.
#
# Run this from a machine that can reach your Dokploy instance.
#
#   export DOKPLOY_URL=https://dokploy.bomalogic.com
#   export DOKPLOY_API_KEY=...          # do not commit this
#   ./deploy.sh
#
# It creates its own project and touches nothing that already exists on the VPS.
#
# Dokploy's REST surface (/api/*) does not expose project or compose creation --
# only routers carrying OpenAPI metadata appear there, and project/compose/
# application carry none. The tRPC endpoint (/api/trpc/*) does expose them, and
# its context accepts the same x-api-key header, so that is what this uses.

set -euo pipefail

: "${DOKPLOY_URL:?set DOKPLOY_URL, e.g. https://dokploy.bomalogic.com}"
: "${DOKPLOY_API_KEY:?set DOKPLOY_API_KEY}"

PROJECT_NAME="${PROJECT_NAME:-BomaSheet}"
APP_NAME="${APP_NAME:-bomasheet}"
DOMAIN="${DOMAIN:-sheet.bomalogic.com}"
REPO_URL="${REPO_URL:-https://github.com/ABISHAIMWANJA/bomasheet}"
REPO_BRANCH="${REPO_BRANCH:-claude/teable-fork-theme-gbjuzn}"
COMPOSE_PATH="${COMPOSE_PATH:-./dockers/examples/dokploy/docker-compose.yaml}"

# Secrets: generated here if not supplied, so they never live in the repo.
SECRET_KEY="${SECRET_KEY:-$(openssl rand -hex 32)}"
BACKEND_SESSION_SECRET="${BACKEND_SESSION_SECRET:-$(openssl rand -hex 32)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 24)}"
POSTGRES_USER="${POSTGRES_USER:-bomasheet}"
POSTGRES_DB="${POSTGRES_DB:-bomasheet}"

api() {
  # api <procedure> <json-input>
  local procedure="$1" input="$2" response
  response=$(curl -sS --fail-with-body -X POST \
    "${DOKPLOY_URL}/api/trpc/${procedure}" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H 'content-type: application/json' \
    -d "{\"json\":${input}}") || {
      echo "Request to ${procedure} failed:" >&2
      echo "${response}" >&2
      exit 1
    }
  if grep -q '"error"' <<<"${response}"; then
    echo "Dokploy returned an error for ${procedure}:" >&2
    echo "${response}" >&2
    exit 1
  fi
  printf '%s' "${response}"
}

jqr() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

echo "==> Creating project '${PROJECT_NAME}'"
PROJECT_JSON=$(api "project.create" \
  "$(python3 -c "import json;print(json.dumps({'name':'${PROJECT_NAME}','description':'BomaSheet - AGPL fork of Teable'}))")")

ENVIRONMENT_ID=$(jqr "['result']['data']['json']['environment']['environmentId']" <<<"${PROJECT_JSON}")
PROJECT_ID=$(jqr "['result']['data']['json']['project']['projectId']" <<<"${PROJECT_JSON}")
echo "    project=${PROJECT_ID} environment=${ENVIRONMENT_ID}"

echo "==> Creating compose service '${APP_NAME}'"
COMPOSE_JSON=$(api "compose.create" "$(python3 -c "
import json
print(json.dumps({
  'name': '${APP_NAME}',
  'description': 'BomaSheet application stack',
  'environmentId': '${ENVIRONMENT_ID}',
  'composeType': 'docker-compose',
  'appName': '${APP_NAME}',
  'sourceType': 'git',
  'composeFile': '',
}))")")
COMPOSE_ID=$(jqr "['result']['data']['json']['composeId']" <<<"${COMPOSE_JSON}")
echo "    compose=${COMPOSE_ID}"

echo "==> Pointing it at ${REPO_URL} (${REPO_BRANCH})"
export ENV_BLOCK=$(cat <<EOF
PUBLIC_ORIGIN=https://${DOMAIN}
BRAND_NAME=BomaSheet
TIMEZONE=UTC
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
SECRET_KEY=${SECRET_KEY}
BACKEND_SESSION_SECRET=${BACKEND_SESSION_SECRET}
EOF
)
api "compose.update" "$(python3 -c "
import json, os
print(json.dumps({
  'composeId': '${COMPOSE_ID}',
  'sourceType': 'git',
  'customGitUrl': '${REPO_URL}',
  'customGitBranch': '${REPO_BRANCH}',
  'composePath': '${COMPOSE_PATH}',
  'env': os.environ['ENV_BLOCK'],
}))")" >/dev/null
echo "    source and environment set"

echo "==> Attaching domain ${DOMAIN}"
api "domain.create" "$(python3 -c "
import json
print(json.dumps({
  'host': '${DOMAIN}',
  'path': '/',
  'port': 3000,
  'https': True,
  'certificateType': 'letsencrypt',
  'domainType': 'compose',
  'composeId': '${COMPOSE_ID}',
  'serviceName': 'bomasheet',
}))")" >/dev/null

echo "==> Deploying (first build takes several minutes)"
api "compose.deploy" "{\"composeId\":\"${COMPOSE_ID}\"}" >/dev/null

cat <<EOF

Deployment started.

  Project:   ${PROJECT_NAME}
  URL:       https://${DOMAIN}
  Dokploy:   ${DOKPLOY_URL}

Watch the build log in Dokploy. Save these now -- they are not stored anywhere else:

  POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
  SECRET_KEY=${SECRET_KEY}
  BACKEND_SESSION_SECRET=${BACKEND_SESSION_SECRET}

Point ${DOMAIN} at this VPS in DNS before Let's Encrypt will issue a certificate.
EOF
