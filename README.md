# ASTRA Services

Complete ASTRA website and client/admin portal source, including the React
frontend, Express API, PostgreSQL schema, generated API clients, billing, request
replies, Expo app access, and the companion design sandbox.

This is a clean source snapshot. It intentionally contains **no credentials,
customer database, request submissions, uploaded screenshots, or workspace Git
history**. The deployed ASTRA site is not moved or republished by cloning this repo.

## Local setup

Requirements: **Node.js 22.16+**, **pnpm 10.26.1**, and **PostgreSQL**.
macOS, Linux, and Windows are supported by the package configuration.

```sh
git clone https://github.com/ajreynolds112-lang/Astra-Services.git
cd Astra-Services
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

On Windows, use `Copy-Item .env.example .env` instead of `cp`.

1. Create a separate local database, for example `createdb astra`, and update
   `DATABASE_URL` in `.env` for your own PostgreSQL installation.
2. Configure `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` with matching
   **development** keys for a Clerk application configured for localhost.
   Credentials and existing Clerk user accounts are not part of this export.
   The hosted app uses Replit-managed Clerk; exporting code does not transfer
   ownership of that managed tenant or its production accounts. For the current
   hosted tenant, manage access through Replit's Auth pane. A separate local
   tenant has separate test users.
3. Initialize the empty local schema, then start the site:

```sh
pnpm db:push
pnpm dev
```

Open **http://localhost:3000**. The frontend proxies `/api` to port 8080.
Ctrl+C stops both services. Ports can be changed in `.env`.

Keep `.env` private. Do not put secret values into Claude prompts, commits,
screenshots, or frontend `VITE_*` variables. Only the Clerk **publishable** key is
intended for the frontend.

## Working with Claude Code

From the repository directory:

```sh
claude
```

`CLAUDE.md` describes the code layout, commands, and safety constraints.
Suggested starting instruction:

> Read CLAUDE.md and README.md, inspect the site, and help me make changes locally.
> Preserve existing billing and access rules.

## Optional services

The website can run locally without Stripe, Resend, GitHub, or Expo credentials;
features needing those services report that they are unavailable rather than
pretending to succeed.

- **Stripe:** set `STRIPE_SECRET_KEY` to a sandbox `sk_test_` key. Local mode rejects
  live keys and never falls back to Replit's managed credentials. Checkout
  initialization creates/refreshes ASTRA catalog products in that sandbox.
  To test events, run
  `stripe listen --forward-to localhost:8080/api/stripe/webhook`, place its signing
  secret in local `STRIPE_WEBHOOK_SECRET`, and restart `pnpm dev`.
  Local mode does not register a public webhook URL. Existing live Stripe
  accounts, products, customers, and subscriptions are not copied.
- **Resend:** set `RESEND_API_KEY`. Customer emails also require
  `ASTRA_EMAIL_FROM` on a verified Resend domain. Without that, admin replies
  remain saved with a failed-email status and can be retried. Submission
  notifications retain their existing owner-only sandbox sender.
- **GitHub request delivery:** set a narrowly scoped `GITHUB_TOKEN` only if you
  intend to submit real request files. The existing destination is the private
  `CYBAZONE-Official-App/Requests` folder configured in `requestDelivery.ts`.
  It is **not this public source repository**. Local request submission can
  write there and send notifications: use synthetic test data during development.
- **Expo:** `EXPO_TOKEN` enables registry sync with your existing Expo account.
  That account's apps, project ownership, and native builds are not exported here.

The verified owner address and private request repository are existing business
configuration in `artifacts/api-server/src/lib/requestDelivery.ts`. Review them
before using this source for a different business. A verified email is required
for staff roles; no local authentication bypass was added.

## Useful commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start local API and website using root `.env` |
| `pnpm db:push` | Apply application schema to your configured local database |
| `pnpm typecheck` | Check libraries, API, website, sandbox, and scripts |
| `pnpm build:local` | Build the API and website with local configuration |
| `pnpm --filter @workspace/api-spec codegen` | Regenerate hooks and validation after API contract edits |

The API is built once when local development starts. After changing backend
source, restart `pnpm dev`. Frontend edits use Vite hot reload.

## Source layout

- `artifacts/astra/`: the full React/Vite website, portal, components and assets.
- `artifacts/api-server/`: Express API, authentication, billing and integrations.
- `artifacts/mockup-sandbox/`: companion component/design previews.
- `lib/db/`: Drizzle PostgreSQL schema; no database contents.
- `lib/api-spec/`: OpenAPI source of truth and code generation.
- `lib/api-client-react/`, `lib/api-zod/`: generated client hooks and validation.
- `scripts/`: local launcher and existing Stripe utility scripts.
- `docs/`: operating notes.

Replit artifact manifests are preserved for reference. The local launcher
provides ports, base paths, credentials, and API proxying without requiring Replit.
Native dependency exclusions that were specific to Linux-only Replit installs
have been removed, while package-age safeguards and security version pins remain.
