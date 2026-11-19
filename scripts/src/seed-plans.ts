import { getUncachableStripeClient } from "./stripeClient";

/**
 * Syncs ASTRA's catalog in Stripe. Idempotent: run it again after editing.
 *
 * Plans are Stripe products with metadata.astra_plan = "true". Each plan has
 * prices tagged with price metadata.role:
 *   installment — the recurring price customers pay per period (required)
 *   full        — one-time "pay in full upfront" price (optional, 20% off)
 *   after       — recurring price that takes over once the installments end (optional)
 *
 * The per-request fee is a separate product with metadata.astra_request_fee = "true".
 *
 * Changing an amount creates a new price and archives the old one.
 * Existing subscribers keep the price they signed up with.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seed-plans.ts
 */
type Interval = "month" | "week" | "year";

interface PlanSeed {
  name: string;
  description: string;
  service: "design" | "hosting" | "bundle";
  installment: { amountCents: number; interval: Interval; count: number | null };
  fullCents?: number;
  after?: { amountCents: number; interval: Interval };
  freeRequestsPerMonth: number;
  features: string[];
  featured?: boolean;
  order: number;
}

const PAY_IN_FULL_DISCOUNT = 0.2;
const full = (perPayment: number, count: number) => Math.round(perPayment * count * (1 - PAY_IN_FULL_DISCOUNT));

const PLANS: PlanSeed[] = [
  {
    name: "App Design",
    description: "Your app designed and built in about two weeks, from first sketch to launch-ready.",
    service: "design",
    installment: { amountCents: 20000, interval: "month", count: 5 },
    fullCents: full(20000, 5),
    freeRequestsPerMonth: 0,
    features: [
      "Built in around 2 weeks",
      "Discovery and product strategy",
      "Custom screens for iOS, Android, or web",
      "Launch-ready handoff",
      "App tweak requests: $20 each, done in under a day",
    ],
    order: 1,
  },
  {
    name: "Design + Hosting",
    description: "Your app designed, built, launched, and hosted — one plan, one monthly payment.",
    service: "bundle",
    installment: { amountCents: 25000, interval: "month", count: 8 },
    fullCents: full(25000, 8),
    after: { amountCents: 8900, interval: "month" },
    freeRequestsPerMonth: 2,
    features: [
      "Everything in App Design",
      "8 months of managed hosting included",
      "2 free app tweak requests every month",
      "Monitoring, backups, and SSL",
      "Hosting continues at $89/month after 8 months",
    ],
    featured: true,
    order: 2,
  },
  {
    name: "Managed Hosting",
    description: "Reliable, fully managed hosting for your app. Billed monthly, cancel anytime.",
    service: "hosting",
    installment: { amountCents: 9900, interval: "month", count: null },
    freeRequestsPerMonth: 0,
    features: [
      "Managed cloud hosting",
      "App tweak requests: $25 each, done in under a day",
      "Daily backups",
      "SSL and custom domain",
      "Uptime monitoring",
    ],
    order: 3,
  },
];

const REQUEST_FEE = { name: "App Tweak Request", amountCents: 2000 };
const bundle = PLANS.find((plan) => plan.service === "bundle")!;
for (const [amountCents, count] of [[17500, 12], [15000, 15]]) {
  PLANS.push({
    ...bundle,
    name: `Design + Hosting (${count} months)`,
    installment: { amountCents, interval: "month", count },
    fullCents: undefined,
    freeRequestsPerMonth: 1,
    features: bundle.features.map((feature) => feature
      .replaceAll("8 months", `${count} months`)
      .replace("2 free app tweak requests every month", "1 free app tweak request every month")),
    order: PLANS.length + 1,
  });
}

type Stripe = Awaited<ReturnType<typeof getUncachableStripeClient>>;

async function findProduct(stripe: Stripe, query: string) {
  const res = await stripe.products.search({ query, limit: 5 });
  return res.data[0] ?? null;
}

/** Make sure exactly one active price with this role matches; archive the rest. */
async function ensurePrice(
  stripe: Stripe,
  productId: string,
  role: string,
  amountCents: number,
  interval: Interval | null,
): Promise<string> {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const legacyRole = (p: (typeof prices.data)[number]) =>
    p.metadata?.["role"] ?? (p.recurring ? "installment" : "full");
  const sameRole = prices.data.filter((p) => legacyRole(p) === role);
  const match = sameRole.find(
    (p) =>
      p.unit_amount === amountCents &&
      (interval ? p.recurring?.interval === interval : !p.recurring),
  );
  for (const p of sameRole) {
    if (p.id !== match?.id) {
      await stripe.prices.update(p.id, { active: false });
      console.log(`  archived ${role} price ${p.id} (${p.unit_amount})`);
    }
  }
  if (match) {
    if (match.metadata?.["role"] !== role) await stripe.prices.update(match.id, { metadata: { role } });
    return match.id;
  }
  const created = await stripe.prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "usd",
    ...(interval ? { recurring: { interval } } : {}),
    metadata: { role },
  });
  console.log(`  created ${role} price ${created.id} (${amountCents})`);
  return created.id;
}

async function main() {
  const stripe = await getUncachableStripeClient();

  for (const plan of PLANS) {
    const metadata = {
      astra_plan: "true",
      service: plan.service,
      installments: plan.installment.count ? String(plan.installment.count) : "",
      features: plan.features.join("|"),
      featured: plan.featured ? "true" : "false",
      order: String(plan.order),
      free_requests: String(plan.freeRequestsPerMonth),
    };
    let product = await findProduct(
      stripe,
      `name:'${plan.name}' AND active:'true' AND metadata['astra_plan']:'true'`,
    );
    if (!product && plan.name === "Design + Hosting (15 months)") {
      product = await findProduct(stripe, "name:'Design + Hosting (14 months)' AND active:'true' AND metadata['astra_plan']:'true'");
    }
    product = product
      ? await stripe.products.update(product.id, { name: plan.name, description: plan.description, metadata })
      : await stripe.products.create({ name: plan.name, description: plan.description, metadata });
    console.log(`${plan.name} (${product.id})`);

    await ensurePrice(stripe, product.id, "installment", plan.installment.amountCents, plan.installment.interval);
    if (plan.fullCents) await ensurePrice(stripe, product.id, "full", plan.fullCents, null);
    else {
      const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
      for (const price of prices.data) {
        if ((price.metadata.role ?? (price.recurring ? "installment" : "full")) === "full") {
          await stripe.prices.update(price.id, { active: false });
        }
      }
    }
    if (plan.after) await ensurePrice(stripe, product.id, "after", plan.after.amountCents, plan.after.interval);
  }

  let fee = await findProduct(stripe, `active:'true' AND metadata['astra_request_fee']:'true'`);
  fee ??= await stripe.products.create({
    name: REQUEST_FEE.name,
    description: "One app tweak request, delivered in under a day.",
    metadata: { astra_request_fee: "true" },
  });
  console.log(`${REQUEST_FEE.name} (${fee.id})`);
  await ensurePrice(stripe, fee.id, "fee", REQUEST_FEE.amountCents, null);
  await ensurePrice(stripe, fee.id, "hosting_fee", 2500, null);
}

main().catch((err) => {
  console.error("Sync failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
