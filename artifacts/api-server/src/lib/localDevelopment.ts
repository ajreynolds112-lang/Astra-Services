/** Local credentials never override the managed connection in normal Replit runs. */
export function localStripeCredentials(env: Record<string, string | undefined>) {
  if (env.ASTRA_LOCAL_DEV !== "true") return null;
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) {
    throw new Error("Local payments require a Stripe sandbox sk_test_ key in .env. Leave it blank to work on the site without payments.");
  }
  return { secretKey, webhookSecret: env.STRIPE_WEBHOOK_SECRET };
}
