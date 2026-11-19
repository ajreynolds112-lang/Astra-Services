import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useIssuePurchaseRefund,
  type PurchaseRefund,
  type PurchaseTransaction,
  type PurchaseUser,
} from "@workspace/api-client-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiErrorMessage } from "@/lib/format";
import { formatMinor, parseMinor, toMajorString } from "@/lib/minor-units";

const RESULT_COPY: Record<string, { tone: string; text: string }> = {
  succeeded: { tone: "text-foreground", text: "Refund succeeded." },
  pending: { tone: "text-foreground", text: "Refund is pending. Stripe has accepted it but it has not completed yet." },
  requires_action: { tone: "text-destructive", text: "Refund requires further action in Stripe before it completes." },
  failed: { tone: "text-destructive", text: "Refund failed. No money was returned." },
  canceled: { tone: "text-destructive", text: "Refund was canceled. No money was returned." },
};

interface Props {
  tx: PurchaseTransaction;
  user: PurchaseUser;
  customer: PurchaseUser | null;
  customerId: string;
  onClose: () => void;
  refreshKey: readonly unknown[];
}

export function RefundDialog({ tx, user, customer, customerId, onClose, refreshKey }: Props) {
  const qc = useQueryClient();
  const refund = useIssuePurchaseRefund();
  const [text, setText] = useState(toMajorString(tx.refundableAmount, tx.currency));
  const [result, setResult] = useState<PurchaseRefund | null>(null);
  const idRef = useRef<{ minor: number; id: string } | null>(null);

  const parsed = parseMinor(text, tx.currency);
  let problem: string | null = null;
  if ("error" in parsed) problem = parsed.error;
  else if (parsed.minor > tx.refundableAmount) problem = `Cannot exceed the remaining ${formatMinor(tx.refundableAmount, tx.currency)}.`;
  const minor = "minor" in parsed ? parsed.minor : 0;
  const pending = refund.isPending;
  const who = customer ?? user;

  function confirm() {
    if (problem || pending || result) return;
    // One requestId per confirmation attempt; reused on retries of the same amount.
    if (!idRef.current || idRef.current.minor !== minor) idRef.current = { minor, id: crypto.randomUUID() };
    const requestId = idRef.current.id;
    refund.mutate(
      { data: { chargeId: tx.id, customerId, amount: minor, confirmed: true, requestId, reason: "requested_by_customer" } },
      {
        onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: refreshKey }); },
      },
    );
  }

  const copy = result ? RESULT_COPY[result.status] ?? { tone: "text-foreground", text: `Refund status: ${result.status}.` } : null;

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="dialog-refund">
        <AlertDialogHeader>
          <AlertDialogTitle>{result ? "Refund result" : "Confirm refund"}</AlertDialogTitle>
          <AlertDialogDescription>Refunds go back to the original payment method.</AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">User</dt><dd className="break-words text-foreground">{user.name}{user.email ? ` · ${user.email}` : ""}</dd>
          {customer && customer.id !== user.id && (<><dt className="text-muted-foreground">Customer</dt><dd className="break-words text-foreground">{who.name}{who.email ? ` · ${who.email}` : ""}</dd></>)}
          <dt className="text-muted-foreground">Charge</dt><dd className="break-all font-mono text-xs text-foreground">{tx.id}</dd>
          <dt className="text-muted-foreground">Refund</dt>
          <dd className="font-medium text-foreground">{problem ? "—" : `${formatMinor(minor, tx.currency)} (${tx.currency.toUpperCase()})`}</dd>
        </dl>
        {!result && (
          <div>
            <label htmlFor="refund-amount" className="text-sm font-medium text-foreground">
              Amount ({tx.currency.toUpperCase()}), up to {formatMinor(tx.refundableAmount, tx.currency)}
            </label>
            <input id="refund-amount" inputMode="decimal" value={text} disabled={pending} onChange={(e) => setText(e.target.value)}
              aria-invalid={!!problem} aria-describedby="refund-amount-err"
              className="mt-1 w-full rounded-xl border border-input bg-white px-4 py-2.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" data-testid="input-refund-amount" />
            <p id="refund-amount-err" className="mt-1 min-h-4 text-xs text-destructive">{problem}</p>
            <p className="mt-2 rounded-xl bg-secondary px-3 py-2 text-xs text-foreground">
              This only refunds the payment. It does NOT cancel any subscription or hosting.
            </p>
          </div>
        )}
        {copy && result && (
          <div role="status" className={`text-sm ${copy.tone}`} data-testid="text-refund-result">
            <p className="font-medium">{copy.text}</p>
            <p className="mt-1 text-xs text-muted-foreground">Refund {result.id} · {formatMinor(result.amount, result.currency)} · status {result.status}</p>
          </div>
        )}
        {refund.isError && !result && (
          <div role="alert" className="text-sm text-destructive" data-testid="text-refund-error">
            <p>{apiErrorMessage(refund.error, "The refund request did not complete.")}</p>
            <p className="mt-1 text-xs">
              Attempted {formatMinor(minor, tx.currency)}. Request ID <span className="font-mono">{idRef.current?.id}</span>. The refund may or may not have gone through; retrying with the same amount is safe.
            </p>
          </div>
        )}
        <AlertDialogFooter className="gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60" data-testid="button-refund-cancel">
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button type="button" onClick={confirm} disabled={!!problem || pending} className="rounded-full bg-destructive px-5 py-2.5 text-sm font-medium text-destructive-foreground disabled:opacity-60" data-testid="button-refund-confirm">
              {pending ? "Refunding…" : refund.isError ? "Retry refund" : "Confirm refund"}
            </button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
