import assert from "node:assert/strict";
import test from "node:test";
import { localStripeCredentials } from "./localDevelopment";

test("normal Replit runs retain their managed Stripe connection", () => {
  assert.equal(localStripeCredentials({ STRIPE_SECRET_KEY: "sk_test_fixture" }), null);
});
test("local mode accepts an explicitly configured sandbox key", () => {
  assert.deepEqual(localStripeCredentials({ ASTRA_LOCAL_DEV: "true", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "fixture" }),
    { secretKey: "sk_test_fixture", webhookSecret: "fixture" });
});
test("local mode never silently uses managed credentials or live keys", () => {
  for (const key of [undefined, "", "sk_live_fixture", "invalid"]) {
    assert.throws(() => localStripeCredentials({ ASTRA_LOCAL_DEV: "true", STRIPE_SECRET_KEY: key }), /sandbox/);
  }
});
test("standalone mode accepts live or sandbox keys from env and rejects missing ones", () => {
  for (const key of ["sk_live_fixture", "sk_test_fixture", "rk_live_fixture"]) {
    assert.equal(localStripeCredentials({ ASTRA_STANDALONE: "true", STRIPE_SECRET_KEY: key })?.secretKey, key);
  }
  for (const key of [undefined, "", "pk_live_fixture"]) {
    assert.throws(() => localStripeCredentials({ ASTRA_STANDALONE: "true", STRIPE_SECRET_KEY: key }), /STRIPE_SECRET_KEY/);
  }
});
