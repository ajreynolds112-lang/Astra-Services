import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, gte, ne } from "drizzle-orm";
import { db, devUsersTable, tweakRequestsTable } from "@workspace/db";
import { getUncachableStripeClient } from "./stripeClient";
import { getPlanByProductId, type PaymentPlan } from "./plans";
import { getRequestPolicy } from "./requestPolicy";
import { OWNER_EMAIL } from "./requestDelivery";
import { PAYMENTS_ENABLED, stripeReady } from "./siteStatus";
import { checkoutSettled } from "./checkoutStatus";

export type AuthedRequest = Request & { userId?: string };

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const userId = (auth?.sessionClaims?.["userId"] as string | undefined) || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  req.userId = userId;
  next();
}

export type Profile = { name: string; email: string; emailVerified: boolean; isOwner: boolean; isDev: boolean };

/** Name, primary email, and roles. Roles only count for a verified email address. */
export async function loadProfile(userId: string): Promise<Profile> {
  const user = await clerkClient.users.getUser(userId);
  const primary =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
  const email = primary?.emailAddress ?? "";
  const verified = primary?.verification?.status === "verified";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || email;
  const lower = email.toLowerCase();
  const isOwner = verified && lower === OWNER_EMAIL.toLowerCase();
  let isDev = false;
  if (verified && lower) {
    const rows = await db.select({ id: devUsersTable.id }).from(devUsersTable).where(eq(devUsersTable.email, lower));
    isDev = rows.length > 0;
  }
  return { name, email, emailVerified: verified === true, isOwner, isDev };
}

/** Owner email plus every dev who has update emails switched on. */
export async function updateRecipients(): Promise<string[]> {
  const rows = await db
    .select({ email: devUsersTable.email })
    .from(devUsersTable)
    .where(eq(devUsersTable.receiveUpdates, true));
  const owner = OWNER_EMAIL.toLowerCase();
  return [owner, ...rows.map((r) => r.email).filter((e) => e !== owner)];
}

export type ClientStatus = {
  /** Plan names the client currently has (active/trialing subscriptions or paid-in-full terms). */
  plans: string[];
  /** Highest free-request allowance across those plans. */
  freeRequestsPerMonth: number;
  requestFee: number;
};

function addMonths(unixSeconds: number, months: number): number {
  const d = new Date(unixSeconds * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Looks the email up in Stripe. A client is anyone with an active or trialing
 * plan subscription, or a paid-in-full plan still inside its term
 * (term = installments × months from the purchase date).
 */
export async function clientStatus(email: string): Promise<ClientStatus> {
  const result: ClientStatus = { plans: [], ...getRequestPolicy([]) };
  if (!email || !PAYMENTS_ENABLED || !stripeReady) return result;
  const stripe = await getUncachableStripeClient();
  const customers = await stripe.customers.list({ email, limit: 10 });
  const now = Math.floor(Date.now() / 1000);
  const activePlans: PaymentPlan[] = [];

  const add = async (name: string, productId: string | null) => {
    result.plans.push(name);
    const plan = productId ? await getPlanByProductId(productId) : null;
    if (plan) activePlans.push(plan);
  };

  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 20 });
    for (const s of subs.data) {
      if (s.status !== "active" && s.status !== "trialing") continue;
      const price = s.items.data[0]?.price;
      const productId = typeof price?.product === "string" ? price.product : (price?.product?.id ?? null);
      await add(s.metadata?.["plan_name"] || "Active plan", productId);
    }
    const sessions = await stripe.checkout.sessions.list({ customer: c.id, status: "complete", limit: 50 });
    for (const sess of sessions.data) {
      const m = sess.metadata ?? {};
      if (m["pay_in_full"] !== "true" || !checkoutSettled(sess)) continue;
      // Paid-in-full bundles are covered by their follow-on hosting subscription (trialing for the term).
      if (m["service"] === "bundle") continue;
      const months = Number.parseInt(m["installments"] ?? "", 10);
      if (!Number.isFinite(months) || addMonths(sess.created, months) < now) continue;
      await add(m["plan_name"] || "Paid plan", m["product_id"] || null);
    }
  }
  result.plans = [...new Set(result.plans)];
  Object.assign(result, getRequestPolicy(activePlans));
  return result;
}

/** Free requests this client already used in the current calendar month (UTC). */
export async function freeRequestsUsedThisMonth(email: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db
    .select({ id: tweakRequestsTable.id })
    .from(tweakRequestsTable)
    .where(
      and(
        eq(tweakRequestsTable.email, email.toLowerCase()),
        eq(tweakRequestsTable.billing, "free"),
        ne(tweakRequestsTable.status, "failed"),
        gte(tweakRequestsTable.createdAt, monthStart),
      ),
    );
  return rows.length;
}
