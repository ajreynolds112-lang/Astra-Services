# Self-hosting on the Mac mini

The site runs as one Node process (API + built website, same origin) behind a
Cloudflare Tunnel. Nothing listens on the LAN; the server binds to 127.0.0.1.

## Pieces

| Piece | Where |
| --- | --- |
| Config (secrets, never commit) | `.env.production` (live), `.env.staging` (staging); template `.env.production.example` |
| Launcher | `scripts/production.mjs build\|db\|start` (`pnpm prod:build` etc.) |
| On/off switch | `pnpm site:on` / `pnpm site:off` / `pnpm site:status` (`scripts/site.sh`) |
| Services (written by the switch) | `~/Library/Application Support/astra/*.plist`: server + tunnel, restart on crash, never start at login |
| Offline page | `cloudflare/offline-worker.js`, a Worker on `astra-services.org/*`; text in its `OFFLINE_MESSAGE` variable |
| Logs | `~/Library/Logs/astra/` |
| Databases | Homebrew PostgreSQL 16: `astra` (dev), `astra_staging`, `astra_production` |

`ASTRA_STANDALONE=true` (set by the launcher) reads Stripe, GitHub, Resend and
Expo credentials from the env file instead of Replit connectors. Stripe webhooks
are only auto-managed when `STRIPE_WEBHOOK_URL` is set.

## Deploy an update

```sh
git pull
ASTRA_ENV_FILE=.env.production node scripts/production.mjs build
ASTRA_ENV_FILE=.env.production node scripts/production.mjs db   # only when the schema changed
pnpm site:on   # restarts with the new build
```

`site:on` uses `.env.production` when it exists, otherwise `.env.staging`
(override with `ASTRA_ENV_FILE`).

## The site is on only when you switch it on

- `pnpm site:on` starts the server and tunnel and keeps the Mac from idle-sleeping
  (`caffeinate -i`). Choosing Sleep or closing the lid still sleeps it.
- `pnpm site:off` stops both; the Mac sleeps normally.
- While off or asleep, visitors see the offline page; Stripe retries missed
  webhooks for up to 3 days and the billing sweeps catch up when it's back on.
- FileVault is on: after a reboot, log in before running `site:on`.
