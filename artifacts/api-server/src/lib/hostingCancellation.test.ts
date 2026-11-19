import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { cancelHosting, billingSubscription, hasDesignInstallments, invoiceBilling } from "./hostingCancellation";

const subscription = {
  id: "sub_test", customer: "cus_test", status: "active",
  metadata: { service: "hosting", plan_name: "Managed Hosting" },
  items: { data: [{ current_period_end: 1793516400, quantity: 1,
    price: { id: "price_host", unit_amount: 9900, currency: "usd", recurring: { interval: "month" } } }] },
  cancel_at_period_end: false, schedule: null, discounts: [],
} as unknown as Stripe.Subscription;

function fakeStripe(sub: Stripe.Subscription) {
  const writes: { kind: string; params: unknown }[] = [];
  const stripe = {
    subscriptions: {
      update: async (_id: string, params: Stripe.SubscriptionUpdateParams) => {
        writes.push({ kind: "subscription", params });
        return { ...sub, ...params, metadata: { ...sub.metadata, ...params.metadata } };
      },
    },
    subscriptionSchedules: {
      update: async (_id: string, params: Stripe.SubscriptionScheduleUpdateParams) => {
        writes.push({ kind: "schedule", params }); return params;
      },
      release: async () => { writes.push({ kind: "release", params: {} }); },
    },
  } as unknown as Stripe;
  return { stripe, writes };
}

test("hosting cancels at period end, not immediately; repeat confirmation is idempotent", async () => {
  const { stripe, writes } = fakeStripe(subscription);
  const result = await cancelHosting(stripe, subscription);
  assert.equal(result.cancel_at_period_end, true);
  assert.equal(result.metadata.hosting_cancel_at, "1793516400");
  assert.equal(billingSubscription(result).cancellationRequested, true);
  await cancelHosting(stripe, result);
  assert.equal(writes.length, 1);
});
test("design-only subscriptions cannot be cancelled through hosting", async () => {
  const sub = { ...subscription, metadata: { service: "design", installments: "5" } };
  const { stripe, writes } = fakeStripe(sub);
  assert.equal(billingSubscription(sub).canCancelHosting, false);
  await assert.rejects(cancelHosting(stripe, sub), /hosting/);
  assert.equal(writes.length, 0);
});
test("bundle cancellation retains design price, discounts and original term; removes only follow-on hosting", async () => {
  const phase = { start_date: 1790838000, end_date: 1811746800, items: [{ price: "price_design", quantity: 1 }] };
  const sub = { ...subscription,
    metadata: { service: "bundle", installments: "8", after_price: "price_after" },
    schedule: { id: "sub_sched_test", metadata: {}, current_phase: phase, phases: [phase, { items: [{ price: "price_after" }] }] },
    discounts: ["di_test"], items: { data: [{ ...subscription.items.data[0], price: { ...subscription.items.data[0].price, id: "price_design" } }] },
  } as unknown as Stripe.Subscription;
  const { stripe, writes } = fakeStripe(sub);
  assert.equal(hasDesignInstallments(sub), true);
  const result = await cancelHosting(stripe, sub);
  assert.equal(result.cancel_at_period_end, false);
  const update = writes[0].params as Stripe.SubscriptionScheduleUpdateParams;
  assert.equal(update.end_behavior, "cancel");
  assert.equal(update.phases?.length, 1);
  assert.equal(update.phases?.[0].end_date, phase.end_date);
  assert.equal(update.phases?.[0].items[0].price, "price_design");
  assert.deepEqual(update.phases?.[0].discounts, [{ discount: "di_test" }]);
  assert.equal(billingSubscription(result).designPaymentsContinue, true);
});
test("a bundle already in hosting phase releases its schedule before period-end cancellation", async () => {
  const sub = { ...subscription,
    metadata: { service: "bundle", installments: "8", after_price: "price_host" },
    schedule: { id: "sub_sched_test", metadata: {} },
  } as unknown as Stripe.Subscription;
  const { stripe, writes } = fakeStripe(sub);
  assert.equal(hasDesignInstallments(sub), false);
  await cancelHosting(stripe, sub);
  assert.deepEqual(writes.map((w) => w.kind), ["release", "subscription"]);
});
test("prepaid hosting cancels only at prepaid term end, without creating a design balance", async () => {
  const sub = { ...subscription, status: "trialing", trial_end: 1811746800,
    metadata: { service: "bundle", source_session: "cs_test", installments: "8" } } as unknown as Stripe.Subscription;
  const { stripe } = fakeStripe(sub);
  const result = await cancelHosting(stripe, sub);
  assert.equal(hasDesignInstallments(result), false);
  assert.equal(result.metadata.hosting_cancel_at, "1811746800");
});
test("overdue design invoices expose payment links and risk, but hosting renewals are not mislabelled as design debt", () => {
  const sub = { ...subscription, metadata: { service: "bundle", installments: "8", after_price: "price_host" } };
  const invoice = { id: "in_test", amount_remaining: 500, currency: "usd", due_date: null, attempted: true,
    hosted_invoice_url: "https://invoice.stripe.com/test",
    parent: { subscription_details: { subscription: sub.id, metadata: sub.metadata } },
    lines: { data: [{ pricing: { price_details: { price: "price_design" } } }] },
  } as unknown as Stripe.Invoice;
  assert.equal(invoiceBilling(invoice, [sub]).designRelated, true);
  assert.equal(invoiceBilling(invoice, [sub]).overdue, true);
  const hostingInvoice = { ...invoice, lines: { data: [{ pricing: { price_details: { price: "price_host" } } }] } } as unknown as Stripe.Invoice;
  assert.equal(invoiceBilling(hostingInvoice, [sub]).designRelated, false);
});