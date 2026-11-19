import { Router, type IRouter } from "express";
import { checkoutSettled } from "../lib/checkoutStatus";
import { and, eq } from "drizzle-orm";
import { db, tweakRequestsTable, type TweakRequestRow } from "@workspace/db";
import { CreateTweakRequestBody, ConfirmTweakRequestBody } from "@workspace/api-zod";
import { getUncachableStripeClient } from "../lib/stripeClient";
import {
  requireAuth,
  loadProfile,
  clientStatus,
  freeRequestsUsedThisMonth,
  type AuthedRequest,
} from "../lib/account";
import { getRequestFeePrice } from "../lib/plans";
import { deliverStoredRequest } from "../lib/requestBilling";
import { siteOrigin } from "../lib/origin";

const router: IRouter = Router();

router.get("/portal/me", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const profile = await loadProfile(req.userId!);
    const [status, used] = await Promise.all([
      clientStatus(profile.emailVerified ? profile.email : ""),
      freeRequestsUsedThisMonth(profile.email),
    ]);
    const fee = await getRequestFeePrice(status.requestFee);
    res.json({
      ...profile,
      subscribed: status.plans.length > 0,
      plans: status.plans,
      requestFee: fee?.amount ?? status.requestFee,
      freeRequestsPerMonth: status.freeRequestsPerMonth,
      freeRequestsRemaining: Math.max(0, status.freeRequestsPerMonth - used),
    });
  } catch (err) {
    req.log.error({ err }, "portal/me failed");
    res.status(500).json({ error: "Could not load your account." });
  }
});

function delivered(row: TweakRequestRow) {
  return { status: "delivered" as const, fileName: row.fileName, emailed: row.emailed, checkoutUrl: null };
}

const SAVE_FAILED = "We couldn't save your request right now. Please try again.";

router.post("/tweak-requests", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = CreateTweakRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please answer every question in enough detail." });
    return;
  }

  let profile, status, used;
  try {
    profile = await loadProfile(req.userId!);
    [status, used] = await Promise.all([clientStatus(profile.emailVerified ? profile.email : ""), freeRequestsUsedThisMonth(profile.email)]);
  } catch (err) {
    req.log.error({ err }, "tweak-request account lookup failed");
    res.status(500).json({ error: "Could not verify your account." });
    return;
  }

  const staff = profile.isOwner || profile.isDev;
  if (!staff && status.plans.length === 0) {
    res.status(403).json({ error: "App tweak requests are available to ASTRA clients with an active plan." });
    return;
  }

  const billing = staff ? "staff" : used < status.freeRequestsPerMonth ? "free" : "paid";
  const planLabel = status.plans.length
    ? status.plans.join(", ")
    : profile.isOwner ? "Owner" : "Dev access";
  const billingLabel = billing === "staff" ? "" : billing === "free" ? " · free monthly request" : ` · $${status.requestFee / 100} request fee paid`;

  const [row] = await db
    .insert(tweakRequestsTable)
    .values({
      clerkUserId: req.userId!,
      name: profile.name,
      email: profile.email.toLowerCase(),
      planLabel: planLabel + billingLabel,
      payload: parsed.data,
      billing,
      status: billing === "paid" ? "pending_payment" : "queued",
    })
    .returning();

  if (billing !== "paid") {
    try {
      const done = await deliverStoredRequest(row!, req.log);
      res.status(201).json(delivered(done!));
    } catch (err) {
      req.log.error({ err }, "tweak-request delivery failed");
      res.status(502).json({ error: SAVE_FAILED });
    }
    return;
  }

  // Fee applies: hold the request until Stripe confirms payment.
  try {
    const fee = await getRequestFeePrice(status.requestFee);
    if (!fee) throw new Error("Request fee price not found in Stripe");
    const stripe = await getUncachableStripeClient();
    const existing = await stripe.customers.list({ email: profile.email, limit: 1 });
    const origin = siteOrigin(req);
    const session = await stripe.checkout.sessions.create({
      allow_promotion_codes: true,
      mode: "payment",
      ...(existing.data[0] ? { customer: existing.data[0].id } : { customer_email: profile.email }),
      line_items: [{ price: fee.priceId, quantity: 1 }],
      metadata: { tweak_request_id: String(row!.id) },
      payment_intent_data: { description: `App tweak request #${row!.id}: ${parsed.data.title}`.slice(0, 200) },
      success_url: `${origin}/portal?request_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/portal?request_cancelled=1`,
    });
    await db
      .update(tweakRequestsTable)
      .set({ checkoutSessionId: session.id })
      .where(eq(tweakRequestsTable.id, row!.id));
    res.status(201).json({ status: "payment_required", fileName: null, emailed: false, checkoutUrl: session.url });
  } catch (err) {
    req.log.error({ err }, "tweak-request checkout failed");
    await db.update(tweakRequestsTable).set({ status: "failed" }).where(eq(tweakRequestsTable.id, row!.id));
    res.status(502).json({ error: "We couldn't open payment for this request. Please try again." });
  }
});

router.post("/tweak-requests/confirm", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ConfirmTweakRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(404).json({ error: "Request not found." });
    return;
  }
  const [row] = await db
    .select()
    .from(tweakRequestsTable)
    .where(
      and(
        eq(tweakRequestsTable.checkoutSessionId, parsed.data.sessionId),
        eq(tweakRequestsTable.clerkUserId, req.userId!),
      ),
    );
  if (!row) {
    res.status(404).json({ error: "Request not found." });
    return;
  }
  if (row.status === "delivered") {
    res.json(delivered(row));
    return;
  }
  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
    if (!checkoutSettled(session)) {
      res.json({ status: "payment_required", fileName: null, emailed: false, checkoutUrl: session.url ?? null });
      return;
    }
    if (row.status === "pending_payment") {
      const done = await deliverStoredRequest(row, req.log);
      if (done) {
        res.json(delivered(done));
        return;
      }
    }
    // Another process is delivering it right now; report success without the file name.
    res.json({ status: "delivered", fileName: row.fileName, emailed: row.emailed, checkoutUrl: null });
  } catch (err) {
    req.log.error({ err }, "tweak-request confirm failed");
    res.status(502).json({ error: SAVE_FAILED });
  }
});

export default router;
