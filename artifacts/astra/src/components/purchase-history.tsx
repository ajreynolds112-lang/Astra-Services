import { useState } from "react";
import {
  useListPurchaseUsers,
  useGetPurchaseHistory,
  getGetPurchaseHistoryQueryKey,
  type GetPurchaseHistoryParams,
  type ListPurchaseUsersParams,
  type PurchaseTransaction,
  type PurchaseUser,
} from "@workspace/api-client-react";
import { apiErrorMessage } from "@/lib/format";
import { formatMinor } from "@/lib/minor-units";
import { RefundDialog } from "@/components/refund-dialog";

type Source = "customers" | "registered";
type Page = { cursor?: string; offset?: number };
type TxPage = { payment?: string; order?: string };

const BTN = "rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50";
const date = (s: string) => new Date(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

function Retry({ message, onRetry, busy }: { message: string; onRetry: () => void; busy: boolean }) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/30 p-4 text-sm text-destructive">
      {message}{" "}
      <button type="button" onClick={onRetry} disabled={busy} className="ml-2 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-60">
        {busy ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

export function PurchaseHistory() {
  const [source, setSource] = useState<Source>("customers");
  const [pages, setPages] = useState<Page[]>([{}]);
  const [selected, setSelected] = useState<PurchaseUser | null>(null);

  const page = pages[pages.length - 1];
  const params: ListPurchaseUsersParams = { source, ...(page.cursor ? { cursor: page.cursor } : {}), ...(page.offset ? { offset: page.offset } : {}) };
  const list = useListPurchaseUsers(params);

  function changeSource(s: Source) {
    setSource(s); setPages([{}]); setSelected(null);
  }
  function next() {
    const d = list.data;
    if (!d?.hasMore) return;
    setPages([...pages, source === "customers" ? { cursor: d.nextCursor ?? undefined } : { offset: d.nextOffset ?? undefined }]);
  }

  return (
    <div data-testid="block-purchase-history" className="min-w-0">
      <h3 className="text-lg font-semibold text-foreground">Purchase history</h3>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">Browse users and their payments. Refunds are only ever issued by you, after a confirmation.</p>

      <div className="mt-5">
        <label htmlFor="ph-source" className="text-sm font-medium text-foreground">Directory</label>
        <select id="ph-source" value={source} onChange={(e) => changeSource(e.target.value as Source)}
          className="mt-1 block w-full rounded-xl border border-input bg-white px-3 py-2.5 text-[15px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-72" data-testid="select-ph-source">
          <option value="customers">Checkout customers (includes guest buyers)</option>
          <option value="registered">All registered users</option>
        </select>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Joined</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /></td></tr>
            ))}
            {list.isError && <tr><td colSpan={3} className="p-3"><Retry message={apiErrorMessage(list.error, "Could not load users.")} onRetry={() => list.refetch()} busy={list.isFetching} /></td></tr>}
            {list.data && list.data.users.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground" data-testid="text-ph-empty">No users here yet.</td></tr>}
            {list.data?.users.map((u) => (
              <tr key={u.id} className={selected?.id === u.id ? "bg-secondary" : "bg-white"} data-testid={`row-ph-user-${u.id}`}>
                <td className="px-4 py-2">
                  <button type="button" onClick={() => setSelected(u)} aria-pressed={selected?.id === u.id} className="rounded text-left font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                    {u.name || "Unnamed"}
                  </button>
                </td>
                <td className="break-all px-4 py-2 text-foreground">{u.email ?? "No email"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{date(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className={BTN} disabled={pages.length < 2} onClick={() => setPages(pages.slice(0, -1))} data-testid="button-ph-users-prev">Previous</button>
        <button type="button" className={BTN} disabled={!list.data?.hasMore || list.isFetching} onClick={next} data-testid="button-ph-users-next">Next</button>
        <span className="text-xs text-muted-foreground">Page {pages.length}, up to 50 per page</span>
      </div>

      {selected && <UserHistory key={`${source}:${selected.id}`} source={source} user={selected} />}
    </div>
  );
}

function UserHistory({ source, user }: { source: Source; user: PurchaseUser }) {
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [pages, setPages] = useState<TxPage[]>([{}]);
  const [refunding, setRefunding] = useState<PurchaseTransaction | null>(null);
  const pg = pages[pages.length - 1];
  const params: GetPurchaseHistoryParams = {
    source, id: user.id,
    ...(customerId ? { customerId } : {}),
    ...(pg.payment ? { paymentCursor: pg.payment } : {}),
    ...(pg.order ? { orderCursor: pg.order } : {}),
  };
  const key = getGetPurchaseHistoryQueryKey(params);
  const q = useGetPurchaseHistory(params);
  const h = q.data;
  const activeCustomerId = h?.selectedCustomerId ?? customerId ?? null;
  const activeCustomer = h?.customers.find((c) => c.id === activeCustomerId) ?? null;

  function pickCustomer(id: string) { setCustomerId(id); setPages([{}]); }

  return (
    <div className="mt-8 border-t border-border pt-6" data-testid="block-ph-detail" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base font-semibold text-foreground">{user.name || "Unnamed"}</h4>
        <span className="break-all text-sm text-muted-foreground">{user.email ?? "No email"}</span>
        {h && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs ${h.livemode ? "bg-foreground text-background" : "bg-secondary text-foreground"}`} data-testid="badge-livemode">
            {h.livemode ? "Live" : "Test"}
          </span>
        )}
      </div>

      {q.isLoading && <div className="mt-4 space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}</div>}
      {q.isError && <div className="mt-4"><Retry message={apiErrorMessage(q.error, "Could not load purchase history.")} onRetry={() => q.refetch()} busy={q.isFetching} /></div>}

      {h && (
        <>
          {h.customers.length > 1 && (
            <div className="mt-4">
              <label htmlFor="ph-customer" className="text-sm font-medium text-foreground">Customer account</label>
              <select id="ph-customer" value={activeCustomerId ?? ""} onChange={(e) => pickCustomer(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-input bg-white px-3 py-2.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-96" data-testid="select-ph-customer">
                {h.customers.map((c) => <option key={c.id} value={c.id}>{c.name || "Unnamed"} · {c.email ?? c.id}</option>)}
              </select>
            </div>
          )}

          {h.transactions.length === 0 && h.freePurchases.length === 0 && (
            <p className="mt-4 rounded-2xl bg-secondary px-4 py-6 text-center text-sm text-foreground" data-testid="text-ph-no-purchases">No purchases.</p>
          )}

          {h.transactions.length > 0 && (
            <ul className="mt-4 space-y-3">
              {h.transactions.map((t) => (
                <li key={t.id} className="rounded-2xl border border-border bg-white p-4" data-testid={`row-tx-${t.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-foreground">{t.description || "Payment"}</p>
                      <p className="text-xs text-muted-foreground">{date(t.createdAt)} · <span className="break-all font-mono">{t.id}</span></p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">{t.status}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                    <div><dt className="text-xs text-muted-foreground">Charged</dt><dd className="text-foreground">{formatMinor(t.amount, t.currency)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Refunded</dt><dd className="text-foreground">{formatMinor(t.refundedAmount, t.currency)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Refundable</dt><dd className="text-foreground">{formatMinor(t.refundableAmount, t.currency)}</dd></div>
                  </dl>
                  {t.refunds.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                      {t.refunds.map((r) => (
                        <li key={r.id}>
                          Refund {formatMinor(r.amount, r.currency)} · <span className={r.status === "failed" || r.status === "canceled" ? "text-destructive" : "text-foreground"}>{r.status}</span> · {date(r.createdAt)} · <span className="break-all font-mono">{r.id}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {t.receiptUrl && <a href={t.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-2">View receipt</a>}
                    {t.refundableAmount > 0 && activeCustomerId && (
                      <button type="button" onClick={() => setRefunding(t)} className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted" data-testid={`button-refund-${t.id}`}>
                        Refund…
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {h.freePurchases.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-foreground">Zero-cost purchases (not refundable)</p>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {h.freePurchases.map((f) => (
                  <li key={f.id} className="rounded-xl bg-secondary px-3 py-2">{f.description || "Free purchase"} · {formatMinor(0, f.currency)} · <span className="text-muted-foreground">{date(f.createdAt)}</span></li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button type="button" className={BTN} disabled={pages.length < 2} onClick={() => setPages(pages.slice(0, -1))} data-testid="button-ph-tx-prev">Previous</button>
            <button type="button" className={BTN} disabled={!h.hasMore || q.isFetching}
              onClick={() => setPages([...pages, { payment: h.nextPaymentCursor ?? undefined, order: h.nextOrderCursor ?? undefined }])} data-testid="button-ph-tx-next">Next</button>
            <span className="text-xs text-muted-foreground">Page {pages.length}</span>
          </div>
        </>
      )}

      {refunding && activeCustomerId && (
        <RefundDialog tx={refunding} user={user} customer={activeCustomer} customerId={refunding.customerId ?? activeCustomerId} refreshKey={key} onClose={() => setRefunding(null)} />
      )}
    </div>
  );
}
