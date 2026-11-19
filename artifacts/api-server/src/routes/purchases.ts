import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import type Stripe from "stripe";
import {
  ListPurchaseUsersQueryParams, ListPurchaseUsersResponse,
  GetPurchaseHistoryQueryParams, GetPurchaseHistoryResponse,
  IssuePurchaseRefundBody, IssuePurchaseRefundResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/account";
import { requireOwner } from "./dev";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { PAYMENTS_ENABLED, stripeReady } from "../lib/siteStatus";
import { customerUser, serializeTransaction, issueConfirmedRefund, PurchaseError } from "../lib/purchases";

const router: IRouter = Router();
for (const path of ["/dev/purchase-users", "/dev/purchase-history", "/dev/refunds"]) {
  router.use(path, requireAuth, requireOwner, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!PAYMENTS_ENABLED || !stripeReady) {
      res.status(503).json({ error: "Payments are still initializing. Please try again shortly." });
      return;
    }
    next();
  });
}

router.get("/dev/purchase-users", async (req, res) => {
  const parsed = ListPurchaseUsersQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid user directory page." }); return; }
  try {
    const { source = "customers", cursor, offset = 0 } = parsed.data;
    if (source === "registered") {
      const page = await clerkClient.users.getUserList({ limit: 50, offset, orderBy: "-created_at" });
      const users = page.data.map((user) => {
        const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? null;
        return {
          id: user.id, source: "registered" as const,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || email || "Registered user",
          email, createdAt: new Date(user.createdAt).toISOString(),
        };
      });
      const hasMore = offset + users.length < page.totalCount;
      res.json(ListPurchaseUsersResponse.parse({ users, hasMore, nextOffset: hasMore ? offset + users.length : null, nextCursor: null }));
    } else {
      const stripe = await getUncachableStripeClient();
      const page = await stripe.customers.list({ limit: 50, ...(cursor ? { starting_after: cursor } : {}) });
      res.json(ListPurchaseUsersResponse.parse({
        users: page.data.map(customerUser), hasMore: page.has_more, nextOffset: null,
        nextCursor: page.has_more ? page.data.at(-1)?.id ?? null : null,
      }));
    }
  } catch (error) {
    req.log.error({ message: error instanceof Error ? error.message : "Unknown error" }, "Purchase directory failed");
    res.status(502).json({ error: "Could not load users. Please try again." });
  }
});

router.get("/dev/purchase-history", async (req, res) => {
  const parsed = GetPurchaseHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Select a valid user or customer." }); return; }
  try {
    const stripe = await getUncachableStripeClient();
    const { source, id, customerId, paymentCursor, orderCursor } = parsed.data;
    const customers: Stripe.Customer[] = [];
    if (source === "customers") {
      const customer = await stripe.customers.retrieve(id);
      if (customer.deleted) throw new PurchaseError("Customer no longer exists.", 404);
      customers.push(customer);
    } else {
      const user = await clerkClient.users.getUser(id);
      const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;
      if (email) for await (const customer of stripe.customers.list({ email, limit: 100 })) customers.push(customer);
    }
    if (customerId && !customers.some((c) => c.id === customerId)) throw new PurchaseError("Customer does not match this user.", 404);
    const selected = customers.find((c) => c.id === customerId) ?? customers[0];
    if (!selected) {
      res.json(GetPurchaseHistoryResponse.parse({
        customers: [], selectedCustomerId: null, transactions: [], freePurchases: [],
        hasMore: false, nextPaymentCursor: null, nextOrderCursor: null,
        livemode: (await stripe.balance.retrieve()).livemode,
      }));
      return;
    }
    const [payments, orders] = await Promise.all([
      stripe.charges.list({ customer: selected.id, limit: 25, expand: ["data.refunds"],
        ...(paymentCursor ? { starting_after: paymentCursor } : {}) }),
      stripe.checkout.sessions.list({ customer: selected.id, status: "complete", limit: 25,
        ...(orderCursor ? { starting_after: orderCursor } : {}) }),
    ]);
    const transactions = await Promise.all(payments.data.map((c) => serializeTransaction(stripe, c)));
    res.json(GetPurchaseHistoryResponse.parse({
      customers: customers.map(customerUser), selectedCustomerId: selected.id, transactions,
      freePurchases: orders.data.filter((s) => s.amount_total === 0
        && (s.payment_status === "no_payment_required" || s.payment_status === "paid")).map((s) => ({
          id: s.id, currency: s.currency ?? "usd", createdAt: new Date(s.created * 1000).toISOString(),
          description: s.metadata?.plan_name || (s.metadata?.tweak_request_id ? `Request #${s.metadata.tweak_request_id}` : "Zero-cost checkout"),
        })),
      hasMore: payments.has_more || orders.has_more, livemode: selected.livemode,
      nextPaymentCursor: payments.data.at(-1)?.id ?? paymentCursor ?? null,
      nextOrderCursor: orders.data.at(-1)?.id ?? orderCursor ?? null,
    }));
  } catch (error) {
    const missing = error instanceof Error && "statusCode" in error && error.statusCode === 404;
    req.log.error({ message: error instanceof Error ? error.message : "Unknown error" }, "Purchase history failed");
    res.status(error instanceof PurchaseError ? error.status : missing ? 404 : 502)
      .json({ error: error instanceof PurchaseError ? error.message : missing ? "User or customer not found." : "Could not load transactions. Please try again." });
  }
});

router.post("/dev/refunds", async (req: AuthedRequest, res) => {
  const origin = req.get("origin");
  const expectedHost = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0]?.trim();
  let matchesOrigin = !origin;
  try { if (origin) matchesOrigin = new URL(origin).host === expectedHost; } catch { matchesOrigin = false; }
  if (req.get("sec-fetch-site") === "cross-site" || !matchesOrigin) {
    res.status(403).json({ error: "Refunds must be submitted from the ASTRA owner dashboard." });
    return;
  }
  const parsed = IssuePurchaseRefundBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Provide a valid payment, customer, refund amount and confirmation." }); return; }
  try {
    const result = await issueConfirmedRefund(await getUncachableStripeClient(), parsed.data, req.userId!);
    req.log.info({ refundId: result.id, chargeId: parsed.data.chargeId, amount: result.amount, status: result.status, ownerId: req.userId }, "Owner refund submitted");
    res.status(201).json(IssuePurchaseRefundResponse.parse(result));
  } catch (error) {
    const stripeInvalid = error instanceof Error && "type" in error && error.type === "StripeInvalidRequestError";
    req.log.error({ message: error instanceof Error ? error.message : "Unknown error" }, "Refund submission failed");
    res.status(error instanceof PurchaseError ? error.status : stripeInvalid ? 409 : 502).json({
      error: error instanceof PurchaseError ? error.message : stripeInvalid && error instanceof Error
        ? error.message : "Could not confirm the refund. Retry the same confirmation to avoid issuing it twice.",
    });
  }
});

export default router;