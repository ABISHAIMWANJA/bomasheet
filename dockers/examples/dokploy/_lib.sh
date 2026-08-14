#!/usr/bin/env bash
# Shared helpers for the Dokploy scripts. Not meant to be run directly.
#
# Dokploy's REST surface (/api/*) only exposes procedures carrying OpenAPI
# metadata, and the project/compose/application routers carry none. The tRPC
# endpoint (/api/trpc/*) does expose them and its context accepts the same
# x-api-key header, so everything here targets tRPC.

set -euo pipefail

: "${DOKPLOY_URL:?set DOKPLOY_URL, e.g. https://dokploy.bomalogic.com}"
: "${DOKPLOY_API_KEY:?set DOKPLOY_API_KEY}"

DOKPLOY_URL="${DOKPLOY_URL%/}"

# tRPC transport: MUTATIONS are POST with a JSON body, QUERIES are GET with the
# input URL-encoded into ?input=. Sending a query as POST returns 405.

# api_query <procedure> [json-input] -> raw response on stdout
api_query() {
  local procedure="$1" input="${2:-}" url response status
  url="${DOKPLOY_URL}/api/trpc/${procedure}"
  if [ -n "${input}" ] && [ "${input}" != "null" ]; then
    local encoded
    encoded=$(printf '{"json":%s}' "${input}" \
      | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read().strip(),safe=""))')
    url="${url}?input=${encoded}"
  fi
  set +e
  response=$(curl -sS -X GET "${url}" -H "x-api-key: ${DOKPLOY_API_KEY}" 2>&1)
  status=$?
  set -e
  if [ ${status} -ne 0 ]; then
    echo "Could not reach ${DOKPLOY_URL} (curl exit ${status}):" >&2
    echo "${response}" >&2
    exit 1
  fi
  if printf '%s' "${response}" | grep -q '"error"'; then
    echo "Dokploy returned an error for ${procedure}:" >&2
    printf '%s\n' "${response}" >&2
    exit 1
  fi
  printf '%s' "${response}"
}

# api <procedure> <json-input> -> raw response on stdout (mutations only)
api() {
  local procedure="$1" input="$2" response status
  set +e
  response=$(curl -sS -X POST \
    "${DOKPLOY_URL}/api/trpc/${procedure}" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H 'content-type: application/json' \
    -d "{\"json\":${input}}" 2>&1)
  status=$?
  set -e
  if [ ${status} -ne 0 ]; then
    echo "Could not reach ${DOKPLOY_URL} (curl exit ${status}):" >&2
    echo "${response}" >&2
    exit 1
  fi
  if printf '%s' "${response}" | grep -q '"error"'; then
    echo "Dokploy returned an error for ${procedure}:" >&2
    printf '%s\n' "${response}" >&2
    exit 1
  fi
  printf '%s' "${response}"
}

# jqr <python-index-expression> ; reads JSON on stdin
jqr() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

# pyjson <python-expression-producing-a-dict>
pyjson() { python3 -c "import json,os; print(json.dumps($1))"; }

# find_compose_id <project-name> <service-name>
find_compose_id() {
  local project_name="$1" service_name="$2"
   api_query "project.all" | PROJECT="${project_name}" SERVICE="${service_name}" python3 -c '
import json, os, sys
data = json.load(sys.stdin)["result"]["data"]["json"]
project_name, service_name = os.environ["PROJECT"], os.environ["SERVICE"]
for project in data:
    if project.get("name") != project_name:
        continue
    for env in project.get("environments", []):
        for svc in env.get("compose", []):
            if svc.get("name") == service_name:
                print(svc["composeId"])
                sys.exit(0)
sys.exit(f"No compose service {service_name!r} in project {project_name!r}")
'
}

# find_environment_id <project-name>
find_environment_id() {
  local project_name="$1"
  api_query "project.all" | PROJECT="${project_name}" python3 -c '
import json, os, sys
data = json.load(sys.stdin)["result"]["data"]["json"]
project_name = os.environ["PROJECT"]
for project in data:
    if project.get("name") != project_name:
        continue
    envs = project.get("environments", [])
    if envs:
        print(envs[0]["environmentId"])
        sys.exit(0)
sys.exit(f"No environment found in project {project_name!r}")
'
}
