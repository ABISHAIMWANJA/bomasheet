# Deploying BomaSheet on Dokploy

This directory deploys BomaSheet as a Dokploy **Compose** service, built from
source.

## Why build from source

`dockers/examples/standalone` pulls `ghcr.io/teableio/teable:latest`. That is the
*upstream* image — stock Teable, with none of the BomaSheet branding or theme.
Deploying it would silently ship the wrong product. The compose file here builds
from this repository instead, which is slower on first deploy (several minutes)
but is what makes the deployment actually BomaSheet.

## Setup

1. In Dokploy, create a **Compose** service.
2. Point it at this repository and branch, with compose path
   `dockers/examples/dokploy/docker-compose.yaml`.
3. Add the environment variables below.
4. Attach your domain to the `bomasheet` service on port `3000`.
5. Deploy.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | yes | Public URL, e.g. `https://app.bomasheet.com`. Must include the scheme and match the domain exactly. |
| `POSTGRES_DB` | yes | e.g. `bomasheet` |
| `POSTGRES_USER` | yes | e.g. `bomasheet` |
| `POSTGRES_PASSWORD` | yes | Generate one; do not reuse the example value. |
| `SECRET_KEY` | yes | Falls back to the literal `defaultSecretKey` in code if unset. Always set it. |
| `BACKEND_SESSION_SECRET` | yes | Signs session cookies. |
| `BRAND_NAME` | no | Defaults to `BomaSheet`. |
| `TIMEZONE` | no | Defaults to `UTC`. |
| `BACKEND_MAIL_*` | no | Needed for invites and password resets. Without it those flows fail. |

Generate secrets with:

```sh
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## Things that will bite you

**`PUBLIC_ORIGIN` must match the real domain.** Auth cookies and asset URLs are
derived from it. If it is wrong, login appears to succeed and then bounces.

**`BRAND_NAME` is the auth cookie prefix.** It is lower-cased and used as the
cookie prefix in `apps/nestjs-backend/src/configs/auth.config.ts`. Changing it
after launch logs out every user. Settle on it now.

**First build is slow.** The Dockerfile installs the full pnpm workspace and
builds Next.js. Give it headroom — a small VPS may need swap, and Dokploy's
default build timeout may need raising.

**AGPL-3.0 section 13.** Once this is reachable over a network, users are
entitled to the source of *this* build. The settings sidebar links to
`SOURCE_CODE_URL` in `apps/nextjs-app/src/lib/brand.ts` — keep that pointing at a
repository that reflects what you actually deploy.

## Deploying in two phases

DNS is only needed for the Let's Encrypt challenge — the build and the app do
not care. So you can deploy now and attach the domain whenever your registrar
is available.

### Phase 1 — deploy now, no DNS

```sh
export DOKPLOY_URL=https://dokploy.bomalogic.com
export DOKPLOY_API_KEY=...        # never commit this
./deploy.sh
```

Creates a **new** project, adds a compose service pointed at this repository and
branch, generates `SECRET_KEY`, `BACKEND_SESSION_SECRET` and the database
password, and deploys. Nothing already on the VPS is touched.

No domain is attached. `PUBLIC_ORIGIN` defaults to the VPS on port `3000`,
addressed by the hostname your Dokploy panel already resolves to, so the app is
usable immediately without a new DNS record. The generated secrets are printed
once — save them.

### Phase 2 — attach the domain when DNS is ready

```sh
./attach-domain.sh
```

Rewrites **only** `PUBLIC_ORIGIN` in the service's existing environment, so the
secrets from phase 1 are preserved rather than regenerated. Then it requests the
certificate and redeploys.

It refuses to run if the domain does not resolve yet. That guard is deliberate:
Let's Encrypt counts failed validations against a limit of 5 per hostname per
hour, so firing early can lock you out of issuance for a while. Override with
`SKIP_DNS_CHECK=1` only if you use a DNS-01 resolver.

The origin change invalidates existing sessions, so you will log in again —
harmless before you have users, which is why it is worth doing now.

### Why tRPC and not the REST API

Dokploy's documented REST surface at `/api/*` only exposes procedures that carry
OpenAPI metadata. The `project`, `compose`, and `application` routers carry none,
so project and service creation are not reachable there. The tRPC endpoint at
`/api/trpc/*` does expose them, and its context accepts the same `x-api-key`
header, so the scripts target that.
