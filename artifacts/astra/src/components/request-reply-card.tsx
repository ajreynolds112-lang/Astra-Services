import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useReplyToRequest, useRetryRequestReplyEmail, getListAdminRequestsQueryKey,
  type AdminTweakRequest, type RequestReply,
} from "@workspace/api-client-react";
import { apiErrorMessage } from "@/lib/format";

const date = (value: string) => new Date(value).toLocaleString();
const DETAIL_FIELDS = [
  ["currentBehavior", "Current behavior"], ["desiredBehavior", "Requested change"],
  ["location", "Location"], ["userFlow", "User flow"],
  ["acceptanceCriteria", "Acceptance criteria"], ["notes", "Notes"],
] as const;

export function RequestReplyCard({ request, emailConfigured }: { request: AdminTweakRequest; emailConfigured: boolean }) {
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const submission = useRef<{ message: string; clientKey: string } | null>(null);
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: getListAdminRequestsQueryKey() });
  const notify = (reply: RequestReply) => {
    setNotice(reply.emailStatus === "sent"
      ? "Reply saved and accepted by the email service for delivery."
      : reply.emailStatus === "sending"
        ? "Reply saved. Email delivery is in progress; refresh shortly."
        : `Reply saved, but email was not sent. ${reply.emailError ?? "Use Retry email."}`);
  };
  const save = useReplyToRequest({ mutation: {
    onSuccess: (reply) => { notify(reply); setMessage(""); submission.current = null; void refresh(); },
    onError: (error) => { setNotice(apiErrorMessage(error, "Could not confirm the reply was saved. Refresh the history before trying again.")); void refresh(); },
  } });
  const retry = useRetryRequestReplyEmail({ mutation: {
    onSuccess: (reply) => { notify(reply); void refresh(); },
    onError: (error) => setNotice(apiErrorMessage(error, "Could not retry email delivery.")),
  } });
  const ready = request.status === "delivered";
  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || save.isPending) return;
    if (submission.current?.message !== trimmed) submission.current = { message: trimmed, clientKey: crypto.randomUUID() };
    setNotice("");
    save.mutate({ id: request.id, data: submission.current! });
  }

  return (
    <details className="min-w-0 rounded-2xl border border-border p-5" data-testid={`admin-request-${request.id}`}>
      <summary className="cursor-pointer rounded-md text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <span className="font-medium">{request.payload.title}</span>
        <span className="ml-2 text-xs text-muted-foreground">#{request.id} · {request.payload.appName}</span>
        <span className="mt-1 block break-words text-sm text-muted-foreground">
          {request.name} · {request.email} · {date(request.createdAt)}
        </span>
        <span className="mt-2 block text-xs text-muted-foreground">{request.status.replaceAll("_", " ")} · {request.payload.priority} priority · {request.replies.length} {request.replies.length === 1 ? "reply" : "replies"} · Open to read and reply</span>
      </summary>
      <dl className="mt-5 space-y-4">
        {DETAIL_FIELDS.map(([key, label]) => request.payload[key] && (
          <div key={key}>
            <dt className="text-sm font-medium">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{request.payload[key]}</dd>
          </div>
        ))}
      </dl>
      {request.fileName && <a href={`https://github.com/ajreynolds112-lang/CYBAZONE-Official-App/blob/main/Requests/${encodeURIComponent(request.fileName)}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block min-h-11 py-3 text-sm underline">View original in repository</a>}
      <h3 className="mt-6 text-sm font-semibold">Reply history</h3>
      {!request.replies.length && <p className="mt-2 text-sm text-muted-foreground">No replies yet.</p>}
      <ol className="mt-3 space-y-3">
        {request.replies.map((reply) => (
          <li key={reply.id} className="rounded-xl bg-muted p-4" data-testid={`request-reply-${reply.id}`}>
            <p className="text-xs text-muted-foreground">{reply.authorName} · {date(reply.createdAt)}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{reply.message}</p>
            <p className="mt-3 text-xs font-medium">{reply.emailStatus === "sent" ? `Email sent · ${date(reply.sentAt!)}` : `Email ${reply.emailStatus}`}</p>
            {reply.emailError && <p className="mt-1 text-xs text-destructive">{reply.emailError}</p>}
            {reply.emailStatus !== "sent" && <button type="button" disabled={!emailConfigured || retry.isPending}
              onClick={() => retry.mutate({ id: reply.id })} className="mt-2 min-h-11 rounded-full border border-border px-4 text-sm disabled:opacity-50">
              {retry.isPending && retry.variables?.id === reply.id ? "Retrying…" : "Retry email"}
            </button>}
          </li>
        ))}
      </ol>
      {ready ? (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label htmlFor={`reply-message-${request.id}`} className="block text-sm font-medium">Reply to {request.name || "requester"}</label>
          <p id={`reply-recipient-${request.id}`} className="break-words text-xs text-muted-foreground">Recipient: {request.email}. Your reply and the request title will be included in the email.</p>
          <textarea id={`reply-message-${request.id}`} aria-describedby={`reply-recipient-${request.id}`} value={message}
            onChange={(event) => setMessage(event.target.value)} maxLength={10000} required disabled={save.isPending} rows={5}
            placeholder="Write your update, questions, or response…" className="w-full rounded-xl border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            data-testid={`reply-message-${request.id}`} />
          <button type="submit" disabled={!message.trim() || save.isPending}
            className="min-h-11 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background disabled:opacity-50" data-testid={`send-request-reply-${request.id}`}>
            {save.isPending ? "Saving reply…" : emailConfigured ? "Save & email reply" : "Save reply (email unavailable)"}
          </button>
        </form>
      ) : <p className="mt-6 text-sm text-muted-foreground">Replies become available after this request finishes submission and any required payment.</p>}
      {notice && <p className="mt-4 text-sm" role="status" data-testid={`reply-notice-${request.id}`}>{notice}</p>}
    </details>
  );
}
