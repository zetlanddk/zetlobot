# Zetland Slackbot

Internal multi-tenant Slack assistant. Connects Slack to the [Mainframe](https://github.com/zetland/mainframe) MCP server so support staff can answer member/subscription questions and run common operations from Slack.

Built on the [AI SDK](https://sdk.vercel.ai/), running [Anthropic Claude Opus 4.7](https://docs.anthropic.com/), deployed on Vercel.

## Architecture

A single Slack app installed in Zetland's primary workspace. Tenants (Zetland and other companies on our platform) join via Slack Connect / shared channels — channel ID is the tenant routing key.

### Request flow

1. Slack delivers an event (mention, DM, or assistant thread) to `api/events.ts` (Vercel function, 120s budget).
2. The handler resolves the tenant via `getTenantByChannelId` in `lib/tenants.ts`. Unrecognized channels get an explicit "I'm not configured to respond in this channel" reply rather than silent drops.
3. The Supabase auth gate (`lib/auth/gate.ts`) checks whether the Slack user has a live Supabase session in Upstash Redis. If not, the bot posts a "Sign in with Google" button; the OAuth callback at `api/auth/callback.ts` stores the access + refresh tokens and tells the user to retry their message.
4. Once the user is authenticated, `lib/generate-response.ts` runs `generateText` against `claude-opus-4-7` with the tenant-specific system prompt (`lib/buildSystemPrompt.ts`) and the Mainframe MCP tools.
5. Every Mainframe MCP call carries the user's own Supabase access token in the `Authorization` header (`lib/tools/index.ts`). Mainframe's audit log attributes each action to the human operator, not to a shared bot identity.

### Tool surface

The Mainframe MCP server is the only tool source. Tool definitions live server-side in Mainframe (`app/controllers/api/v1/internal/mcp_controller.rb`) and are fetched dynamically per request — no tool list to update in this repo when Mainframe changes.

## Tenants as code

Tenant configuration lives in `lib/tenants.ts`. Each entry binds a tenant ID to its allowed Slack channel IDs, Mainframe API root, Supabase project URL, Chargebee site, and the language the bot should reply in.

Per-tenant secrets follow a naming convention rather than a config file:

- `<TENANT_ID_UPPERCASE>_MAINFRAME_API_KEY`
- `<TENANT_ID_UPPERCASE>_SUPABASE_ANON_KEY`

For example, the `zetland` tenant reads `ZETLAND_MAINFRAME_API_KEY` and `ZETLAND_SUPABASE_ANON_KEY` from the environment. Adding a tenant is an edit to `lib/tenants.ts` plus the matching env vars — no database, no admin UI.

## Local development

### Install

```sh
pnpm install
```

### Environment

Required globals (validated by `lib/env.ts` at boot):

```
SLACK_BOT_TOKEN          # xoxb- token from the Zetland Slack app
SLACK_SIGNING_SECRET     # Slack app signing secret
BOT_PUBLIC_URL           # Public origin used to build the Supabase OAuth redirect
KV_REST_API_URL          # Upstash Redis (provisioned via Vercel Marketplace)
KV_REST_API_TOKEN
```

Plus per-tenant secrets, e.g.:

```
ZETLAND_MAINFRAME_API_KEY
ZETLAND_SUPABASE_ANON_KEY
```

### Run

```sh
pnpm vercel dev --listen 3000 --yes
```

Slack events need a public URL. Run a tunnel and point both Slack's Event Subscriptions Request URL and `BOT_PUBLIC_URL` at it (the latter so the Supabase OAuth callback resolves correctly):

```sh
npx untun@latest tunnel http://localhost:3000
```

Slack Request URL: `<tunnel>/api/events`.

### Tests

```sh
pnpm test         # one-shot
pnpm test:watch   # watch mode
```

## Deployment

Deployed to Vercel. Production env vars (globals + each tenant's `<TENANT>_*` secrets) live in the Vercel project settings; pushing to `main` triggers a deploy.
