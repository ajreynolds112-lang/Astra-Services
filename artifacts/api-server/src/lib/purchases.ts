import type Stripe from "stripe";
import type { PurchaseRefund, PurchaseRefundInput, PurchaseTransaction, PurchaseUser } from "@workspace/api-zod";

export class PurchaseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function customerUser(customer: Stripe.Customer): PurchaseUser {
  return {
    id: customer.id, source: "customers", name: customer.name || customer.email || "Unnamed customer",
    email: customer.email, createdAt: new Date(customer.created * 1000).toISOString(),
  };
}

export function refundableAmount(charge: Stripe.Charge, refunds: Stripe.Refund[]): number {
  if (!charge.paid || !charge.captured || charge.disputed || charge.status !== "succeeded") return 0;
  const reserved = refunds.filter((r) => r.status !== "failed" && r.status !== "canceled")
    .reduce((total, r) => total + r.amount, 0);
  return Math.max(0, (charge.amount_captured ?? charge.amount) - Math.max(charge.amount_refunded, reserved));
}

export function serializeRefund(refund: Stripe.Refund): PurchaseRefund {
  return {
    id: refund.id, chargeId: typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? "",
    amount: refund.amount, currency: refund.currency, status: refund.status ?? "pending",
    createdAt: new Date(refund.created * 1000).toISOString(),
  };
}

export async function chargeRefunds(stripe: Stripe, charge: Stripe.Charge): Promise<Stripe.Refund[]> {
  if (charge.refunds && !charge.refunds.has_more) return charge.refunds.data;
  const refunds: Stripe.Refund[] = [];
  for await (const refund of stripe.refunds.list({ charge: charge.id, limit: 100 })) refunds.push(refund);
  return refunds;
}

export async function serializeTransaction(stripe: Stripe, charge: Stripe.Charge): Promise<PurchaseTransaction> {
  const refunds = await chargeRefunds(stripe, charge);
  return {
    id: charge.id, customerId: typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null,
    description: charge.description || charge.metadata.plan_name || "Payment",
    amount: charge.captured ? charge.amount_captured ?? charge.amount : charge.amount,
    refundedAmount: charge.amount_refunded,
    refundableAmount: refundableAmount(charge, refunds), currency: charge.currency,
    status: charge.disputed ? "disputed" : charge.refunded ? "refunded"
      : charge.amount_refunded > 0 ? "partially_refunded" : charge.status,
    createdAt: new Date(charge.created * 1000).toISOString(), receiptUrl: charge.receipt_url,
    refunds: refunds.map(serializeRefund),
  };
}

export async function issueConfirmedRefund(stripe: Stripe, input: PurchaseRefundInput, ownerId: string): Promise<PurchaseRefund> {
  if (!input.confirmed) throw new PurchaseError("Confirm the refund before submitting it.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new PurchaseError("Enter a positive refund amount.");
  const charge = await stripe.charges.retrieve(input.chargeId);
  const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  if (customerId !== input.customerId) throw new PurchaseError("This payment does not belong to the selected customer.", 409);
  // Read every refund: pending/requires-action refunds also reserve part of the payment.
  const refunds: Stripe.Refund[] = [];
  for await (const refund of stripe.refunds.list({ charge: charge.id, limit: 100 })) refunds.push(refund);
  const prior = refunds.find((r) => r.metadata?.astra_refund_request === input.requestId);
  if (prior) {
    if (prior.amount !== input.amount) throw new PurchaseError("That confirmation was already used for a different amount.", 409);
    return serializeRefund(prior);
  }
  if (input.amount > refundableAmount(charge, refunds)) {
    throw new PurchaseError("That amount is no longer refundable. Refresh the payment history and try again.", 409);
  }
  const refund = await stripe.refunds.create({
    charge: charge.id, amount: input.amount, ...(input.reason ? { reason: input.reason } : {}),
    metadata: { source: "astra-owner-refund", astra_refund_request: input.requestId, initiated_by: ownerId },
  }, { idempotencyKey: `astra-refund:${charge.id}:${input.requestId}` });
  return serializeRefund(refund);
}