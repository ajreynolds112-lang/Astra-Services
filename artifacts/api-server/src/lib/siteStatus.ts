export const PAYMENTS_ENABLED = true;

// Checkout must not use stale catalog data before the current account has synced.
export let stripeReady = false;
export let catalogProductIds: string[] = [];

export function markStripeReady(productIds: string[]): void {
  catalogProductIds = productIds;
  stripeReady = true;
}