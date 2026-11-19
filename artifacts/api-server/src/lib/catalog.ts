import type Stripe from "stripe";
import { advertisedPlans } from "./advertisedPlans";

/**
 * Provision missing entries in the approved ASTRA catalog on connection.
 * Approved reductions create new checkout prices; existing subscriptions keep
 * their original prices. Unexpected pricing differences still fail explicitly.
 */
export async function ensureCatalog(stripe: Stripe): Promise<void> {
  const products: Stripe.Product[] = [];
  for await (const product of stripe.products.list({ limit: 100, active: true })) products.push(product);

  async function ensurePrice(productId: string, role: string, amount: number, interval?: Stripe.PriceCreateParams.Recurring.Interval, previousAmounts: number[] = []) {
    const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
    const sameRole = prices.data.filter((price) =>
      (price.metadata.role ?? (price.recurring ? "installment" : "full")) === role,
    );
    for (const price of sameRole) {
      if ((price.unit_amount !== amount && !previousAmounts.includes(price.unit_amount ?? -1)) || price.currency !== "usd" ||
          (interval ? price.recurring?.interval !== interval : price.recurring != null)) {
        throw new Error(`Existing ${role} price for ${productId} does not match approved ASTRA pricing`);
      }
    }
    if (!sameRole.some((price) => price.unit_amount === amount)) {
      await stripe.prices.create({
        product: productId, currency: "usd", unit_amount: amount,
        ...(interval ? { recurring: { interval } } : {}),
        metadata: { role },
      }, { idempotencyKey: `astra-catalog-${productId}-${role}-${amount}` });
    }
    // Archive only after the replacement exists. Stripe retains archived
    // prices for current subscriptions, so this does not alter their bills.
    for (const price of sameRole) {
      if (price.unit_amount !== amount) await stripe.prices.update(price.id, { active: false });
    }
  }

  for (const plan of advertisedPlans) {
    const product = products.find((p) => p.metadata.astra_plan === "true" && p.name === plan.name)
      ?? (plan.name === "Design + Hosting (15 months)"
        ? products.find((p) => p.metadata.astra_plan === "true" && p.name === "Design + Hosting (14 months)")
        : undefined)
      ?? await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: {
        astra_plan: "true",
        service: plan.service,
        installments: plan.installments ? String(plan.installments) : "",
        features: plan.features.join("|"),
        featured: String(plan.featured),
        order: String(advertisedPlans.indexOf(plan) + 1),
        free_requests: String(plan.freeRequestsPerMonth),
      },
    }, { idempotencyKey: `astra-catalog-${plan.productId}` });
    await ensurePrice(product.id, "installment", plan.installmentAmount, plan.interval, plan.service === "bundle" ? [30000] : []);
    if (plan.payInFull) {
      await ensurePrice(product.id, "full", plan.payInFull.amount, undefined,
        plan.name === "Design + Hosting (15 months)" ? [168000] : plan.service === "bundle" ? [288000, 240000] : []);
    } else {
      const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
      for (const price of prices.data) {
        if ((price.metadata.role ?? (price.recurring ? "installment" : "full")) === "full") {
          await stripe.prices.update(price.id, { active: false });
        }
      }
    }
    if (plan.afterAmount) {
      await ensurePrice(product.id, "after", plan.afterAmount, plan.interval);
    }
    const installments = plan.installments ? String(plan.installments) : "";
    const features = plan.features.join("|");
    const free_requests = String(plan.freeRequestsPerMonth);
    if (product.name !== plan.name || product.metadata.installments !== installments || product.metadata.features !== features || product.metadata.free_requests !== free_requests) {
      // Existing subscriptions and paid checkout sessions keep their own
      // term metadata; this changes the terms offered to new checkouts only.
      await stripe.products.update(product.id, {
        name: plan.name,
        metadata: { ...product.metadata, installments, features, free_requests },
      });
    }
  }
  const fee = products.find((p) => p.metadata.astra_request_fee === "true")
    ?? await stripe.products.create({
    name: "App Tweak Request",
    description: "One app tweak request, delivered in under a day.",
    metadata: { astra_request_fee: "true" },
  }, { idempotencyKey: "astra-catalog-request-fee" });
  await ensurePrice(fee.id, "fee", 2000);
  await ensurePrice(fee.id, "hosting_fee", 2500);
}