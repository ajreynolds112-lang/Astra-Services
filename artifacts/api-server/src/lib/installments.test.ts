import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { enforceInstallmentLimit, ensureFollowOnSubscription } from "./installments";

test("bundled installment schedules preserve promos for the initial term, not follow-on hosting", async () => {
  let params: Stripe.SubscriptionScheduleUpdateParams | undefined;
  const stripe = {
    subscriptionSchedules: {
      create: async () => ({ id: "sched_test", phases: [{ start_date: 1700000000 }] }),
      update: async (_id: string, input: Stripe.SubscriptionScheduleUpdateParams) => { params = input; },
    },
  } as unknown as Stripe;
  await enforceInstallmentLimit(stripe, {
    id: "sub_test", metadata: { installments: "8", after_price: "price_hosting" }, status: "active",
    billing_cycle_anchor: 1700000000, discounts: ["di_test"],
    items: { data: [{ price: { id: "price_bundle", recurring: { interval: "month" } } }] },
  } as unknown as Stripe.Subscription);
  assert.deepEqual(params?.phases?.[0]?.discounts, [{ discount: "di_test" }]);
  assert.deepEqual(params?.phases?.[1]?.discounts, []);
  assert.deepEqual(params?.phases?.[1]?.items, [{ price: "price_hosting", quantity: 1 }]);
});

test("100% discounted completed upfront bundles still establish their hosting term", async () => {
  let created: Stripe.SubscriptionCreateParams | undefined;
  const stripe = {
    subscriptions: {
      list: async () => ({ data: [] }),
      create: async (params: Stripe.SubscriptionCreateParams) => { created = params; },
    },
  } as unknown as Stripe;
  await ensureFollowOnSubscription(stripe, {
    id: "cs_free", status: "complete", payment_status: "no_payment_required", customer: "cus_test", created: 1700000000,
    metadata: { pay_in_full: "true", after_price: "price_hosting", installments: "8" },
  } as unknown as Stripe.Checkout.Session);
  assert.deepEqual(created?.items, [{ price: "price_hosting", quantity: 1 }]);
  assert.ok(created?.trial_end);
  assert.equal(created?.default_payment_method, undefined);
});