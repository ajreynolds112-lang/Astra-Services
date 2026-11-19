import type { Request } from "express";

/** Public origin of the site that made this request (used for Stripe redirect URLs). */
export function siteOrigin(req: Request): string {
  const origin = req.get("origin");
  if (origin) return origin;
  const proto = req.get("x-forwarded-proto")?.split(",")[0] ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  return `${proto}://${host}`;
}
