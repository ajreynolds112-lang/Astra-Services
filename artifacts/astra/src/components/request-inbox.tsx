import { useListAdminRequests, getListAdminRequestsQueryKey } from "@workspace/api-client-react";
import { RequestReplyCard } from "./request-reply-card";
import { apiErrorMessage } from "@/lib/format";

export function RequestInbox() {
  const inbox = useListAdminRequests({ query: { queryKey: getListAdminRequestsQueryKey(), refetchInterval: 30_000, staleTime: 0 } });
  return (
    <section className="mt-10 min-w-0 rounded-3xl border border-border bg-card p-6 md:p-10" data-testid="section-request-inbox">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Requests & replies</h2>
          <p className="mt-1 text-sm text-muted-foreground">Latest 100 submissions. Replies are saved here and emailed to the original requester.</p>
        </div>
        <button type="button" onClick={() => inbox.refetch()} disabled={inbox.isFetching} className="min-h-11 rounded-full border border-border px-4 text-sm disabled:opacity-50">Refresh</button>
      </div>
      {inbox.isLoading && <p className="mt-6 text-sm" role="status">Loading requests…</p>}
      {inbox.error && <p className="mt-6 text-sm text-destructive" role="alert">{apiErrorMessage(inbox.error, "Could not load requests.")}</p>}
      {inbox.data?.emailConfigurationMessage && (
        <p className="mt-5 rounded-xl border border-border bg-muted p-4 text-sm" role="status" data-testid="reply-email-configuration">
          {inbox.data.emailConfigurationMessage}
        </p>
      )}
      {inbox.data && !inbox.data.requests.length && <p className="mt-6 text-sm text-muted-foreground">No requests submitted yet.</p>}
      <div className="mt-6 space-y-4">
        {inbox.data?.requests.map((request) => <RequestReplyCard key={request.id} request={request} emailConfigured={inbox.data.emailConfigured} />)}
      </div>
    </section>
  );
}
