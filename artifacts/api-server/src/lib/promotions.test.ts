import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { createStudioPromotion, listStudioPromotions, promotionCouponParams } from "./promotions";
import { checkoutSettled } from "./checkoutStatus";

test("percent promos apply to all purchases by default and never change base prices", () => {
  const params = promotionCouponParams({ code: "SAVE20", discountType: "percent", value: 20, duration: "once" });
  assert.equal(params.percent_off, 20);
  assert.equal(params.duration, "once");
  assert.equal(params.applies_to, undefined);
  assert.equal(params.amount_off, undefined);
});

test("fixed discounts use USD cents and can cover the Requests product", () => {
  const params = promotionCouponParams({
    code: "REQUEST5", discountType: "amount", value: 5.25, duration: "forever", productId: "prod_requests",
  });
  assert.equal(params.amount_off, 525);
  assert.equal(params.currency, "usd");
  assert.deepEqual(params.applies_to, { products: ["prod_requests"] });
  for (const value of [0, -1, 5.001]) {
    assert.throws(() => promotionCouponParams({ code: "TEST", discountType: "amount", value, duration: "once" }));
  }
  assert.throws(() => promotionCouponParams({ code: "TEST", discountType: "percent", value: 101, duration: "once" }));
});

test("duplicate codes cannot create orphan coupons", async () => {
  let couponsCreated = 0;
  const stripe = {
    promotionCodes: { list: async () => ({ data: [{ id: "existing" }] }) },
    coupons: { create: async () => { couponsCreated++; } },
  } as unknown as Stripe;
  await assert.rejects(createStudioPromotion(stripe, { code: "duplicate", discountType: "percent", value: 10, duration: "once" }), /already exists/);
  assert.equal(couponsCreated, 0);
});

test("failed promo creation cleans up its coupon and does not claim success", async () => {
  const removed: string[] = [];
  const stripe = {
    promotionCodes: {
      list: async () => ({ data: [] }),
      create: async () => { throw new Error("Stripe unavailable"); },
    },
    coupons: { create: async () => ({ id: "coupon_new" }), del: async (id: string) => removed.push(id) },
  } as unknown as Stripe;
  await assert.rejects(createStudioPromotion(stripe, { code: "NEW", discountType: "percent", value: 10, duration: "once" }), /Stripe unavailable/);
  assert.deepEqual(removed, ["coupon_new"]);
});

test("creation persists the supported Requests scope and redemption cap in Stripe", async () => {
  let couponParams: Stripe.CouponCreateParams | undefined;
  let codeParams: Stripe.PromotionCodeCreateParams | undefined;
  const stripe = {
    products: { list: async function* () {
      yield { id: "prod_requests", name: "App Tweak Request", metadata: { astra_request_fee: "true" } };
    } },
    promotionCodes: {
      list: async () => ({ data: [] }),
      create: async (params: Stripe.PromotionCodeCreateParams) => {
        codeParams = params;
        return { id: "promo_new", code: params.code, active: true, times_redeemed: 0, max_redemptions: params.max_redemptions };
      },
    },
    coupons: { create: async (params: Stripe.CouponCreateParams) => {
      couponParams = params;
      return { ...params, id: "coupon_new", valid: true };
    } },
  } as unknown as Stripe;
  const result = await createStudioPromotion(stripe, {
    code: "request-5", discountType: "amount", value: 5, duration: "once", productId: "prod_requests", maxRedemptions: 3,
  });
  assert.equal(couponParams?.amount_off, 500);
  assert.deepEqual(couponParams?.expand, ["applies_to"]);
  assert.deepEqual(couponParams?.applies_to, { products: ["prod_requests"] });
  assert.deepEqual(codeParams?.promotion, { type: "coupon", coupon: "coupon_new" });
  assert.equal(codeParams?.max_redemptions, 3);
  assert.deepEqual(result.productIds, ["prod_requests"]);
  assert.equal(result.code, "REQUEST-5");
  assert.equal(result.value, 5);
});

test("full discounts settle completed checkout but never unfinished or unpaid sessions", () => {
  assert.equal(checkoutSettled({ status: "complete", payment_status: "paid" }), true);
  assert.equal(checkoutSettled({ status: "complete", payment_status: "no_payment_required" }), true);
  assert.equal(checkoutSettled({ status: "open", payment_status: "no_payment_required" }), false);
  assert.equal(checkoutSettled({ status: "complete", payment_status: "unpaid" }), false);
});

test("promo listing explicitly expands Stripe's otherwise omitted product restrictions", async () => {
  const stripe = {
    promotionCodes: { list: async (params: Stripe.PromotionCodeListParams) => {
      assert.deepEqual(params.expand, ["data.promotion.coupon.applies_to"]);
      return { data: [{
        id: "promo_requests", code: "REQUEST-5", active: true, times_redeemed: 0, max_redemptions: null,
        metadata: { source: "astra-promo" },
        promotion: { coupon: {
          valid: true, percent_off: null, amount_off: 500, duration: "once",
          applies_to: { products: ["prod_requests"] },
        } },
      }] };
    } },
  } as unknown as Stripe;
  const promos = await listStudioPromotions(stripe);
  assert.deepEqual(promos[0].productIds, ["prod_requests"]);
});