export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function formatMinor(minor: number, currency: string): string {
  const d = currencyDigits(currency);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 10 ** d);
  } catch {
    return `${(minor / 10 ** d).toFixed(d)} ${currency.toUpperCase()}`;
  }
}

/** Parse a decimal string into integer smallest units. Returns an error string on invalid input. */
export function parseMinor(text: string, currency: string): { minor: number } | { error: string } {
  const t = text.trim();
  const d = currencyDigits(currency);
  if (!t) return { error: "Enter an amount." };
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: "Use digits and an optional decimal point only." };
  const [whole, frac = ""] = t.split(".");
  if (frac.length > d) return { error: d === 0 ? `${currency.toUpperCase()} has no minor units; enter a whole number.` : `${currency.toUpperCase()} allows at most ${d} decimal places.` };
  const minor = Number(whole + frac.padEnd(d, "0"));
  if (!Number.isSafeInteger(minor) || minor < 1) return { error: "Amount must be at least one minor unit." };
  if (minor > 99999999) return { error: "Amount is above the maximum allowed." };
  return { minor };
}

export function toMajorString(minor: number, currency: string): string {
  const d = currencyDigits(currency);
  return (minor / 10 ** d).toFixed(d);
}
