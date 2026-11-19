import type Stripe from "stripe";
import type { BillingInvoice, BillingSubscription } from "@workspace/api-zod";

export class HostingError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

function expandedSchedule(sub: Stripe.Subscription) {
  return sub.schedule && typeof sub.schedule !== "string" ? sub.schedule : null;
}

export function hasDesignInstallments(sub: Stripe.Subscription): boolean {
  return sub.metadata.service === "bundle" && Number(sub.metadata.installments) > 0
    && !sub.metadata.source_session && sub.items.data[0]?.price.id !== sub.metadata.after_price;
}

function cancellationAt(sub: Stripe.Subscription): number | null {
  const stored = Number(sub.metadata.hosting_cancel_at || expandedSchedule(sub)?.metadata?.hosting_cancel_at);
  if (Number.isSafeInteger(stored) && stored > 0) return stored;
  return sub.cancel_at_period_end ? sub.cancel_at || periodEnd(sub) : null;
}

function periodEnd(sub: Stripe.Subscription): number {
  const end = sub.status === "trialing" && sub.trial_end ? sub.trial_end : sub.items.data[0]?.current_period_end;
  if (!end) throw new HostingError("Stripe did not provide this subscription's billing-period end. Please contact the studio.");
  return end;
}

export function billingSubscription(sub: Stripe.Subscription): BillingSubscription {
  const hostingIncluded = ["hosting", "bundle"].includes(sub.metadata.service);
  const requested = hostingIncluded && cancellationAt(sub) !== null;
  const eligible = ["active", "trialing", "past_due", "unpaid"].includes(sub.status);
  const end = hostingIncluded ? cancellationAt(sub) || (eligible ? periodEnd(sub) : sub.ended_at) : null;
  const price = sub.items.data[0]?.price;
  return {
    id: sub.id, name: sub.metadata.plan_name || (hostingIncluded ? "Hosting plan" : "App Design"),
    status: sub.status, amount: (price?.unit_amount ?? 0) * (sub.items.data[0]?.quantity ?? 1),
    currency: price?.currency ?? sub.currency, interval: price?.recurring?.interval ?? "month",
    hostingIncluded, designPaymentsContinue: hasDesignInstallments(sub) && eligible,
    hostingEndsAt: end ? new Date(end * 1000).toISOString() : null,
    cancellationRequested: requested, canCancelHosting: hostingIncluded && eligible && !requested,
  };
}

/** Remove future hosting renewal, never the customer's remaining design installments. */
export async function cancelHosting(stripe: Stripe, sub: Stripe.Subscription): Promise<Stripe.Subscription> {
  const status = billingSubscription(sub);
  if (!status.hostingIncluded) throw new HostingError("This plan has no hosting to cancel.");
  if (status.cancellationRequested) return sub;
  if (!status.canCancelHosting) throw new HostingError("This hosting subscription cannot be cancelled.");
  const cutoff = periodEnd(sub);
  const metadata = { ...sub.metadata, hosting_cancel_at: String(cutoff) };
  if (hasDesignInstallments(sub)) {
    const schedule = expandedSchedule(sub);
    if (!schedule) throw new HostingError("Your design payment schedule is not ready yet. Please try again shortly.");
    const phase = schedule.phases.find((p) => p.start_date === schedule.current_phase?.start_date);
    if (!phase || !phase.end_date) throw new HostingError("Could not verify the remaining design term. Please contact the studio.");
    // Keep the original term, price, quantity and redeemed discounts. The subscription
    // ends after the design term, instead of starting the follow-on hosting phase.
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "cancel", proration_behavior: "none",
      metadata: { ...schedule.metadata, hosting_cancel_at: String(cutoff) },
      phases: [{
        start_date: phase.start_date, end_date: phase.end_date, proration_behavior: "none",
        items: phase.items.map((item) => ({
          price: typeof item.price === "string" ? item.price : item.price.id,
          quantity: item.quantity ?? 1,
        })),
        discounts: sub.discounts.map((d) => ({ discount: typeof d === "string" ? d : d.id })),
      }],
    }, { idempotencyKey: `hosting-design-end:${sub.id}:${cutoff}` });
    return stripe.subscriptions.update(sub.id, { metadata });
  }
  if (sub.schedule) {
    await stripe.subscriptionSchedules.release(typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id,
      {}, { idempotencyKey: `hosting-release:${sub.id}:${cutoff}` });
  }
  return stripe.subscriptions.update(sub.id, { cancel_at_period_end: true, metadata },
    { idempotencyKey: `hosting-cancel:${sub.id}:${cutoff}` });
}

export function invoiceBilling(invoice: Stripe.Invoice, subscriptions: Stripe.Subscription[]): BillingInvoice {
  const details = invoice.parent?.subscription_details;
  const id = typeof details?.subscription === "string" ? details.subscription : details?.subscription.id;
  const sub = subscriptions.find((s) => s.id === id);
  const service = sub?.metadata.service || details?.metadata?.service;
  const afterPrice = sub?.metadata.after_price;
  const hasDesignLines = invoice.lines.data.some((line) => {
    const price = line.pricing?.price_details?.price;
    const priceId = typeof price === "string" ? price : price?.id;
    return priceId && priceId !== afterPrice;
  });
  const designRelated = service === "design" || (service === "bundle" && !sub?.metadata.source_session && !!hasDesignLines);
  return {
    id: invoice.id, amount: invoice.amount_remaining, currency: invoice.currency,
    paymentUrl: invoice.hosted_invoice_url ?? null,
    designRelated,
    overdue: invoice.amount_remaining > 0
      && (invoice.due_date ? invoice.due_date <= Math.floor(Date.now() / 1000) : invoice.attempted),
  };
}