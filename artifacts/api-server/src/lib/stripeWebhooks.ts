import type Stripe from "stripe";

type Webhook = Pick<Stripe.WebhookEndpoint, "id" | "url" | "status" | "livemode" | "metadata">;
type WebhookAdmin = {
  list(params: { limit: number }): AsyncIterable<Webhook>;
  update(id: string, params: { disabled: boolean }): PromiseLike<unknown>;
};
type ManagedSync = { findOrCreateManagedWebhook(url: string): Promise<{ id: string; url: string }> };
type Configuration = {
  url: string;
  allowDevelopmentWebhooks: boolean;
  webhooks: WebhookAdmin;
  sync: ManagedSync;
};

export async function configureStripeWebhooks(config: Configuration) {
  const developmentUrl = new URL(config.url).hostname.endsWith(".replit.dev");
  if (developmentUrl && !config.allowDevelopmentWebhooks) {
    let disabledCount = 0;
    // A workspace preview is not an always-on receiver. Stop retries against
    // its own managed sandbox destination, never another workspace or live mode.
    for await (const webhook of config.webhooks.list({ limit: 100 })) {
      const managedBy = webhook.metadata.managed_by?.toLowerCase().replace(/[\s-]+/g, "");
      if (webhook.url === config.url && !webhook.livemode && webhook.status === "enabled" && managedBy === "stripesync") {
        await config.webhooks.update(webhook.id, { disabled: true });
        disabledCount++;
      }
    }
    return { mode: "development-disabled" as const, url: config.url, disabledCount };
  }
  const webhook = await config.sync.findOrCreateManagedWebhook(config.url);
  return { mode: "enabled" as const, url: webhook.url, disabledCount: 0 };
}
