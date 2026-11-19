import { Router, type IRouter, type Response, type NextFunction } from "express";
import { asc, eq } from "drizzle-orm";
import { db, devUsersTable } from "@workspace/db";
import {
  AddDevUserBody,
  UpdateDevUserBody,
  UpdateDevUserParams,
  RemoveDevUserParams,
  SendTestTweakRequestBody,
} from "@workspace/api-zod";
import { requireAuth, loadProfile, type AuthedRequest } from "../lib/account";
import { deliverTweakRequest, CommitFailedError } from "../lib/tweakRequest";

const router: IRouter = Router();

export async function requireOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const profile = await loadProfile(req.userId!);
    if (!profile.isOwner) {
      res.status(403).json({ error: "Only the studio owner can manage dev settings." });
      return;
    }
    next();
  } catch (err) {
    req.log.error({ err }, "owner check failed");
    res.status(500).json({ error: "Could not verify your account." });
  }
}

const serialize = (u: typeof devUsersTable.$inferSelect) => ({
  id: u.id,
  email: u.email,
  receiveUpdates: u.receiveUpdates,
  createdAt: u.createdAt.toISOString(),
});

router.get("/dev/users", requireAuth, requireOwner, async (_req, res) => {
  const rows = await db.select().from(devUsersTable).orderBy(asc(devUsersTable.createdAt));
  res.json(rows.map(serialize));
});

router.post("/dev/users", requireAuth, requireOwner, async (req, res) => {
  const parsed = AddDevUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const [row] = await db
    .insert(devUsersTable)
    .values({ email, receiveUpdates: parsed.data.receiveUpdates ?? false })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    res.status(409).json({ error: "That email already has dev access." });
    return;
  }
  res.status(201).json(serialize(row));
});

router.patch("/dev/users/:id", requireAuth, requireOwner, async (req, res) => {
  const params = UpdateDevUserParams.safeParse(req.params);
  const body = UpdateDevUserBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  const [row] = await db
    .update(devUsersTable)
    .set({ receiveUpdates: body.data.receiveUpdates })
    .where(eq(devUsersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  res.json(serialize(row));
});

router.delete("/dev/users/:id", requireAuth, requireOwner, async (req, res) => {
  const params = RemoveDevUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  await db.delete(devUsersTable).where(eq(devUsersTable.id, params.data.id));
  res.status(204).end();
});

router.post("/dev/test-request", requireAuth, requireOwner, async (req: AuthedRequest, res) => {
  const parsed = SendTestTweakRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please answer every question in enough detail." });
    return;
  }
  try {
    const profile = await loadProfile(req.userId!);
    const result = await deliverTweakRequest({ profile, planLabel: "Owner (test)", r: parsed.data, test: true, log: req.log });
    res.status(201).json({ status: "delivered", ...result, checkoutUrl: null });
  } catch (err) {
    if (!(err instanceof CommitFailedError)) req.log.error({ err }, "test request failed");
    res.status(502).json({ error: "Couldn't save the test request. Please try again." });
  }
});

export default router;
