import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPromotions,
  useCreatePromotion,
  getListPromotionsQueryKey,
  type Promotion,
} from "@workspace/api-client-react";
import { apiErrorMessage } from "@/lib/format";

const FIELD =
  "w-full rounded-xl border bg-white px-4 py-2.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20";

function discountLabel(p: Promotion) {
  return p.discountType === "percent" ? `${p.value}% off` : `$${p.value.toFixed(2)} off`;
}

/** Owner-only: create Stripe promo codes and review recent ones. */
export function PromoCodes() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useListPromotions();
  const create = useCreatePromotion();
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [duration, setDuration] = useState<"once" | "forever">("once");
  const [productId, setProductId] = useState("");
  const [cap, setCap] = useState("");
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const purchases = data?.purchases ?? [];
  const nameOf = (id: string) => purchases.find((x) => x.id === id)?.name ?? "Unknown purchase";

  const trimmed = code.trim();
  const num = Number(value);
  const problems: Record<string, string> = {};
  if (!trimmed) problems.code = "Enter a code.";
  else if (!/^[A-Za-z0-9-]+$/.test(trimmed)) problems.code = "Letters, numbers, and dashes only, no spaces.";
  else if (trimmed.length > 50) problems.code = "50 characters max.";
  if (value.trim() === "" || !Number.isFinite(num)) problems.value = "Enter a number.";
  else if (discountType === "percent" && (num <= 0 || num > 100)) problems.value = "Percent must be above 0 and at most 100.";
  else if (discountType === "amount" && (num <= 0 || num > 10000)) problems.value = "Amount must be above $0 and at most $10,000.";
  else if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) problems.value = "Use at most 2 decimal places.";
  if (cap.trim() !== "") {
    const c = Number(cap);
    if (!Number.isInteger(c) || c < 1 || c > 1000000) problems.cap = "Whole number from 1 to 1,000,000.";
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setCreated(null);
    if (Object.keys(problems).length > 0) return;
    create.mutate(
      {
        data: {
          code: trimmed,
          discountType,
          value: num,
          duration,
          ...(productId ? { productId } : {}),
          ...(cap.trim() ? { maxRedemptions: Number(cap) } : {}),
        },
      },
      {
        onSuccess: (p) => {
          setCreated(p.code);
          setCode("");
          setValue("");
          setTouched(false);
          qc.invalidateQueries({ queryKey: getListPromotionsQueryKey() });
        },
      },
    );
  }

  const show = (k: string) => touched && problems[k];
  const scopeText = productId
    ? `Only ${nameOf(productId)}.`
    : "All purchases: every plan, upfront payments, and the $20/$25 Requests.";
  const durationText =
    duration === "once"
      ? "Once: the first subscription payment, or a one-time payment."
      : "Forever: every payment on the current plan. It does not cover follow-on hosting after a bundled installment term ends.";

  return (
    <div className="min-w-0" data-testid="block-promo-codes">
      <h3 className="text-lg font-semibold text-foreground">Promo codes</h3>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        Create a code for clients to enter in Stripe Checkout. Codes are case-insensitive. Redemption happens in Checkout, and codes can't be edited or deactivated here.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-4 md:grid-cols-2" data-testid="form-promo">
        <div>
          <label htmlFor="promo-code" className="text-sm font-medium text-foreground">Code</label>
          <input id="promo-code" value={code} maxLength={50} autoComplete="off" onChange={(e) => setCode(e.target.value)} placeholder="LAUNCH20"
            aria-invalid={!!show("code")} aria-describedby="promo-code-err"
            className={`${FIELD} mt-1 font-mono ${show("code") ? "border-destructive" : "border-input"}`} data-testid="input-promo-code" />
          <p id="promo-code-err" className="mt-1 text-xs text-destructive">{show("code")}</p>
        </div>

        <div>
          <label htmlFor="promo-value" className="text-sm font-medium text-foreground">Discount</label>
          <div className="mt-1 flex gap-2">
            <select aria-label="Discount type" value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}
              className="rounded-xl border border-input bg-white px-3 py-2.5 text-[15px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" data-testid="select-promo-type">
              <option value="percent">Percent (%)</option>
              <option value="amount">Amount ($)</option>
            </select>
            <input id="promo-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={discountType === "percent" ? "20" : "25.00"} aria-invalid={!!show("value")} aria-describedby="promo-value-err"
              className={`${FIELD} min-w-0 ${show("value") ? "border-destructive" : "border-input"}`} data-testid="input-promo-value" />
          </div>
          <p id="promo-value-err" className="mt-1 text-xs text-destructive">{show("value")}</p>
        </div>

        <div>
          <label htmlFor="promo-scope" className="text-sm font-medium text-foreground">Applies to</label>
          <select id="promo-scope" value={productId} onChange={(e) => setProductId(e.target.value)}
            className={`${FIELD} mt-1 border-input`} data-testid="select-promo-scope">
            <option value="">All purchases</option>
            {purchases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="promo-duration" className="text-sm font-medium text-foreground">Duration</label>
          <select id="promo-duration" value={duration} onChange={(e) => setDuration(e.target.value as "once" | "forever")}
            className={`${FIELD} mt-1 border-input`} data-testid="select-promo-duration">
            <option value="once">Once</option>
            <option value="forever">Forever</option>
          </select>
        </div>

        <div>
          <label htmlFor="promo-cap" className="text-sm font-medium text-foreground">Redemption limit <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="promo-cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Unlimited"
            aria-invalid={!!show("cap")} aria-describedby="promo-cap-err"
            className={`${FIELD} mt-1 ${show("cap") ? "border-destructive" : "border-input"}`} data-testid="input-promo-cap" />
          <p id="promo-cap-err" className="mt-1 text-xs text-destructive">{show("cap")}</p>
        </div>

        <div className="rounded-2xl bg-secondary px-4 py-3 text-sm text-foreground md:self-start" data-testid="text-promo-explain">
          <p><span className="font-medium">Scope.</span> {scopeText}</p>
          <p className="mt-1.5"><span className="font-medium">Duration.</span> {durationText}</p>
        </div>

        <div className="md:col-span-2">
          <button type="submit" disabled={create.isPending}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity disabled:opacity-60" data-testid="button-create-promo">
            {create.isPending ? "Creating…" : "Create promo code"}
          </button>
          {create.isError && (
            <p className="mt-3 text-sm text-destructive" role="alert" data-testid="text-promo-error">
              {apiErrorMessage(create.error, "Couldn't create the promo code. Please try again.")}
            </p>
          )}
          {created && (
            <p className="mt-3 text-sm text-foreground" role="status" data-testid="text-promo-created">
              Created <span className="font-mono">{created.toUpperCase()}</span>. It's now in the list below.
            </p>
          )}
        </div>
      </form>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Discount</th>
              <th className="px-4 py-3 font-medium">Scope</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Redeemed</th>
              <th className="px-4 py-3 font-medium">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={6} className="px-4 py-3 text-muted-foreground" data-testid="text-promos-loading">Loading…</td></tr>}
            {error && (
              <tr><td colSpan={6} className="px-4 py-3 text-destructive" role="alert">
                {apiErrorMessage(error, "Could not load promo codes.")}{" "}
                <button type="button" onClick={() => refetch()} disabled={isFetching} className="ml-2 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-60" data-testid="button-retry-promos">
                  {isFetching ? "Retrying…" : "Retry"}
                </button>
              </td></tr>
            )}
            {data && data.promotions.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground" data-testid="text-promos-empty">No promo codes yet. Create the first one above.</td></tr>
            )}
            {data?.promotions.map((p) => (
              <tr key={p.id} className="bg-white" data-testid={`row-promo-${p.id}`}>
                <td className="px-4 py-3 font-mono text-foreground">{p.code}</td>
                <td className="px-4 py-3 text-foreground">{discountLabel(p)}</td>
                <td className="px-4 py-3 text-foreground">
                  {p.productIds.length === 0 ? "All purchases" : p.productIds.map(nameOf).join(", ")}
                </td>
                <td className="px-4 py-3 text-foreground">{p.duration === "forever" ? "Forever" : p.duration === "once" ? "Once" : p.duration}</td>
                <td className="px-4 py-3 text-foreground">{p.timesRedeemed} / {p.maxRedemptions ?? "Unlimited"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${p.active ? "bg-secondary text-foreground" : "bg-muted text-muted-foreground"}`}>
                    {p.active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
