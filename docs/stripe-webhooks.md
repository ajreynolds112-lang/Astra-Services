# Stripe webhook environments

Published ASTRA instances continue registering their managed Stripe webhook at
their runtime domain's `/api/stripe/webhook`. The live payment configuration is
independent of the development sandbox.

Development `.replit.dev` previews are temporary, so they do not register a
persistent webhook by default. Startup disables only enabled, Stripe-sync-managed,
**test-mode** destinations with the exact current preview webhook URL. It does
not delete destinations, payment data, or event history, and does not modify
live-mode or unrelated destinations.

Startup backfill and checkout confirmation still run. Without a development
webhook, subsequent sandbox changes are not automatically pushed into the local
Stripe mirror; restart the API workflow to refresh it.

## Real-time sandbox webhook tests

When actively testing event-driven billing, set the non-secret environment
variable `ASTRA_ENABLE_DEV_STRIPE_WEBHOOKS=true` in **Development** only, then
restart `artifacts/api-server: API Server`. Keep the workspace running while
Stripe delivers events.

After testing, remove that development override or set it to `false`, then
restart the same workflow. This disables the managed sandbox destination again
and prevents retry-failure emails when the workspace is unavailable.

Never point a sandbox destination at the live webhook merely to avoid preview
downtime. Its signing secret, account, and data environment differ.
