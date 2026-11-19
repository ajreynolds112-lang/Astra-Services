import { ReplitConnectors } from "@replit/connectors-sdk";

type Env = Record<string, string | undefined>;

/** Local dev and the self-hosted (standalone) server read credentials from env, not Replit connectors. */
export const usesEnvCredentials = (env: Env) => env.ASTRA_LOCAL_DEV === "true" || env.ASTRA_STANDALONE === "true";

/** Local credentials never override the managed connection in normal Replit runs. */
export function localStripeCredentials(env: Env) {
  if (env.ASTRA_STANDALONE === "true") {
    const secretKey = env.STRIPE_SECRET_KEY;
    if (!/^(sk|rk)_(test|live)_/.test(secretKey ?? "")) {
      throw new Error("Standalone payments require STRIPE_SECRET_KEY in .env.production. Leave it blank to run without payments.");
    }
    return { secretKey: secretKey!, webhookSecret: env.STRIPE_WEBHOOK_SECRET };
  }
  if (env.ASTRA_LOCAL_DEV !== "true") return null;
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) {
    throw new Error("Local payments require a Stripe sandbox sk_test_ key in .env. Leave it blank to work on the site without payments.");
  }
  return { secretKey, webhookSecret: env.STRIPE_WEBHOOK_SECRET };
}

/** GitHub REST call via GITHUB_TOKEN (local/standalone) or the Replit GitHub connector. */
export async function githubApi(path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  if (!usesEnvCredentials(process.env)) return new ReplitConnectors().proxy("github", path, options);
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required to reach the private GitHub repositories.");
  return fetch(`https://api.github.com${path}`, {
    ...options, signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/vnd.github+json", ...options.headers, Authorization: `Bearer ${token}` },
  });
}
