import { Router, type IRouter, type RequestHandler } from "express";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, tweakRequestsTable, requestRepliesTable } from "@workspace/db";
import {
  ListAdminRequestsResponse, ReplyToRequestBody, ReplyToRequestParams,
  RetryRequestReplyEmailParams, type TweakRequestInput,
} from "@workspace/api-zod";
import { requireAuth, loadProfile, type AuthedRequest, type Profile } from "../lib/account";
import { requestReplyAllowed, replyEmailConfiguration } from "../lib/requestReplyEmail";
import { initializeRequestReplies, deliverRequestReply, serializeRequestReply } from "../lib/requestReplies";

type AdminRequest = AuthedRequest & { profile: Profile };
const router: IRouter = Router();
const adminOnly: RequestHandler = (req, res, next) => {
  loadProfile((req as AuthedRequest).userId!).then(async (profile) => {
    if (!requestReplyAllowed(profile)) { res.status(403).json({ error: "Admin access is required to read or reply to requests." }); return; }
    (req as AdminRequest).profile = profile;
    await initializeRequestReplies();
    next();
  }).catch(next);
};

router.use("/admin/requests", requireAuth, adminOnly);
router.use("/admin/request-replies", requireAuth, adminOnly);

router.get("/admin/requests", async (_req, res) => {
  const requests = await db.select().from(tweakRequestsTable).orderBy(desc(tweakRequestsTable.createdAt)).limit(100);
  const replies = requests.length ? await db.select().from(requestRepliesTable)
    .where(inArray(requestRepliesTable.requestId, requests.map((r) => r.id)))
    .orderBy(asc(requestRepliesTable.createdAt), asc(requestRepliesTable.id)) : [];
  const emailConfigurationMessage = replyEmailConfiguration();
  res.json(ListAdminRequestsResponse.parse({
    emailConfigured: emailConfigurationMessage === null, emailConfigurationMessage,
    requests: requests.map((request) => ({
      id: request.id, name: request.name, email: request.email, status: request.status,
      createdAt: request.createdAt.toISOString(), fileName: request.fileName, payload: request.payload as TweakRequestInput,
      replies: replies.filter((reply) => reply.requestId === request.id).map(serializeRequestReply),
    })),
  }));
});

router.post("/admin/requests/:id/replies", async (req, res) => {
  const params = ReplyToRequestParams.safeParse(req.params);
  const body = ReplyToRequestBody.strict().safeParse(req.body);
  if (!params.success || !body.success || !body.data.message.trim()) {
    res.status(400).json({ error: "Enter a reply between 1 and 10,000 characters." }); return;
  }
  const [request] = await db.select().from(tweakRequestsTable).where(eq(tweakRequestsTable.id, params.data.id));
  if (!request) { res.status(404).json({ error: "Request not found." }); return; }
  if (request.status !== "delivered") { res.status(409).json({ error: "This request has not finished submission or payment. Replies are not available yet." }); return; }
  const { profile, userId } = req as unknown as AdminRequest;
  const message = body.data.message.trim();
  const [saved] = await db.insert(requestRepliesTable).values({
    requestId: request.id, authorUserId: userId!, authorName: profile.name,
    message, clientKey: body.data.clientKey,
  }).onConflictDoNothing({ target: requestRepliesTable.clientKey }).returning();
  const reply = saved ?? (await db.select().from(requestRepliesTable).where(eq(requestRepliesTable.clientKey, body.data.clientKey)))[0];
  if (!reply || reply.requestId !== request.id || reply.authorUserId !== userId || reply.message !== message) {
    res.status(409).json({ error: "This submission key was already used for another reply. Reload and try again." }); return;
  }
  res.status(201).json(serializeRequestReply(await deliverRequestReply(reply, request)));
});

router.post("/admin/request-replies/:id/retry-email", async (req, res) => {
  const params = RetryRequestReplyEmailParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid reply ID." }); return; }
  const [reply] = await db.select().from(requestRepliesTable).where(eq(requestRepliesTable.id, params.data.id));
  if (!reply) { res.status(404).json({ error: "Reply not found." }); return; }
  const [request] = await db.select().from(tweakRequestsTable).where(eq(tweakRequestsTable.id, reply.requestId));
  if (!request) { res.status(404).json({ error: "Request not found." }); return; }
  res.json(serializeRequestReply(await deliverRequestReply(reply, request)));
});

export default router;
