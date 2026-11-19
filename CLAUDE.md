# ASTRA development guide

Read README.md before changing this app. Use Node 22.16+ and pnpm 10.26.1.
Do not replace the stack or redesign the site unless asked.

## Commands

- `pnpm install --frozen-lockfile`
- `pnpm db:push` (root `.env`, separate local PostgreSQL database only)
- `pnpm dev` (website localhost:3000; proxied API localhost:8080)
- `pnpm typecheck`
- `pnpm build:local`
- `pnpm --filter @workspace/api-spec codegen`

`scripts/local.mjs` loads `.env` using Node's built-in environment-file support.
API changes require restarting the launcher; Vite hot-reloads frontend changes.
Existing focused tests use Node's test runner: bundle a specific `*.test.ts`
with the API package's esbuild, then run `node --test` on the temporary bundle.

## Structure and conventions

- Website: `artifacts/astra/src`.
- API: `artifacts/api-server/src/routes` and `src/lib`.
- Database: `lib/db/src/schema`.
- Contract: `lib/api-spec/openapi.yaml`; keep its `Api` title unchanged.
- Use generated hooks from `@workspace/api-client-react`, validators from
  `@workspace/api-zod`, and Drizzle schema from `@workspace/db`.
- Change OpenAPI first for API changes, regenerate clients, then implement.
- Preserve the existing React/Tailwind components and responsive behavior.
- Keep Replit artifact manifests intact; local commands do not depend on them.

## Safety and behavior to preserve

- Never read or print real secret values, include them in patches, or commit `.env`.
- This GitHub repo is public. Never add customer data, database dumps, request
  submissions, session tokens, private workspace notes, or uploaded screenshots.
- Use synthetic records and test accounts. Do not exercise payment/refund/email
  workflows against real clients to test changes.
- Local mode only accepts sandbox Stripe keys. Never switch local development
  to live billing or redirect sandbox events to the live webhook.
- Stripe owns its mirrored `stripe` schema. Do not manually write those tables.
- Keep checkout settlement rules, payment plans, hosting cancellation, request
  allowances, and owner/Dev/client permissions unchanged unless explicitly asked.
- Roles depend on verified Clerk emails; no fake auth or bypass routes.
- Request files still go to the existing private app repo, not this public repo.
- Customer reply emails require a verified Resend sender. Preserve saved replies
  and explicit delivery failures rather than claiming mail was sent.
- The published website and its data are separate from this local checkout.
  Moving hosting, production databases, Clerk users or Stripe accounts is a
  separate operation that requires explicit approval.
