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

## Free-tier row limit

Teable Cloud caps free spaces at a fixed row count. The mechanism already
exists in the backend (`record.service.ts` `creditCheck()`, gated on the
`space.credit` column) but ships disabled upstream. `deploy.sh` turns it on
with `MAX_FREE_ROW_LIMIT` (default `1000`).

For a deployment that's already running:

```sh
export DOKPLOY_URL=https://dokploy.bomalogic.com
export DOKPLOY_API_KEY=...
MAX_FREE_ROW_LIMIT=1000 ./set-row-limit.sh
```

Use `0` to disable the cap. An individual space's `credit` column, when set,
overrides the default for that one space -- that's the lever for a specific
customer, without touching the global default.

Only rows are covered. Storage and automation-run caps are not implemented:
storage is content-addressed and deduplicated by hash across spaces, so a
correct per-space quota needs a real accounting design, not a guessed hook;
automation-run history is tracked in the database but this codebase's
execution entry point wasn't traced far enough to hook safely. Both are
buildable, just not blind.

## AI field

A new field type, `Ai`, backed by any OpenAI-compatible chat-completions API.
The prompt references other fields with `{fieldName}`; generation is
explicitly triggered per record via `POST
/api/table/:tableId/record/:recordId/field/:fieldId/ai-generate`, not
automatic on every save. This codebase has no background job queue, and an
LLM call is slow, costly, and fallible in a way the existing synchronous
formula/rollup calculation engine is not built to tolerate -- wiring it into
that engine's automatic recalculation would block record saves on an
external API call. A "regenerate on source-field change" mode needs a real
queue and is a deliberate follow-up, not something guessed at here.

Requires an OpenAI-compatible key. For a fresh deploy, `deploy.sh` picks up
`OPENAI_API_KEY` (and optionally `OPENAI_API_ENDPOINT`, `AI_FIELD_MODEL`) if
set in your shell. For a deployment already running:

```sh
export DOKPLOY_URL=https://dokploy.bomalogic.com
export DOKPLOY_API_KEY=...
OPENAI_API_KEY=sk-... ./set-ai-config.sh
```

The same key also powers the pre-existing AI chat feature -- both read
`OPENAI_API_KEY`/`OPENAI_API_ENDPOINT`, so there is one credential to manage,
not two.

The frontend registers the field type (icon, label, selectable in the "add
field" menu) and cell values render through the grid's existing generic
string renderer. Not yet built: a dedicated prompt-editor form (field
creation currently takes the type's default empty options) and an in-grid
"Generate" trigger button -- real UI work, tracked as the next increment
rather than rushed here.

## BomaClaw (Telegram bot)

A standalone app, `apps/telegram-bot`, that lets a user query and edit their
own BomaSheet data by chatting with a Telegram bot. It is deliberately kept
separate from BomaSheet itself:

- **Not in the pnpm workspace.** `pnpm-workspace.yaml` excludes it, the same
  way `apps/electron` is excluded. The main Dockerfile runs
  `pnpm install --frozen-lockfile` then `pnpm -r run build`; a workspace
  member with no matching lockfile entry would fail that install outright.
  BomaClaw has its own `package-lock.json` and its own Dockerfile instead.
- **A user connects with their own personal access token**, generated in
  BomaSheet's own settings, sent to the bot once via `/connect <token>`. The
  bot then calls BomaSheet's existing public REST API with that token --
  BomaSheet's own permission system decides what the bot can and can't do.
  No new access-control logic was written for this.
- **Long-polls Telegram** rather than receiving webhooks, so it needs no
  domain, TLS, or published port.
- **No background job queue**, so there is no scheduled/proactive messaging
  -- it only responds to messages sent to it.
- Tokens are stored in a local SQLite file, AES-256-GCM encrypted with a
  dedicated `BOMACLAW_ENCRYPTION_KEY` -- a separate secret from BomaSheet's
  own, since this is a separately deployed app with its own lifecycle.

Deploy after BomaSheet is already running (it looks up BomaSheet's project
and public origin, not a value you pass in):

```sh
export DOKPLOY_URL=https://dokploy.bomalogic.com
export DOKPLOY_API_KEY=...
export TELEGRAM_BOT_TOKEN=...   # from @BotFather
export OPENAI_API_KEY=sk-...    # same key BomaSheet's AI features use
./deploy-bomaclaw.sh
```

Then message the bot on Telegram: `/start`.
