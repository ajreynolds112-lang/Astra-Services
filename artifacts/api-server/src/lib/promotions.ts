import type Stripe from "stripe";
import type { Promotion, PromotionInput, PromotionPurchase } from "@workspace/api-zod";

export class PromotionError extends Error {
  constructor(message: string, public status: number = 400) { super(message); }
}

export function promotionCouponParams(input: PromotionInput): Stripe.CouponCreateParams {
  if (!Number.isFinite(input.value) || input.value <= 0 || input.value > 10000
    || Math.abs(input.value * 100 - Math.round(input.value * 100)) > 1e-7) {
    throw new PromotionError("Enter a positive discount with no more than two decimal places.");
  }
  if (input.discountType === "percent" && input.value > 100) {
    throw new PromotionError("Percentage discounts cannot exceed 100%.");
  }
  return {
    name: input.code.toUpperCase(),
    duration: input.duration,
    expand: ["applies_to"],
    metadata: { source: "astra-promo" },
    ...(input.discountType === "percent"
      ? { percent_off: input.value }
      : { amount_off: Math.round(input.value * 100), currency: "usd" }),
    ...(input.productId ? { applies_to: { products: [input.productId] } } : {}),
  };
}

export async function listPromotionPurchases(stripe: Stripe): Promise<PromotionPurchase[]> {
  const purchases: PromotionPurchase[] = [];
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.metadata.astra_plan !== "true" && product.metadata.astra_request_fee !== "true") continue;
    purchases.push({
      id: product.id,
      name: product.metadata.astra_request_fee === "true"
        ? `${product.name} ($20 and $25 Requests)`
        : `${product.name}${product.metadata.installments ? ` · ${product.metadata.installments} payments` : ""}`,
    });
  }
  return purchases;
}

function serializePromotion(promo: Stripe.PromotionCode, coupon: Stripe.Coupon): Promotion {
  return {
    id: promo.id, code: promo.code, active: promo.active && coupon.valid,
    discountType: coupon.percent_off != null ? "percent" : "amount",
    value: coupon.percent_off ?? (coupon.amount_off ?? 0) / 100,
    duration: coupon.duration,
    productIds: coupon.applies_to?.products ?? [],
    timesRedeemed: promo.times_redeemed,
    maxRedemptions: promo.max_redemptions,
  };
}

export async function listStudioPromotions(stripe: Stripe): Promise<Promotion[]> {
  const promos = await stripe.promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon.applies_to"] });
  const result: Promotion[] = [];
  for (const promo of promos.data) {
    if (promo.metadata?.source !== "astra-promo") continue;
    const expanded = promo.promotion.coupon;
    const coupon = typeof expanded === "string" ? await stripe.coupons.retrieve(expanded, { expand: ["applies_to"] }) : expanded;
    if (coupon && !("deleted" in coupon)) result.push(serializePromotion(promo, coupon));
  }
  return result;
}

export async function createStudioPromotion(stripe: Stripe, input: PromotionInput): Promise<Promotion> {
  const params = promotionCouponParams(input);
  const code = input.code.toUpperCase();
  const existing = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
  if (existing.data.length) throw new PromotionError("That promo code already exists.", 409);
  if (input.productId) {
    const purchases = await listPromotionPurchases(stripe);
    if (!purchases.some((purchase) => purchase.id === input.productId)) {
      throw new PromotionError("That purchase type is no longer available. Refresh and try again.");
    }
  }
  const coupon = await stripe.coupons.create(params);
  let promo: Stripe.PromotionCode;
  try {
    promo = await stripe.promotionCodes.create({
      code, promotion: { type: "coupon", coupon: coupon.id },
      metadata: { source: "astra-promo" },
      ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
    });
  } catch (error) {
    try { await stripe.coupons.del(coupon.id); }
    catch { throw new Error("Promo creation failed and its unused coupon could not be removed. Check Stripe before retrying."); }
    throw error;
  }
  return serializePromotion(promo, coupon);
}