import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { refundableAmount, issueConfirmedRefund } from "./purchases";

const charge = {
  id: "ch_test", customer: "cus_test", amount: 2000, amount_refunded: 0,
  paid: true, captured: true, disputed: false, status: "succeeded", currency: "usd",
} as Stripe.Charge;
const input = { chargeId: "ch_test", customerId: "cus_test", amount: 500, confirmed: true,
  requestId: "7133f23b-3d62-4b82-86db-78d953050637" };

function mockStripe(refunds: Stripe.Refund[] = [], payment = charge) {
  const calls: { params: Stripe.RefundCreateParams; options: Stripe.RequestOptions }[] = [];
  const stripe = {
    charges: { retrieve: async () => payment },
    refunds: {
      list: async function* () { yield* refunds; },
      create: async (params: Stripe.RefundCreateParams, options: Stripe.RequestOptions) => {
        calls.push({ params, options });
        return { id: "re_test", amount: params.amount, currency: "usd", charge: "ch_test", status: "succeeded", created: 1700000000 };
      },
    },
  } as unknown as Stripe;
  return { stripe, calls };
}

test("pending refunds reserve money, while failed/canceled refunds do not", () => {
  const refunds = [{ amount: 500, status: "pending" }, { amount: 300, status: "failed" }, { amount: 100, status: "canceled" }] as Stripe.Refund[];
  assert.equal(refundableAmount(charge, refunds), 1500);
  assert.equal(refundableAmount({ ...charge, amount_refunded: 800 }, refunds), 1200);
  for (const patch of [{ paid: false }, { captured: false }, { disputed: true }, { status: "failed" }]) {
    assert.equal(refundableAmount({ ...charge, ...patch } as Stripe.Charge, []), 0);
  }
});
test("unconfirmed, wrong-customer and excessive refunds never reach Stripe create", async () => {
  for (const patch of [{ confirmed: false }, { customerId: "cus_other" }, { amount: 2001 }, { amount: 0 }, { amount: 1.1 }]) {
    const { stripe, calls } = mockStripe();
    await assert.rejects(issueConfirmedRefund(stripe, { ...input, ...patch }, "owner"));
    assert.equal(calls.length, 0);
  }
});
test("confirmed partial refund uses a stable Stripe idempotency key and audit metadata", async () => {
  const { stripe, calls } = mockStripe();
  const result = await issueConfirmedRefund(stripe, input, "owner");
  assert.equal(result.amount, 500);
  assert.equal(calls[0].params.charge, "ch_test");
  assert.equal(calls[0].options.idempotencyKey, `astra-refund:ch_test:${input.requestId}`);
  assert.deepEqual(calls[0].params.metadata, {
    source: "astra-owner-refund", astra_refund_request: input.requestId, initiated_by: "owner",
  });
});
test("retrying a completed refund returns it instead of issuing a second refund", async () => {
  const existing = { id: "re_existing", amount: 500, currency: "usd", charge: "ch_test", status: "succeeded",
    created: 1700000000, metadata: { astra_refund_request: input.requestId } } as unknown as Stripe.Refund;
  const { stripe, calls } = mockStripe([existing]);
  assert.equal((await issueConfirmedRefund(stripe, input, "owner")).id, "re_existing");
  assert.equal(calls.length, 0);
  await assert.rejects(issueConfirmedRefund(stripe, { ...input, amount: 1000 }, "owner"), /different amount/);
});