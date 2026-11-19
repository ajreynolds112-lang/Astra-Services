import { Link } from "wouter";
import { useGetCheckoutSummary, getGetCheckoutSummaryQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusShell } from "@/components/status-shell";
import { intervalPlural, money } from "@/lib/format";

export default function CheckoutSuccess() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id") ?? "";
  const { data, isLoading, isError, refetch } = useGetCheckoutSummary(sessionId, { query: { enabled: !!sessionId, queryKey: getGetCheckoutSummaryQueryKey(sessionId) } });

  const btns = (
    <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
      <Link href="/" className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background" data-testid="link-success-home">Back to ASTRA</Link>
      <a href="/#contact" className="rounded-full px-6 py-3 text-sm font-medium hover:bg-secondary" data-testid="link-success-contact">Share project details</a>
    </div>
  );

  if (!sessionId) return <StatusShell eyebrow="Checkout" title="No session found." accent="Nothing was charged here.">{btns}</StatusShell>;
  if (isLoading) return <StatusShell eyebrow="Confirming" title="One moment."><Skeleton className="mx-auto h-56 max-w-md rounded-[28px]" /></StatusShell>;
  if (isError || !data) return (
    <StatusShell eyebrow="Checkout" title="We couldn't confirm that." accent="Your payment may still be fine.">
      <p className="text-muted-foreground">Check your inbox for a Stripe receipt, or try again.</p>
      <button onClick={() => refetch()} className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground" data-testid="button-retry-summary">Try again</button>
      {btns}
    </StatusShell>
  );

  const complete = data.status === "complete";
  const rows: [string, string][] = data.paidInFull
    ? [
        ["Plan", data.planName],
        ["Paid in full today", money(data.amountToday, data.currency)],
        ["Pay-in-full offer", "20% off regular installments"],
      ]
    : [
        ["Plan", data.planName],
        [data.discountAmount > 0 ? "Standard payment before promo" : "Payment", `${money(data.installmentAmount, data.currency)} / ${data.interval}`],
        ["Schedule", data.installments != null ? `${data.installments} ${intervalPlural(data.interval, data.installments)}` : "Ongoing · cancel anytime"],
      ];
  if (!data.paidInFull) rows.push(["Payment today", money(data.amountToday, data.currency)]);
  if (data.discountAmount > 0) rows.push(["Promo discount today", money(data.discountAmount, data.currency)]);
  if (!data.paidInFull && data.installments != null) rows.push([data.discountAmount > 0 ? "Total before promo" : "Total", money(data.installmentAmount * data.installments, data.currency)]);
  if (data.afterAmount != null && data.installments != null)
    rows.push(["After " + data.installments + " months", `Hosting ${money(data.afterAmount, data.currency)} / month`]);
  if (data.customerEmail) rows.push(["Receipt sent to", data.customerEmail]);

  return (
    <StatusShell eyebrow={complete ? "Plan started" : data.status === "open" ? "Almost there" : "Session expired"} title={complete ? "Welcome aboard." : data.status === "open" ? "Payment pending." : "This checkout expired."} accent={complete ? "The work begins now." : undefined}>
      <div className="mx-auto max-w-md rounded-[28px] border border-border bg-card/90 p-8 text-left backdrop-blur" data-testid="card-checkout-summary">
        <dl className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 py-3 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium" data-testid={`text-summary-${k.toLowerCase().replace(/\s/g, "-")}`}>{v}</dd></div>
          ))}
        </dl>
      </div>
      {complete && <p className="mx-auto mt-6 max-w-sm text-sm text-muted-foreground">We'll be in touch within one business day to schedule your kickoff.</p>}
      {btns}
    </StatusShell>
  );
}
