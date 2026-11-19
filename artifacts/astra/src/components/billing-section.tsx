import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  useGetPortalBilling,
  useCancelPortalHosting,
  getGetPortalBillingQueryKey,
  getGetPortalMeQueryKey,
  getGetClientAppsQueryKey,
  type BillingSubscription,
} from "@workspace/api-client-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiErrorMessage, money } from "@/lib/format";

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function CancelDialog({ sub, onClose }: { sub: BillingSubscription; onClose: () => void }) {
  const qc = useQueryClient();
  const cancel = useCancelPortalHosting();
  const [done, setDone] = useState<BillingSubscription | null>(null);
  const pending = cancel.isPending;
  const shown = done ?? sub;
  const date = fmtDate(shown.hostingEndsAt);

  function confirm() {
    if (pending || done) return;
    cancel.mutate(
      { data: { subscriptionId: sub.id, confirmed: true } },
      {
        onSuccess: (r) => {
          setDone(r);
          qc.invalidateQueries({ queryKey: getGetPortalBillingQueryKey() });
          qc.invalidateQueries({ queryKey: getGetPortalMeQueryKey() });
          qc.invalidateQueries({ queryKey: getGetClientAppsQueryKey() });
        },
      },
    );
  }

  const designNote = (
    <>Your remaining agreed App Design / Design + Hosting installments continue unchanged on their original schedule until the term is complete. Cancelling hosting does not erase your balance and is not an early payoff.</>
  );

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="dialog-cancel-hosting">
        <AlertDialogHeader>
          <AlertDialogTitle>{done ? "Hosting cancellation scheduled" : "Cancel hosting?"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {done ? (
                <>
                  <p data-testid="text-cancel-result">
                    Hosting for <strong className="text-foreground">{sub.name}</strong> {date ? <>is scheduled to end on <strong className="text-foreground">{date}</strong>.</> : "is scheduled to end after the current paid period."}
                  </p>
                  {done.designPaymentsContinue && <p>{designNote}</p>}
                </>
              ) : (
                <>
                  <p>
                    You're cancelling hosting for <strong className="text-foreground">{sub.name}</strong>
                    {date ? <>. It will end on <strong className="text-foreground">{date}</strong></> : <>. It will end at the close of the current paid period</>}.
                  </p>
                  <p>Hosting stays active through the period you've already paid for. After it ends, your app may go offline.</p>
                  {sub.designPaymentsContinue && <p className="rounded-xl bg-secondary px-3 py-2 text-foreground">{designNote}</p>}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {cancel.isError && !done && (
          <div role="alert" className="text-sm text-destructive" data-testid="text-cancel-error">
            <p>{apiErrorMessage(cancel.error, "We couldn't schedule the cancellation.")}</p>
            <p className="mt-1 text-xs">Retrying for this same subscription is safe.</p>
          </div>
        )}
        <AlertDialogFooter className="gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60" data-testid="button-cancel-hosting-close">
            {done ? "Close" : "Keep hosting"}
          </button>
          {!done && (
            <button type="button" onClick={confirm} disabled={pending} className="rounded-full bg-destructive px-5 py-2.5 text-sm font-medium text-destructive-foreground disabled:opacity-60" data-testid="button-confirm-hosting-cancellation">
              {pending ? "Cancelling…" : cancel.isError ? "Retry hosting cancellation" : "Confirm hosting cancellation"}
            </button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BillingSection() {
  const { data, isLoading, error, refetch } = useGetPortalBilling();
  const [target, setTarget] = useState<BillingSubscription | null>(null);

  return (
    <section className="mt-10 rounded-3xl border border-border bg-card p-6 md:p-10" aria-labelledby="billing-title" data-testid="section-billing">
      <h2 id="billing-title" className="text-2xl font-semibold tracking-tight text-foreground">Billing & hosting</h2>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground" data-testid="text-billing-loading">Loading billing…</p>}
      {error && (
        <div className="mt-4 text-sm text-destructive" role="alert" data-testid="text-billing-error">
          {apiErrorMessage(error, "Could not load billing.")}{" "}
          <button type="button" onClick={() => refetch()} className="underline underline-offset-4" data-testid="button-billing-retry">Retry</button>
        </div>
      )}

      {data && (
        <>
          {data.designPaymentRisk && (
            <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-foreground" data-testid="alert-design-payment-risk">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p><strong>Overdue App Design payments.</strong> Unresolved overdue design payments may result in your app going offline. Pay any open invoice below, or contact the studio if no payment link is available.</p>
            </div>
          )}

          {data.subscriptions.length === 0 && data.invoices.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground" data-testid="text-billing-empty">No billing information found for your account.</p>
          )}

          <ul className="mt-6 space-y-4">
            {data.subscriptions.map((s) => {
              const date = fmtDate(s.hostingEndsAt);
              const hostingEnded = s.hostingEndsAt !== null && new Date(s.hostingEndsAt).getTime() <= Date.now();
              return (
                <li key={s.id} className="rounded-2xl border border-border p-5" data-testid={`card-subscription-${s.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium text-foreground">{s.name}</h3>
                    <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-foreground" data-testid={`status-subscription-${s.id}`}>{s.status.replace(/_/g, " ")}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{money(s.amount, s.currency)} per {s.interval}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Existing contracted installment price, not a new hosting charge.</p>

                  {s.cancellationRequested ? (
                    <p className="mt-3 text-sm text-foreground" data-testid={`text-hosting-end-${s.id}`}>
                      {date ? <>Hosting {hostingEnded ? "ended on" : "end scheduled for"} <strong>{date}</strong>. No further hosting renewal after that date.</> : "Hosting end is scheduled for the close of the current paid period."}
                    </p>
                  ) : s.hostingIncluded && date ? (
                    <p className="mt-3 text-sm text-muted-foreground" data-testid={`text-period-end-${s.id}`}>Current period ends {date}.</p>
                  ) : null}

                  {s.designPaymentsContinue && (
                    <p className="mt-2 text-sm text-muted-foreground">Remaining agreed App Design installments continue unchanged on the original schedule until the term is complete.</p>
                  )}

                  {s.canCancelHosting && !s.cancellationRequested ? (
                    <button type="button" onClick={() => setTarget(s)} className="mt-4 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted" data-testid={`button-cancel-hosting-${s.id}`}>
                      Cancel hosting
                    </button>
                  ) : !s.hostingIncluded ? (
                    <p className="mt-3 text-xs text-muted-foreground" data-testid={`text-no-hosting-${s.id}`}>App Design only — no hosting to cancel. Installments run through the agreed term.</p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {data.invoices.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-foreground">Unpaid invoices</h3>
              <ul className="mt-3 space-y-3">
                {data.invoices.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4" data-testid={`row-invoice-${inv.id}`}>
                    <div className="text-sm">
                      <p className="font-medium text-foreground">{money(inv.amount, inv.currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.designRelated ? "App Design" : "Hosting"}{inv.overdue ? " · Overdue" : ""}
                      </p>
                    </div>
                    {inv.paymentUrl ? (
                      <a href={inv.paymentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background" data-testid={`link-pay-invoice-${inv.id}`}>
                        Pay invoice <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground" data-testid={`text-contact-studio-${inv.id}`}>Payment link unavailable. Please contact the studio.</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        App Design installment payments are required even after hosting is cancelled. Unresolved overdue design payments may result in your app going offline. See our <Link href="/terms" className="text-foreground underline underline-offset-4" data-testid="link-billing-terms">Terms</Link>.
      </p>

      {target && <CancelDialog sub={target} onClose={() => setTarget(null)} />}
    </section>
  );
}
