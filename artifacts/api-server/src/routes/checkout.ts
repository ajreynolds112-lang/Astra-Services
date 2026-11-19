import { Router, type IRouter } from "express";
import {
  CreateCheckoutBody,
  CreateCheckoutResponse,
  GetCheckoutSummaryParams,
  GetCheckoutSummaryResponse,
} from "@workspace/api-zod";
import { getPlanByPriceId } from "../lib/plans";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { enforceInstallmentLimit, ensureFollowOnSubscription } from "../lib/installments";
import { siteOrigin } from "../lib/origin";
import { parseGithubRepositories, githubRepositoryMetadata } from "../lib/githubRepositories";

const router: IRouter = Router();

router.post("/checkout", async (req, res) => {
  const parsed = CreateCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a plan, your name, a valid email, and no more than 100 repository links." });
    return;
  }
  const { priceId, name, email, payInFull } = parsed.data;
  let repositories;
  try {
    repositories = parseGithubRepositories(parsed.data.githubRepositoryStatus, parsed.data.githubRepositoryUrls);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid GitHub repository links." });
    return;
  }

  const plan = await getPlanByPriceId(priceId);
  if (!plan) {
    res.status(400).json({ error: "That payment plan is no longer available." });
    return;
  }
  if (payInFull && !plan.payInFull) {
    res.status(400).json({ error: "This plan can't be paid in full upfront." });
    return;
  }

  let stripe;
  try {
    stripe = await getUncachableStripeClient();
  } catch (err) {
    req.log.error({ err }, "Stripe not configured");
    res.status(503).json({ error: "Online payments are not set up yet. Please contact us." });
    return;
  }

  const existing = await stripe.customers.list({ email, limit: 1 });
  const customer =
    existing.data[0] ?? (await stripe.customers.create({ email, name, metadata: { source: "astra-site" } }));

  const origin = siteOrigin(req);
  const metadata: Record<string, string> = {
    ...githubRepositoryMetadata(repositories),
    plan_name: plan.name,
    service: plan.service,
    product_id: plan.productId,
    installments: plan.installments ? String(plan.installments) : "",
    after_price: plan.afterPriceId ?? "",
    after_amount: plan.afterAmount != null ? String(plan.afterAmount) : "",
  };
  const urls = {
    allow_promotion_codes: true,
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel`,
  };

  const session = payInFull && plan.payInFull
    ? await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customer.id,
        line_items: [{ price: plan.payInFull.priceId, quantity: 1 }],
        metadata: { ...metadata, pay_in_full: "true" },
        payment_intent_data: {
          metadata: { ...metadata, pay_in_full: "true" },
          description: `${plan.name} — paid in full`,
          // Save the card when hosting continues after the prepaid term.
          ...(plan.afterPriceId ? { setup_future_usage: "off_session" as const } : {}),
        },
        invoice_creation: { enabled: true },
        ...urls,
      })
    : await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customer.id,
        line_items: [{ price: plan.priceId, quantity: 1 }],
        subscription_data: { metadata },
        metadata,
        ...urls,
      });

  if (!session.url) {
    res.status(503).json({ error: "Could not start checkout. Please try again." });
    return;
  }
  res.json(CreateCheckoutResponse.parse({ url: session.url }));
});

router.get("/checkout/:sessionId", async (req, res) => {
  const { sessionId } = GetCheckoutSummaryParams.parse(req.params);

  let stripe;
  try {
    stripe = await getUncachableStripeClient();
  } catch {
    res.status(404).json({ error: "Checkout not found" });
    return;
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "line_items.data.price"],
    });
  } catch {
    res.status(404).json({ error: "Checkout not found" });
    return;
  }

  const subscription =
    session.subscription && typeof session.subscription !== "string" ? session.subscription : null;
  if (session.status === "complete" && subscription) {
    try {
      await enforceInstallmentLimit(stripe, subscription);
    } catch (err) {
      req.log.error({ err }, "Failed to set installment limit");
    }
  }
  const paidInFull = session.metadata?.["pay_in_full"] === "true";
  if (session.status === "complete" && paidInFull) {
    try {
      await ensureFollowOnSubscription(stripe, session);
    } catch (err) {
      req.log.error({ err }, "Failed to create follow-on subscription");
    }
  }

  const price = session.line_items?.data[0]?.price;
  const installmentsRaw = Number.parseInt(session.metadata?.["installments"] ?? "", 10);
  const afterRaw = Number.parseInt(session.metadata?.["after_amount"] ?? "", 10);

  res.json(
    GetCheckoutSummaryResponse.parse({
      status: session.status ?? "open",
      planName: session.metadata?.["plan_name"] ?? "Payment plan",
      customerEmail: session.customer_details?.email ?? null,
      installments: Number.isFinite(installmentsRaw) && installmentsRaw > 0 ? installmentsRaw : null,
      installmentAmount: price?.unit_amount ?? session.amount_total ?? 0,
      amountToday: session.amount_total ?? 0,
      discountAmount: session.total_details?.amount_discount ?? 0,
      currency: session.currency ?? "usd",
      interval: price?.recurring?.interval ?? "month",
      paidInFull,
      afterAmount: Number.isFinite(afterRaw) && afterRaw > 0 ? afterRaw : null,
    }),
  );
});

export default router;
