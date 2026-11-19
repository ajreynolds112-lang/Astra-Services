import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";
import { logger } from "./logger";
import { checkoutSettled } from "./checkoutStatus";

type StripeClient = Awaited<ReturnType<typeof getUncachableStripeClient>>;
type Subscription = Awaited<ReturnType<StripeClient["subscriptions"]["retrieve"]>>;
type CheckoutSession = Awaited<ReturnType<StripeClient["checkout"]["sessions"]["retrieve"]>>;

function addInterval(unixSeconds: number, interval: string, count: number): number {
  const d = new Date(unixSeconds * 1000);
  if (interval === "week") d.setUTCDate(d.getUTCDate() + 7 * count);
  else if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + count);
  else d.setUTCMonth(d.getUTCMonth() + count);
  return Math.floor(d.getTime() / 1000);
}

/**
 * A payment plan is a Stripe subscription that should stop after N payments.
 *
 * - Plans without a follow-on price: set cancel_at to exactly N periods after
 *   the billing anchor, so the customer is charged N times and it then ends.
 * - Plans with a follow-on price (metadata.after_price, e.g. Design + Hosting
 *   -> $89/mo hosting): attach a subscription schedule whose first phase runs
 *   the installment price for N periods and then switches to the after price.
 *
 * Safe to call repeatedly.
 */
export async function enforceInstallmentLimit(
  stripe: StripeClient,
  subscription: Subscription | Stripe.Subscription,
): Promise<void> {
  const installments = Number.parseInt(subscription.metadata?.["installments"] ?? "", 10);
  if (!Number.isFinite(installments) || installments <= 0) return;
  if (subscription.cancel_at || subscription.schedule) return;
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired") return;

  const item = subscription.items.data[0];
  const interval = item?.price.recurring?.interval ?? "month";
  const termEnd = addInterval(subscription.billing_cycle_anchor, interval, installments);
  const afterPrice = subscription.metadata?.["after_price"];

  if (afterPrice && item) {
    const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscription.id });
    const start = schedule.phases[0]?.start_date ?? subscription.billing_cycle_anchor;
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: item.price.id, quantity: 1 }], start_date: start, end_date: termEnd, proration_behavior: "none",
          discounts: subscription.discounts.map((discount) => ({ discount: typeof discount === "string" ? discount : discount.id })),
        },
        { items: [{ price: afterPrice, quantity: 1 }], discounts: [], proration_behavior: "none" },
      ],
    });
    logger.info(
      { subscriptionId: subscription.id, installments, termEnd, afterPrice },
      "Installment schedule with follow-on price set",
    );
    return;
  }

  await stripe.subscriptions.update(subscription.id, { cancel_at: termEnd, proration_behavior: "none" });
  logger.info({ subscriptionId: subscription.id, installments, cancelAt: termEnd }, "Installment limit set on subscription");
}

/**
 * Pay-in-full purchases of a plan with a follow-on price (Design + Hosting) get
 * a hosting subscription that starts billing once the prepaid term ends.
 * It's created in trial until then, so the client shows as active in the portal.
 * Idempotent: keyed on the checkout session id.
 */
export async function ensureFollowOnSubscription(stripe: StripeClient, session: CheckoutSession | Stripe.Checkout.Session) {
  const m = session.metadata ?? {};
  const afterPrice = m["after_price"];
  const months = Number.parseInt(m["installments"] ?? "", 10);
  if (m["pay_in_full"] !== "true" || !afterPrice || !Number.isFinite(months)) return;
  if (!checkoutSettled(session)) return;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customerId) return;

  const existing = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 50 });
  if (existing.data.some((s) => s.metadata?.["source_session"] === session.id)) return;

  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const pi = piId ? await stripe.paymentIntents.retrieve(piId) : null;
  const paymentMethod = typeof pi?.payment_method === "string" ? pi.payment_method : pi?.payment_method?.id;

  await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: afterPrice, quantity: 1 }],
      trial_end: addInterval(session.created, "month", months),
      ...(paymentMethod ? { default_payment_method: paymentMethod } : {}),
      metadata: { plan_name: m["plan_name"] ?? "Design + Hosting", service: m["service"] ?? "bundle", source_session: session.id },
    },
    { idempotencyKey: `follow-on-${session.id}` },
  );
  logger.info({ sessionId: session.id, customerId }, "Follow-on hosting subscription created for paid-in-full plan");
}

/** Backstop for customers who close the tab before the success page loads. */
export async function sweepInstallmentPlans(): Promise<void> {
  const stripe = await getUncachableStripeClient();
  for await (const sub of stripe.subscriptions.list({ status: "active", limit: 100 })) {
    if (!sub.cancel_at && !sub.schedule && sub.metadata?.["installments"]) {
      try {
        await enforceInstallmentLimit(stripe, sub);
      } catch (err) {
        logger.error({ err, subscriptionId: sub.id }, "Failed to set installment limit");
      }
    }
  }
}

export async function sweepPaidInFullBundles(): Promise<void> {
  const stripe = await getUncachableStripeClient();
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  for await (const session of stripe.checkout.sessions.list({ status: "complete", created: { gte: since }, limit: 100 })) {
    if (session.metadata?.["pay_in_full"] !== "true" || !session.metadata?.["after_price"]) continue;
    try {
      await ensureFollowOnSubscription(stripe, session);
    } catch (err) {
      logger.error({ err, sessionId: session.id }, "Failed to create follow-on subscription");
    }
  }
}
