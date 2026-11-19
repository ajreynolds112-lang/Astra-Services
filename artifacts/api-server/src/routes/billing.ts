import { Router, type IRouter } from "express";
import type Stripe from "stripe";
import { CancelPortalHostingBody, CancelPortalHostingResponse, GetPortalBillingResponse } from "@workspace/api-zod";
import { requireAuth, loadProfile, type AuthedRequest } from "../lib/account";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { PAYMENTS_ENABLED, stripeReady } from "../lib/siteStatus";
import { HostingError, billingSubscription, cancelHosting, invoiceBilling } from "../lib/hostingCancellation";
import { enforceInstallmentLimit } from "../lib/installments";

const router: IRouter = Router();
router.use("/portal", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
async function ownCustomers(stripe: Stripe, userId: string): Promise<Stripe.Customer[]> {
  const profile = await loadProfile(userId);
  if (!profile.emailVerified || !profile.email) throw new HostingError("Verify your primary email before managing billing.", 403);
  const customers: Stripe.Customer[] = [];
  for await (const customer of stripe.customers.list({ email: profile.email, limit: 100 })) customers.push(customer);
  return customers;
}
function paymentsAvailable() {
  if (!PAYMENTS_ENABLED || !stripeReady) throw new HostingError("Payments are still initializing. Please try again shortly.", 503);
}

router.get("/portal/billing", requireAuth, async (req: AuthedRequest, res) => {
  try {
    paymentsAvailable();
    const stripe = await getUncachableStripeClient();
    const customers = await ownCustomers(stripe, req.userId!);
    const subscriptions: Stripe.Subscription[] = [];
    const invoices: Stripe.Invoice[] = [];
    for (const customer of customers) {
      for await (const sub of stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100, expand: ["data.schedule"] })) {
        if (["design", "hosting", "bundle"].includes(sub.metadata.service)) subscriptions.push(sub);
      }
      for await (const invoice of stripe.invoices.list({ customer: customer.id, status: "open", limit: 100 })) {
        if (invoice.amount_remaining > 0) invoices.push(invoice);
      }
    }
    const bills = invoices.map((invoice) => invoiceBilling(invoice, subscriptions));
    res.json(GetPortalBillingResponse.parse({
      subscriptions: subscriptions.map(billingSubscription), invoices: bills,
      designPaymentRisk: bills.some((i) => i.designRelated && i.overdue)
        || subscriptions.some((s) => (s.metadata.service === "design" || s.metadata.service === "bundle"
          && s.items.data[0]?.price.id !== s.metadata.after_price && !s.metadata.source_session)
          && ["past_due", "unpaid"].includes(s.status)),
    }));
  } catch (error) {
    req.log.error({ message: error instanceof Error ? error.message : "Unknown error" }, "Client billing load failed");
    res.status(error instanceof HostingError ? error.status : 502)
      .json({ error: error instanceof HostingError ? error.message : "Could not load billing from Stripe. Please try again." });
  }
});

router.post("/portal/hosting/cancel", requireAuth, async (req: AuthedRequest, res) => {
  const origin = req.get("origin");
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0]?.trim();
  let sameOrigin = !origin;
  try { if (origin) sameOrigin = new URL(origin).host === host; } catch { sameOrigin = false; }
  if (req.get("sec-fetch-site") === "cross-site" || !sameOrigin) {
    res.status(403).json({ error: "Cancel hosting from your ASTRA client portal." }); return;
  }
  const parsed = CancelPortalHostingBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.confirmed) {
    res.status(400).json({ error: "Confirm your hosting cancellation before submitting it." }); return;
  }
  try {
    paymentsAvailable();
    const stripe = await getUncachableStripeClient();
    const customers = await ownCustomers(stripe, req.userId!);
    let subscription = await stripe.subscriptions.retrieve(parsed.data.subscriptionId, { expand: ["schedule"] });
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    if (!customers.some((c) => c.id === customerId)) throw new HostingError("Subscription not found.", 404);
    // Restore a missing installment schedule before changing anything; never allow
    // cancelling the recurring design payment itself at the end of this month.
    if (subscription.metadata.service === "bundle" && subscription.metadata.installments && !subscription.schedule
      && !subscription.metadata.source_session && subscription.items.data[0]?.price.id !== subscription.metadata.after_price) {
      await enforceInstallmentLimit(stripe, subscription);
      subscription = await stripe.subscriptions.retrieve(subscription.id, { expand: ["schedule"] });
    }
    const result = await cancelHosting(stripe, subscription);
    req.log.info({ subscriptionId: result.id, hostingEndsAt: result.metadata.hosting_cancel_at }, "Client hosting cancellation scheduled");
    res.json(CancelPortalHostingResponse.parse(billingSubscription(result)));
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "resource_missing";
    req.log.error({ message: error instanceof Error ? error.message : "Unknown error" }, "Client hosting cancellation failed");
    res.status(error instanceof HostingError ? error.status : missing ? 404 : 502)
      .json({ error: error instanceof HostingError ? error.message : missing ? "Subscription not found."
        : "Could not confirm hosting cancellation. Retry from your billing panel; your design balance has not been forgiven." });
  }
});
export default router;