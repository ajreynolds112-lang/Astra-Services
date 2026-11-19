import { and, eq, lt, or, sql } from "drizzle-orm";
import { db, requestRepliesTable, type TweakRequestRow } from "@workspace/db";
import type { RequestReply, TweakRequestInput } from "@workspace/api-zod";
import { sendRequestReplyEmail } from "./requestReplyEmail";
import { logger } from "./logger";

let initialization: Promise<void> | undefined;

/** Additive bootstrap, matching the app registry's deployment-safe convention. */
export function initializeRequestReplies() {
  if (!initialization) initialization = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS request_replies (
        id serial PRIMARY KEY,
        request_id integer NOT NULL REFERENCES tweak_requests(id),
        author_user_id text NOT NULL, author_name text NOT NULL,
        message text NOT NULL, client_key uuid NOT NULL UNIQUE,
        email_status text NOT NULL DEFAULT 'pending', email_error text, email_id text,
        attempted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS request_replies_request_idx ON request_replies(request_id)`);
  })().catch((error) => { initialization = undefined; throw error; });
  return initialization;
}

type ReplyRow = typeof requestRepliesTable.$inferSelect;
export function serializeRequestReply(row: ReplyRow): RequestReply {
  return {
    id: row.id, requestId: row.requestId, authorName: row.authorName,
    message: row.message, emailStatus: row.emailStatus as RequestReply["emailStatus"],
    emailError: row.emailError, createdAt: row.createdAt, sentAt: row.sentAt,
  };
}

/** Claim delivery atomically. Retries use the same Resend idempotency key. */
export async function deliverRequestReply(reply: ReplyRow, request: TweakRequestRow) {
  const [claimed] = await db.update(requestRepliesTable).set({
    emailStatus: "sending", attemptedAt: new Date(), emailError: null,
  }).where(and(
    eq(requestRepliesTable.id, reply.id),
    or(eq(requestRepliesTable.emailStatus, "pending"), eq(requestRepliesTable.emailStatus, "failed"),
      and(eq(requestRepliesTable.emailStatus, "sending"), lt(requestRepliesTable.attemptedAt, new Date(Date.now() - 120_000)))),
  )).returning();
  if (!claimed) {
    const [current] = await db.select().from(requestRepliesTable).where(eq(requestRepliesTable.id, reply.id));
    return current ?? reply;
  }
  let result: Partial<ReplyRow>;
  try {
    const payload = request.payload as TweakRequestInput;
    const emailId = await sendRequestReplyEmail({
      replyId: reply.id, requestId: request.id, name: request.name, email: request.email,
      appName: payload.appName, title: payload.title, message: reply.message, authorName: reply.authorName,
    });
    result = { emailStatus: "sent", emailId, sentAt: new Date(), emailError: null };
    logger.info({ replyId: reply.id, requestId: request.id }, "Request reply email accepted");
  } catch (error) {
    // Avoid storing upstream response bodies, request content, or addresses in error logs.
    const emailError = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed. Retry the saved reply.";
    result = { emailStatus: "failed", emailError };
    logger.warn({ replyId: reply.id, requestId: request.id }, "Request reply email failed; reply remains saved");
  }
  const [updated] = await db.update(requestRepliesTable).set(result).where(eq(requestRepliesTable.id, reply.id)).returning();
  return updated!;
}
