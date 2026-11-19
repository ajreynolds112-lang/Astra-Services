import assert from "node:assert/strict";
import test from "node:test";
import { configureStripeWebhooks } from "./stripeWebhooks";

const development = "https://test-workspace.picard.replit.dev/api/stripe/webhook";
const production = "https://astra-services.replit.app/api/stripe/webhook";
const endpoint = (id: string, overrides = {}) => ({
  id, url: development, status: "enabled", livemode: false, metadata: { managed_by: "stripe-sync" }, ...overrides,
});
function setup(url: string, allowDevelopmentWebhooks: boolean, endpoints = [endpoint("development")]) {
  const registered: string[] = [];
  const disabled: string[] = [];
  const config = {
    url, allowDevelopmentWebhooks,
    sync: { async findOrCreateManagedWebhook(value: string) { registered.push(value); return { id: "managed", url: value }; } },
    webhooks: {
      async *list() { yield* endpoints; },
      async update(id: string, params: { disabled: boolean }) { assert.equal(params.disabled, true); disabled.push(id); },
    },
  };
  return { config, registered, disabled };
}

test("development does not register a persistent destination by default", async () => {
  const { config, registered, disabled } = setup(development, false);
  const result = await configureStripeWebhooks(config);
  assert.deepEqual(registered, []);
  assert.deepEqual(disabled, ["development"]);
  assert.equal(result.mode, "development-disabled");
});

test("disable only the matching enabled managed sandbox destination", async () => {
  const { config, disabled } = setup(development, false, [
    endpoint("development"),
    endpoint("live", { livemode: true }),
    endpoint("other-workspace", { url: "https://another.replit.dev/api/stripe/webhook" }),
    endpoint("production", { url: production }),
    endpoint("custom", { metadata: { managed_by: "someone-else" } }),
    endpoint("already-disabled", { status: "disabled" }),
  ]);
  await configureStripeWebhooks(config);
  assert.deepEqual(disabled, ["development"]);
});

test("published service preserves managed webhook registration", async () => {
  for (const url of [production, "https://astra-services.org/api/stripe/webhook"]) {
    const { config, registered, disabled } = setup(url, false);
    assert.equal((await configureStripeWebhooks(config)).mode, "enabled");
    assert.deepEqual(registered, [url]);
    assert.deepEqual(disabled, []);
  }
});

test("development can explicitly opt in to real-time sandbox webhook tests", async () => {
  const { config, registered, disabled } = setup(development, true);
  await configureStripeWebhooks(config);
  assert.deepEqual(registered, [development]);
  assert.deepEqual(disabled, []);
});

test("starting repeatedly with no enabled dev destination is harmless", async () => {
  const { config, registered, disabled } = setup(development, false, []);
  const result = await configureStripeWebhooks(config);
  assert.deepEqual(registered, []);
  assert.deepEqual(disabled, []);
  assert.equal(result.disabledCount, 0);
});

test("a failure to disable is reported, not silently treated as success", async () => {
  const { config } = setup(development, false);
  config.webhooks.update = async () => { throw new Error("Stripe unavailable"); };
  await assert.rejects(configureStripeWebhooks(config), /Stripe unavailable/);
});
