import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { PAYMENTS_ENABLED, stripeReady, catalogProductIds } from "./siteStatus";
import { advertisedPlans } from "./advertisedPlans";

export type Service = "design" | "hosting" | "bundle";
export type Interval = "month" | "week" | "year";

export interface PaymentPlan {
  priceId: string;
  productId: string;
  name: string;
  description: string;
  service: Service;
  installmentAmount: number;
  currency: string;
  interval: Interval;
  installments: number | null;
  totalAmount: number | null;
  features: string[];
  featured: boolean;
  payInFull: { priceId: string; amount: number; savings: number } | null;
  afterAmount: number | null;
  /** Internal: recurring price that replaces the installment price after the plan term. */
  afterPriceId: string | null;
  freeRequestsPerMonth: number;
}

type Metadata = Record<string, string | undefined>;

interface PriceRow {
  product_id: string;
  name: string;
  description: string | null;
  product_metadata: Metadata | null;
  price_id: string;
  unit_amount: number | string | null;
  currency: string;
  recurring: { interval?: string } | null;
  price_metadata: Metadata | null;
}

/**
 * Plans are Stripe products (metadata.astra_plan = "true"). Product metadata:
 *   service = design | hosting | bundle, installments ("" = ongoing),
 *   features (pipe-separated), featured, order, free_requests (per month).
 * Prices are tagged with metadata.role: installment | full | after.
 * Untagged prices are treated as installment (recurring) or full (one-time).
 * See scripts/src/seed-plans.ts.
 */
function roleOf(row: PriceRow): string {
  return row.price_metadata?.role ?? (row.recurring ? "installment" : "full");
}

function toPlan(rows: PriceRow[]): PaymentPlan | null {
  const inst = rows.find((r) => roleOf(r) === "installment" && r.recurring);
  if (!inst) return null;
  const meta = inst.product_metadata ?? {};
  const interval = inst.recurring?.interval;
  if (interval !== "month" && interval !== "week" && interval !== "year") return null;
  const amount = Number(inst.unit_amount ?? 0);
  const service: Service =
    meta.service === "hosting" || meta.service === "bundle" ? meta.service : "design";
  const parsedInstallments = Number.parseInt(meta.installments ?? "", 10);
  const installments =
    Number.isFinite(parsedInstallments) && parsedInstallments > 0 ? parsedInstallments : null;
  const totalAmount = installments ? amount * installments : null;
  const fullRow = installments ? rows.find((r) => roleOf(r) === "full" && !r.recurring) : undefined;
  const afterRow = rows.find((r) => roleOf(r) === "after" && r.recurring?.interval === interval);
  const freeRequests = Number.parseInt(meta.free_requests ?? "0", 10);
  return {
    priceId: inst.price_id,
    productId: inst.product_id,
    name: inst.name,
    description: inst.description ?? "",
    service,
    installmentAmount: amount,
    currency: inst.currency,
    interval,
    installments,
    totalAmount,
    features: (meta.features ?? "")
      .split("|")
      .map((f) => f.trim())
      .filter(Boolean),
    featured: meta.featured === "true",
    payInFull:
      fullRow && totalAmount
        ? {
            priceId: fullRow.price_id,
            amount: Number(fullRow.unit_amount ?? 0),
            savings: totalAmount - Number(fullRow.unit_amount ?? 0),
          }
        : null,
    afterAmount: afterRow ? Number(afterRow.unit_amount ?? 0) : null,
    afterPriceId: afterRow?.price_id ?? null,
    freeRequestsPerMonth: Number.isFinite(freeRequests) && freeRequests > 0 ? freeRequests : 0,
  };
}

async function queryRows(whereExtra = sql``): Promise<PriceRow[]> {
  const result = await db.execute(sql`
    SELECT
      p.id AS product_id,
      p.name,
      p.description,
      p.metadata AS product_metadata,
      pr.id AS price_id,
      pr.unit_amount,
      pr.currency,
      pr.recurring,
      pr.metadata AS price_metadata
    FROM stripe.products p
    JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
    WHERE p.active = true
      AND p.metadata->>'astra_plan' = 'true'
      AND p.id IN (${sql.join(catalogProductIds.map((id) => sql`${id}`), sql`, `)})
      ${whereExtra}
    ORDER BY COALESCE(NULLIF(p.metadata->>'order', '')::int, 999), p.id,
      (pr.metadata->>'role' IS NULL), pr.created DESC
  `);
  return result.rows as unknown as PriceRow[];
}

function groupPlans(rows: PriceRow[]): PaymentPlan[] {
  const byProduct = new Map<string, PriceRow[]>();
  for (const r of rows) {
    const list = byProduct.get(r.product_id) ?? [];
    list.push(r);
    byProduct.set(r.product_id, list);
  }
  return [...byProduct.values()].map(toPlan).filter((p): p is PaymentPlan => p !== null);
}

/** Returns [] if Stripe hasn't been connected/synced yet (stripe schema missing). */
export async function listPlans(): Promise<PaymentPlan[]> {
  if (!PAYMENTS_ENABLED || !stripeReady) return advertisedPlans;
  try {
    return groupPlans(await queryRows());
  } catch (err) {
    logger.warn({ err }, "Could not read plans from stripe schema");
    return [];
  }
}

/** Find the plan whose installment price is priceId. */
export async function getPlanByPriceId(priceId: string): Promise<PaymentPlan | null> {
  if (!stripeReady) return null;
  try {
    const rows = await queryRows(
      sql`AND p.id = (SELECT product FROM stripe.prices WHERE id = ${priceId})`,
    );
    return groupPlans(rows).find((p) => p.priceId === priceId) ?? null;
  } catch (err) {
    logger.warn({ err }, "Could not read plan from stripe schema");
    return null;
  }
}

/** Plan by product id (used to look up entitlements for a subscription or purchase). */
export async function getPlanByProductId(productId: string): Promise<PaymentPlan | null> {
  if (!stripeReady) return null;
  try {
    return groupPlans(await queryRows(sql`AND p.id = ${productId}`))[0] ?? null;
  } catch (err) {
    logger.warn({ err }, "Could not read plan from stripe schema");
    return null;
  }
}

/** Select the server-determined tier's fee, never the newest fee across all tiers. */
export async function getRequestFeePrice(amount = 2000): Promise<{ priceId: string; amount: number } | null> {
  if (!stripeReady) return null;
  try {
    const result = await db.execute(sql`
      SELECT pr.id AS price_id, pr.unit_amount
      FROM stripe.products p
      JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true AND p.metadata->>'astra_request_fee' = 'true'
        AND (pr.recurring IS NULL OR pr.recurring = 'null'::jsonb)
        AND pr.unit_amount = ${amount}
        AND pr.currency = 'usd'
        AND pr.metadata->>'role' = ${amount === 2500 ? "hosting_fee" : "fee"}
        AND p.id IN (${sql.join(catalogProductIds.map((id) => sql`${id}`), sql`, `)})
      ORDER BY pr.created DESC
      LIMIT 1
    `);
    const row = result.rows[0] as { price_id: string; unit_amount: number | string } | undefined;
    return row ? { priceId: row.price_id, amount: Number(row.unit_amount) } : null;
  } catch (err) {
    logger.warn({ err }, "Could not read request fee from stripe schema");
    return null;
  }
}
