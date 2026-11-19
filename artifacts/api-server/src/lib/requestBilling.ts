import type { Logger } from "pino";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db, tweakRequestsTable, type TweakRequestRow } from "@workspace/db";
import type { TweakRequestInput } from "@workspace/api-zod";
import { deliverTweakRequest } from "./tweakRequest";
import { getUncachableStripeClient } from "./stripeClient";
import { logger } from "./logger";
import { checkoutSettled } from "./checkoutStatus";

/**
 * Atomically claim a stored request and deliver it (repo file + emails).
 * Returns the delivered row, or null if another process already claimed it.
 * On failure the row goes back to its previous status so it can be retried.
 */
export async function deliverStoredRequest(row: TweakRequestRow, log: Logger): Promise<TweakRequestRow | null> {
  const [claimed] = await db
    .update(tweakRequestsTable)
    .set({ status: "delivering" })
    .where(and(eq(tweakRequestsTable.id, row.id), eq(tweakRequestsTable.status, row.status)))
    .returning();
  if (!claimed) return null;
  try {
    const result = await deliverTweakRequest({
      profile: { name: row.name, email: row.email },
      planLabel: row.planLabel,
      r: row.payload as TweakRequestInput,
      test: false,
      log,
    });
    const [done] = await db
      .update(tweakRequestsTable)
      .set({ status: "delivered", fileName: result.fileName, emailed: result.emailed, deliveredAt: new Date() })
      .where(eq(tweakRequestsTable.id, row.id))
      .returning();
    return done!;
  } catch (err) {
    // Free/staff requests that never reached the repo are marked failed (they don't use up the allowance);
    // paid ones go back to pending_payment so the sweep or the confirm call retries delivery.
    await db
      .update(tweakRequestsTable)
      .set({ status: row.billing === "paid" ? "pending_payment" : "failed" })
      .where(eq(tweakRequestsTable.id, row.id));
    throw err;
  }
}

/** Backstop: deliver paid requests whose customer closed the tab before returning to the portal. */
export async function sweepPaidRequests(): Promise<void> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(tweakRequestsTable)
    .where(
      and(
        eq(tweakRequestsTable.status, "pending_payment"),
        isNotNull(tweakRequestsTable.checkoutSessionId),
        gte(tweakRequestsTable.createdAt, since),
      ),
    );
  if (rows.length === 0) return;
  const stripe = await getUncachableStripeClient();
  for (const row of rows) {
    try {
      const session = await stripe.checkout.sessions.retrieve(row.checkoutSessionId!);
      if (!checkoutSettled(session)) continue;
      await deliverStoredRequest(row, logger);
      logger.info({ requestId: row.id }, "Delivered paid tweak request from sweep");
    } catch (err) {
      logger.error({ err, requestId: row.id }, "Sweep failed to deliver paid tweak request");
    }
  }
}
