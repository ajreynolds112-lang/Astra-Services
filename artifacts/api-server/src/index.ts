import app from "./app";
import { runMigrations } from "stripe-replit-sync";
import { logger } from "./lib/logger";
import { getStripeSync, getUncachableStripeClient } from "./lib/stripeClient";
import { sweepInstallmentPlans, sweepPaidInFullBundles } from "./lib/installments";
import { sweepPaidRequests } from "./lib/requestBilling";
import { PAYMENTS_ENABLED, markStripeReady } from "./lib/siteStatus";
import { ensureCatalog } from "./lib/catalog";
import { initializeAppRegistry, syncAppRegistry } from "./lib/appRegistry";
import { configureStripeWebhooks } from "./lib/stripeWebhooks";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);
initializeAppRegistry().then(() => {
  return process.env.EXPO_TOKEN ? syncAppRegistry() : undefined;
}).catch((error: unknown) => logger.warn({ message: error instanceof Error ? error.message : "Unknown error" }, "Expo app registry initialization or sync failed"));

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Stripe sync");

  await runMigrations({ databaseUrl });
  const stripeSync = await getStripeSync();

  const stripe = await getUncachableStripeClient();
  const runtimeDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  // Standalone only manages a webhook when its URL is set explicitly, so staging never claims the live endpoint.
  const webhookUrl = process.env.ASTRA_STANDALONE === "true"
    ? process.env.STRIPE_WEBHOOK_URL?.trim()
    : runtimeDomain && `https://${runtimeDomain}/api/stripe/webhook`;
  if (process.env.ASTRA_LOCAL_DEV === "true") {
    logger.info("Local Stripe sandbox mode; use Stripe CLI forwarding for webhook tests");
  } else if (process.env.ASTRA_STANDALONE === "true" && !webhookUrl) {
    logger.info("Standalone mode without STRIPE_WEBHOOK_URL; webhooks verify with STRIPE_WEBHOOK_SECRET");
  } else {
    if (!webhookUrl) throw new Error("REPLIT_DOMAINS is required for Stripe webhook configuration");
    const webhook = await configureStripeWebhooks({
      url: webhookUrl,
      allowDevelopmentWebhooks: process.env.ASTRA_ENABLE_DEV_STRIPE_WEBHOOKS === "true",
      webhooks: stripe.webhookEndpoints,
      sync: stripeSync,
    });
    logger.info(webhook, webhook.mode === "enabled"
      ? "Stripe webhook configured"
      : "Persistent development Stripe webhook disabled; startup sync remains enabled");
  }

  await ensureCatalog(stripe);
  try {
    await stripeSync.syncBackfill({ object: "all" });
  } catch (err) {
    // Reconnecting can leave old-account customer IDs in the local mirror.
    // Catalog sync below is mandatory; unrelated history must not block it.
    logger.warn({ err }, "Stripe history backfill incomplete; refreshing the current account catalog");
  }
  // Backfill is incremental, so explicitly refresh edits and archived prices.
  const productIds: string[] = [];
  for await (const product of stripe.products.list({ limit: 100 })) {
    await stripeSync.syncSingleEntity(product.id);
    if (product.active && (product.metadata.astra_plan === "true" || product.metadata.astra_request_fee === "true")) {
      productIds.push(product.id);
    }
  }
  for await (const price of stripe.prices.list({ limit: 100 })) await stripeSync.syncSingleEntity(price.id);
  markStripeReady(productIds);
  logger.info("Stripe data synced; checkout and client portal enabled");

  const sweep = () => {
    sweepInstallmentPlans().catch((err: unknown) => logger.error({ err }, "Installment sweep failed"));
    sweepPaidInFullBundles().catch((err: unknown) => logger.error({ err }, "Paid-in-full sweep failed"));
    sweepPaidRequests().catch((err: unknown) => logger.error({ err }, "Request fee sweep failed"));
  };
  setTimeout(sweep, 30_000);
  setInterval(sweep, 15 * 60_000);
}

// The public site stays available if initialization fails; checkout stays gated.
if (!PAYMENTS_ENABLED) {
  logger.info("Payments paused: Stripe initialization, sync, and billing sweeps disabled");
} else {
  initStripe().catch((err: unknown) =>
    logger.warn({ err: err instanceof Error ? err.message : err }, "Stripe not initialized"),
  );
}

// HOST=127.0.0.1 keeps the self-hosted server reachable only through the tunnel.
app.listen(port, process.env.HOST || "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
