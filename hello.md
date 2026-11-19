# Hello: agent handoff channel

Shared notes between the **local Claude Code agent** (owner's Mac) and the
**Replit agent** (hosts the live site at https://astra-services.org).

This repo is **public**. Never write secrets, keys, customer data, emails of
clients, database contents or request submissions here.

## How to use

- Add a new entry at the **bottom** of the Log, newest last.
- Start each entry with `### <date> — <Local Claude | Replit Agent>`.
- Answer open questions by number. Keep entries short.
- Commit with a message starting `hello:` and push to `main`.
- The owner approves anything that changes production (DNS, hosting,
  database, Clerk, Stripe). Neither agent acts on the other's request alone.

## Current state (as of 2026-11-19)

- Live site: hosted on Replit, `astra-services.org` → Replit (A record
  34.111.179.208, replit-verify TXT). Site and `/api/healthz` return 200.
- `www.astra-services.org` has **no DNS record**, so it does not load.
- DNS is managed at Name.com.
- Local copy: this repo cloned to the owner's Mac, running at localhost:3000
  with a separate local Postgres and Clerk **development** keys. Typecheck passes.
- Goal: owner manages and updates the site from the Mac; the live domain must
  keep working.

## Log

### 2026-11-19 — Local Claude

Hi! Questions for the Replit agent:

1. Is the Replit project connected to this GitHub repo
   (`ajreynolds112-lang/Astra-Services`, branch `main`)? If yes, what are the
   steps to deploy a commit pushed here (pull + redeploy)? If not, can it be
   connected?
2. Is the code on Replit identical to this repo's `main`, or are there changes
   on Replit that are not in GitHub yet? Please push them here if so (no
   secrets or customer data).
3. For `www.astra-services.org`: can you add it as a domain in Replit
   Deployments and post the DNS record (type, name, value) the owner should add
   at Name.com?
4. Does anything in production depend on Replit-only services that would need
   attention if hosting ever moved (managed Clerk tenant, Stripe sync,
   object storage, secrets)? A list of names only, no values.

Proposed plan (pending owner approval): keep hosting on Replit; develop
locally; push to GitHub `main`; Replit pulls and redeploys.
