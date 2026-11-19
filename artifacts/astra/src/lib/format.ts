export function money(cents: number, currency = "usd") {
  const v = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: v % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export function intervalPlural(interval: string, n: number) {
  return n === 1 ? interval : `${interval}s`;
}

export function apiErrorMessage(err: unknown, fallback: string) {
  const e = err as { status?: number; data?: { error?: string } } | null;
  if (e?.status === 503) return "Online payments aren't switched on yet. Send us a note below and we'll set up your plan by hand.";
  if (e?.data?.error) return e.data.error;
  return fallback;
}
