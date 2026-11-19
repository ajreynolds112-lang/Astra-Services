import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { advertisedPlans } from "./advertisedPlans";
import { ensureCatalog } from "./catalog";

function fixture(monthlyAmount = 30000, failCreate = false, fullAmount = 288000) {
  const products: Array<{ id: string; name: string; metadata: Record<string, string> }> = advertisedPlans.map((plan) => ({
    id: plan.productId, name: plan.name, metadata: {
      astra_plan: "true", installments: plan.productId === "catalog-design-hosting" ? "12" : String(plan.installments ?? ""),
      features: plan.features.join("|"), free_requests: plan.service === "hosting" ? "2" : String(plan.freeRequestsPerMonth),
    },
  }));
  products.push({ id: "fee", name: "App Tweak Request", metadata: { astra_request_fee: "true" } });
  const prices: Array<{
    id: string; product: string; unit_amount: number; currency: string;
    recurring: { interval: string } | null; metadata: { role: string }; active: boolean;
  }> = [];
  function add(product: string, role: string, amount: number, interval?: string) {
    const price = {
      id: `price-${prices.length}`, product, unit_amount: amount, currency: "usd",
      recurring: interval ? { interval } : null, metadata: { role }, active: true,
    };
    prices.push(price);
    return price;
  }
  for (const plan of advertisedPlans) {
    add(plan.productId, "installment", plan.productId === "catalog-design-hosting" ? monthlyAmount : plan.installmentAmount, plan.interval);
    if (plan.payInFull) add(plan.productId, "full", plan.productId === "catalog-design-hosting" ? fullAmount : plan.payInFull.amount);
    if (plan.afterAmount) add(plan.productId, "after", plan.afterAmount, plan.interval);
  }
  add("fee", "fee", 2000);
  const events: string[] = [];
  const stripe = {
    products: {
      async *list() { yield* products; },
      async update(id: string, input: { metadata: Record<string, string> }) {
        return Object.assign(products.find((product) => product.id === id)!, input);
      },
    },
    prices: {
      async list({ product }: { product: string }) {
        return { data: prices.filter((price) => price.product === product && price.active) };
      },
      async create(input: Stripe.PriceCreateParams) {
        if (failCreate) throw new Error("Creation failed");
        events.push(`create:${input.unit_amount}`);
        return add(String(input.product), String(input.metadata?.role), input.unit_amount!, input.recurring?.interval);
      },
      async update(id: string, input: { active: boolean }) {
        events.push(`archive:${id}`);
        Object.assign(prices.find((price) => price.id === id)!, input);
      },
    },
  } as unknown as Stripe;
  return { stripe, prices, events, products };
}

test("approved bundle reduction creates new prices before archiving old ones, and is idempotent", async () => {
  const { stripe, prices, events } = fixture();
  await ensureCatalog(stripe);
  const active = prices.filter((price) => price.product === "catalog-design-hosting" && price.active);
  assert.deepEqual(active.map((price) => price.unit_amount).sort((a, b) => a - b), [8900, 25000, 160000]);
  assert.equal(prices.find((price) => price.unit_amount === 30000)?.active, false);
  assert.equal(prices.find((price) => price.unit_amount === 288000)?.active, false);
  assert.equal(events[0], "create:25000");
  assert.ok(events[1].startsWith("archive:"));
  assert.equal(events[2], "create:160000");
  const count = events.length;
  await ensureCatalog(stripe);
  assert.equal(events.length, count);
});

test("failed replacement leaves the old recurring price active", async () => {
  const { stripe, prices } = fixture(30000, true);
  await assert.rejects(ensureCatalog(stripe), /Creation failed/);
  assert.equal(prices.find((price) => price.unit_amount === 30000)?.active, true);
});

test("unexpected existing amounts still stop catalog initialization", async () => {
  const { stripe, events } = fixture(31000);
  await assert.rejects(ensureCatalog(stripe), /does not match approved ASTRA pricing/);
  assert.deepEqual(events, []);
});

test("advertised installment, total, and pay-in-full amounts agree", () => {
  const bundle = advertisedPlans.find((plan) => plan.service === "bundle")!;
  assert.equal(bundle.installmentAmount, 25000);
  assert.equal(bundle.installments, 8);
  assert.equal(bundle.totalAmount, 200000);
  assert.equal(bundle.totalAmount, bundle.installmentAmount * bundle.installments!);
  assert.equal(bundle.payInFull!.amount, bundle.totalAmount! * 0.8);
  assert.equal(bundle.payInFull!.savings, bundle.totalAmount! - bundle.payInFull!.amount);
});

test("flexible bundle schedules retain their own totals, terms, hosting and request benefits", async () => {
  const { stripe, prices, products } = fixture(25000, false, 160000);
  await ensureCatalog(stripe);
  const bundles = advertisedPlans.filter((plan) => plan.service === "bundle");
  assert.deepEqual(bundles.map((plan) => [plan.installmentAmount, plan.installments, plan.totalAmount]), [
    [25000, 8, 200000], [17500, 12, 210000], [15000, 15, 225000],
  ]);
  for (const plan of bundles) {
    assert.equal(plan.freeRequestsPerMonth, plan.installments === 8 ? 2 : 1);
    assert.equal(plan.afterAmount, 8900);
    if (plan.installments === 8) assert.equal(plan.payInFull!.amount, plan.totalAmount! * 0.8);
    else assert.equal(plan.payInFull, null);
    assert.ok(plan.features.includes(`Hosting continues at $89/month after ${plan.installments} months`));
    assert.equal(products.find((product) => product.id === plan.productId)!.metadata.installments, String(plan.installments));
    assert.ok(prices.some((price) => price.product === plan.productId && price.metadata.role === "installment" && price.unit_amount === plan.installmentAmount && price.active));
  }
});

test("the $150 schedule replaces fourteen months with fifteen without leaving a duplicate product", async () => {
  const { stripe, prices, products } = fixture(25000, false, 160000);
  const product = products.find((p) => p.name === "Design + Hosting (15 months)")!;
  product.name = "Design + Hosting (14 months)";
  product.metadata.installments = "14";
  const monthly = prices.find((p) => p.product === product.id && p.metadata.role === "installment")!;
  await ensureCatalog(stripe);
  assert.equal(product.name, "Design + Hosting (15 months)");
  assert.equal(product.metadata.installments, "15");
  assert.equal(monthly.unit_amount, 15000);
  assert.equal(monthly.active, true);
  assert.ok(!prices.some((p) => p.product === product.id && p.metadata.role === "full" && p.active));
  assert.equal(products.filter((p) => p.name === "Design + Hosting (15 months)").length, 1);
  await ensureCatalog(stripe);
});

test("flexible schedules retire upfront prices and reduce allowances without changing monthly or follow-on prices", async () => {
  const { stripe, prices, products } = fixture(25000, false, 160000);
  const flexible = advertisedPlans.filter((p) => p.service === "bundle" && p.installments !== 8);
  for (const plan of flexible) {
    products.find((p) => p.id === plan.productId)!.metadata.free_requests = "2";
    prices.push({
      id: `old-full-${plan.productId}`, product: plan.productId,
      unit_amount: plan.installments === 12 ? 168000 : 180000,
      currency: "usd", recurring: null, metadata: { role: "full" }, active: true,
    });
  }
  await ensureCatalog(stripe);
  for (const plan of flexible) {
    assert.equal(products.find((p) => p.id === plan.productId)!.metadata.free_requests, "1");
    assert.ok(plan.features.includes("1 free app tweak request every month"));
    assert.equal(prices.find((p) => p.id === `old-full-${plan.productId}`)!.active, false);
    assert.ok(prices.some((p) => p.product === plan.productId && p.metadata.role === "installment" && p.unit_amount === plan.installmentAmount && p.active));
    assert.ok(prices.some((p) => p.product === plan.productId && p.metadata.role === "after" && p.unit_amount === 8900 && p.active));
  }
  assert.ok(prices.some((p) => p.product === "catalog-design-hosting" && p.metadata.role === "full" && p.unit_amount === 160000 && p.active));
  await ensureCatalog(stripe);
});

test("the existing $250 plan adopts eight-month checkout terms without changing the $89 hosting price", async () => {
  const { stripe, prices, products } = fixture(25000, false, 240000);
  const hosting = prices.find((price) => price.unit_amount === 8900)!;
  const monthly = prices.find((price) => price.unit_amount === 25000)!;
  await ensureCatalog(stripe);
  const bundle = products.find((product) => product.id === "catalog-design-hosting")!;
  assert.equal(bundle.metadata.installments, "8");
  assert.ok(bundle.metadata.features.includes("8 months of managed hosting included"));
  assert.equal(monthly.active, true);
  assert.equal(hosting.active, true);
  assert.equal(hosting.unit_amount, 8900);
  assert.equal(prices.find((price) => price.unit_amount === 240000)?.active, false);
  assert.equal(prices.find((price) => price.unit_amount === 160000)?.active, true);
});

test("Managed Hosting removes the old free allowance and provisions a separate $25 request price", async () => {
  const { stripe, prices, products } = fixture(25000, false, 160000);
  await ensureCatalog(stripe);
  const hosting = advertisedPlans.find((plan) => plan.service === "hosting")!;
  assert.equal(hosting.installmentAmount, 9900);
  assert.equal(hosting.freeRequestsPerMonth, 0);
  assert.ok(hosting.features.includes("App tweak requests: $25 each, done in under a day"));
  assert.equal(products.find((product) => product.id === hosting.productId)!.metadata.free_requests, "0");
  assert.ok(prices.some((price) => price.product === "fee" && price.metadata.role === "hosting_fee" && price.unit_amount === 2500 && price.active));
  assert.ok(prices.some((price) => price.product === "fee" && price.metadata.role === "fee" && price.unit_amount === 2000 && price.active));
  const count = prices.length;
  await ensureCatalog(stripe);
  assert.equal(prices.length, count);
});