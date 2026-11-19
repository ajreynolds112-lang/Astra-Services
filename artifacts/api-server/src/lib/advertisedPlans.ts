import type { PaymentPlan } from "./plans";

// Published service pricing, not checkout prices. These deliberately have no
// Stripe identifiers; checkout must remain disabled until Stripe is connected.
export const advertisedPlans: PaymentPlan[] = [
  {
    priceId: "catalog-app-design", productId: "catalog-app-design",
    name: "App Design",
    description: "Your app designed and built in about two weeks, from first sketch to launch-ready.",
    service: "design", installmentAmount: 20000, currency: "usd", interval: "month",
    installments: 5, totalAmount: 100000, featured: false,
    features: [
      "Built in around 2 weeks", "Discovery and product strategy",
      "Custom screens for iOS, Android, or web", "Launch-ready handoff",
      "App tweak requests: $20 each, done in under a day",
    ],
    payInFull: { priceId: "catalog-app-design-full", amount: 80000, savings: 20000 },
    afterAmount: null, afterPriceId: null, freeRequestsPerMonth: 0,
  },
  {
    priceId: "catalog-design-hosting", productId: "catalog-design-hosting",
    name: "Design + Hosting",
    description: "Your app designed, built, launched, and hosted — one plan, one monthly payment.",
    service: "bundle", installmentAmount: 25000, currency: "usd", interval: "month",
    installments: 8, totalAmount: 200000, featured: true,
    features: [
      "Everything in App Design", "8 months of managed hosting included",
      "2 free app tweak requests every month", "Monitoring, backups, and SSL",
      "Hosting continues at $89/month after 8 months",
    ],
    payInFull: { priceId: "catalog-design-hosting-full", amount: 160000, savings: 40000 },
    afterAmount: 8900, afterPriceId: null, freeRequestsPerMonth: 2,
  },
  {
    priceId: "catalog-managed-hosting", productId: "catalog-managed-hosting",
    name: "Managed Hosting",
    description: "Reliable, fully managed hosting for your app. Billed monthly, cancel anytime.",
    service: "hosting", installmentAmount: 9900, currency: "usd", interval: "month",
    installments: null, totalAmount: null, featured: false,
    features: [
      "Managed cloud hosting", "App tweak requests: $25 each, done in under a day",
      "Daily backups", "SSL and custom domain", "Uptime monitoring",
    ],
    payInFull: null, afterAmount: null, afterPriceId: null, freeRequestsPerMonth: 0,
  },
];

// Separate Stripe products keep each schedule's term and entitlements explicit.
const bundle = advertisedPlans.find((plan) => plan.service === "bundle")!;
for (const [amount, months] of [[17500, 12], [15000, 15]]) {
  advertisedPlans.push({
    ...bundle,
    priceId: `catalog-design-hosting-${months}`,
    productId: `catalog-design-hosting-${months}`,
    name: `Design + Hosting (${months} months)`,
    installmentAmount: amount,
    installments: months,
    totalAmount: amount * months,
    features: bundle.features.map((feature) => feature
      .replaceAll("8 months", `${months} months`)
      .replace("2 free app tweak requests every month", "1 free app tweak request every month")),
    payInFull: null,
    freeRequestsPerMonth: 1,
  });
}