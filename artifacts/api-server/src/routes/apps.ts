import { Router, type IRouter, type Response, type NextFunction, type RequestHandler } from "express";
import { clerkClient } from "@clerk/express";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db, expoAppsTable, appAssignmentsTable, appEmailAssignmentsTable } from "@workspace/db";
import { requireAuth, loadProfile, type AuthedRequest, type Profile } from "../lib/account";
import { appCanBeViewed, initializeAppRegistry, isAppDev, registryStatus, serializeApp, syncAppRegistry, visibleApps, type AppRecord } from "../lib/appRegistry";
import { appUpdateInput, appAccessAllowed, appAssignmentInput } from "../lib/appAccess";
import { listExpoBuilds, startExpoTestFlight } from "../lib/expoProvider";
import { configureTestFlight, appSourceBranch, TESTFLIGHT_WORKFLOW } from "../lib/appAutomation";
import { sendAppOnboarding } from "../lib/appOnboarding";

type AppRequest = AuthedRequest & { profile: Profile };
const router: IRouter = Router();
const uuid = z.string().uuid();
const userIdSchema = z.string().min(1).max(100);

function handler(fn: (req: AppRequest, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res) => {
    fn(req as AppRequest, res).catch((error) => {
      const message = error instanceof Error ? error.message : "Could not complete this action.";
      req.log.warn({ message }, "App portal action failed");
      if (!res.headersSent) res.status(503).json({ error: message });
    });
  };
}

router.use("/apps", requireAuth, (req, res, next) => {
  initializeAppRegistry().then(() => loadProfile((req as AuthedRequest).userId!))
    .then((profile) => { (req as AppRequest).profile = profile; next(); })
    .catch(() => res.status(503).json({ error: "Could not load your account." }));
});

function devOnly(req: AppRequest, res: Response, next: NextFunction) {
  if (!isAppDev(req.profile)) { res.status(403).json({ error: "Dev access is required." }); return; }
  next();
}

async function findApp(req: AppRequest, res: Response): Promise<AppRecord | null> {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid app ID." }); return null; }
  const [app] = await db.select().from(expoAppsTable).where(eq(expoAppsTable.id, id.data));
  if (!app) { res.status(404).json({ error: "App not found." }); return null; }
  return app;
}

const searchWindows = new Map<string, { start: number; count: number }>();
router.get("/apps/users/search", devOnly as RequestHandler, handler(async (req, res) => {
  const query = z.string().trim().min(2).max(80).safeParse(req.query.q);
  if (!query.success) { res.status(400).json({ error: "Enter at least two characters of a name or email." }); return; }
  const now = Date.now();
  if (searchWindows.size > 1000) for (const [key, entry] of searchWindows) if (now - entry.start > 60_000) searchWindows.delete(key);
  const entry = searchWindows.get(req.userId!) ?? { start: now, count: 0 };
  if (now - entry.start > 60_000) { entry.start = now; entry.count = 0; }
  entry.count += 1;
  searchWindows.set(req.userId!, entry);
  if (entry.count > 60) { res.status(429).json({ error: "Please wait a minute before searching again." }); return; }
  const result = await clerkClient.users.getUserList({ query: query.data, limit: 20 });
  res.json(result.data.map(serializeUser));
}));

type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUser>>;
function serializeUser(user: ClerkUser) {
  const email = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
  return { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || email, email };
}

router.get("/apps", handler(async (req, res) => {
  if (!isAppDev(req.profile) && !req.profile.emailVerified) {
    res.json({ apps: [], expoConnected: false, lastSyncedAt: null, syncError: null });
    return;
  }
  const apps = await visibleApps(req.userId!, req.profile);
  const assignments = apps.length ? await db.select({ appId: appAssignmentsTable.appId }).from(appAssignmentsTable)
    .where(and(eq(appAssignmentsTable.userId, req.userId!), inArray(appAssignmentsTable.appId, apps.map((app) => app.id)))) : [];
  const emailAssignments = apps.length ? await db.select({ appId: appEmailAssignmentsTable.appId }).from(appEmailAssignmentsTable)
    .where(and(eq(appEmailAssignmentsTable.email, req.profile.email.trim().toLowerCase()), inArray(appEmailAssignmentsTable.appId, apps.map((app) => app.id)))) : [];
  const own = new Set([...assignments, ...emailAssignments].map((assignment) => assignment.appId));
  res.json({
    apps: apps.map((app) => serializeApp(app, req.profile, own.has(app.id))),
    ...(isAppDev(req.profile) ? registryStatus() : { expoConnected: true, lastSyncedAt: null, syncError: null }),
  });
}));

router.post("/apps/sync", devOnly as RequestHandler, handler(async (_req, res) => {
  res.json({ count: await syncAppRegistry() });
}));

router.get("/apps/:id", handler(async (req, res) => {
  const app = await findApp(req, res);
  if (!app) return;
  const assigned = await appCanBeViewed(app.id, req.userId!, req.profile);
  if (!assigned) { res.status(404).json({ error: "This app is not assigned to your account." }); return; }
  if (!appAccessAllowed(isAppDev(req.profile), req.profile.emailVerified, assigned)) {
    res.status(403).json({ error: "Verify your assigned email address to use app previews." });
    return;
  }
  const members = await db.select({ userId: appAssignmentsTable.userId }).from(appAssignmentsTable)
    .where(eq(appAssignmentsTable.appId, app.id));
  const emailMembers = await db.select().from(appEmailAssignmentsTable).where(eq(appEmailAssignmentsTable.appId, app.id));
  const users = [];
  if (isAppDev(req.profile)) {
    for (let offset = 0; offset < members.length; offset += 100) {
      const page = await clerkClient.users.getUserList({ userId: members.slice(offset, offset + 100).map((member) => member.userId), limit: 100 });
      users.push(...page.data.map(serializeUser));
    }
    users.push(...emailMembers.map(serializeEmailAssignment));
  }
  let builds: Awaited<ReturnType<typeof listExpoBuilds>> = [];
  let buildError: string | null = null;
  try { builds = await listExpoBuilds(app.id); }
  catch (error) { buildError = error instanceof Error ? error.message : "Build status is temporarily unavailable."; }
  res.json({
    app: serializeApp(app, req.profile, members.some((member) => member.userId === req.userId) || emailMembers.some((member) => member.email === req.profile.email.trim().toLowerCase())),
    assignedUsers: users, builds, buildError,
  });
}));

router.patch("/apps/:id", devOnly as RequestHandler, handler(async (req, res) => {
  const app = await findApp(req, res);
  if (!app) return;
  const body = appUpdateInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid app settings." }); return; }
  const changesAutomation = ["repositoryUrl", "appDirectory", "ascAppId"].some((key) => key in body.data && body.data[key as keyof typeof body.data] !== app[key as keyof AppRecord]);
  const [updated] = await db.update(expoAppsTable).set({
    ...body.data, updatedAt: new Date(),
    ...(changesAutomation ? { automationConfigured: false } : {}),
  }).where(eq(expoAppsTable.id, app.id)).returning();
  res.json(serializeApp(updated!, req.profile, false));
}));

function serializeEmailAssignment(assignment: typeof appEmailAssignmentsTable.$inferSelect) {
  return { id: `email_${assignment.id}`, name: "Email access", email: assignment.email };
}

async function onboardingResult(req: AppRequest, app: AppRecord, member: { id: string; name: string; email: string }, createdAt: Date) {
  try {
    if (!member.email) throw new Error("Email not sent: this account has no primary email address.");
    await sendAppOnboarding({
      appId: app.id, appName: app.name, name: member.name, email: member.email,
      previewUrl: app.previewUrl, portalOrigin: process.env.ASTRA_PUBLIC_URL ?? "",
      eventId: `${app.id}/${member.id}/${createdAt.getTime()}/${app.updatedAt.getTime()}`,
    });
    return { ...member, emailDelivery: "sent", emailMessage: `Instructions sent to ${member.email}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email not sent. The client is still assigned.";
    req.log.warn({ appId: app.id, message }, "App onboarding email failed");
    return { ...member, emailDelivery: "failed", emailMessage: message };
  }
}

router.put("/apps/:id/assignments", devOnly as RequestHandler, handler(async (req, res) => {
  const app = await findApp(req, res);
  if (!app) return;
  const body = appAssignmentInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.issues[0]?.message ?? "Enter a valid email or choose a registered account." }); return; }
  if (body.data.email) {
    const email = body.data.email;
    const [added] = await db.insert(appEmailAssignmentsTable).values({ appId: app.id, email, assignedBy: req.userId! }).onConflictDoNothing().returning();
    const current = added ?? (await db.select().from(appEmailAssignmentsTable).where(and(eq(appEmailAssignmentsTable.appId, app.id), eq(appEmailAssignmentsTable.email, email))))[0];
    if (!current) throw new Error("Could not save the email assignment. Please try again.");
    const member = serializeEmailAssignment(current);
    res.json(added ? await onboardingResult(req, app, member, added.createdAt) : {
      ...member, emailDelivery: "not_sent", emailMessage: "Already assigned. Use Send instructions to send or retry their onboarding email.",
    });
    return;
  }
  let user: ClerkUser;
  try { user = await clerkClient.users.getUser(body.data.userId!); }
  catch { res.status(404).json({ error: "That registered account no longer exists." }); return; }
  const [added] = await db.insert(appAssignmentsTable).values({
    appId: app.id, userId: user.id, assignedBy: req.userId!,
  }).onConflictDoNothing().returning();
  res.json(added ? await onboardingResult(req, app, serializeUser(user), added.createdAt) : {
    ...serializeUser(user), emailDelivery: "not_sent",
    emailMessage: "Already assigned. Use Send instructions to send or retry their onboarding email.",
  });
}));

router.post("/apps/:id/assignments/:userId/email", devOnly as RequestHandler, handler(async (req, res) => {
  const app = await findApp(req, res);
  if (!app) return;
  const userId = userIdSchema.safeParse(req.params.userId);
  if (!userId.success) { res.status(400).json({ error: "Invalid user ID." }); return; }
  if (userId.data.startsWith("email_")) {
    const id = uuid.safeParse(userId.data.slice(6));
    if (!id.success) { res.status(400).json({ error: "Invalid email assignment ID." }); return; }
    const [assignment] = await db.select().from(appEmailAssignmentsTable)
      .where(and(eq(appEmailAssignmentsTable.appId, app.id), eq(appEmailAssignmentsTable.id, id.data)));
    if (!assignment) { res.status(404).json({ error: "This email is not assigned to the app." }); return; }
    res.json(await onboardingResult(req, app, serializeEmailAssignment(assignment), assignment.createdAt));
    return;
  }
  const [assignment] = await db.select().from(appAssignmentsTable)
    .where(and(eq(appAssignmentsTable.appId, app.id), eq(appAssignmentsTable.userId, userId.data)));
  if (!assignment) { res.status(404).json({ error: "This account is not assigned to the app." }); return; }
  let user: ClerkUser;
  try { user = await clerkClient.users.getUser(userId.data); }
  catch { res.status(404).json({ error: "That registered account no longer exists." }); return; }
  res.json(await onboardingResult(req, app, serializeUser(user), assignment.createdAt));
}));

router.delete("/apps/:id/assignments/:userId", devOnly as RequestHandler, handler(async (req, res) => {
  const app = await findApp(req, res);
  if (!app) return;
  const userId = userIdSchema.safeParse(req.params.userId);
  if (!userId.success) { res.status(400).json({ error: "Invalid user ID." }); return; }
  if (userId.data.startsWith("email_")) {
    const id = uuid.safeParse(userId.data.slice(6));
    if (!id.success) { res.status(400).json({ error: "Invalid email assignment ID." }); return; }
    await db.delete(appEmailAssignmentsTable).where(and(eq(appEmailAssignmentsTable.appId, app.id), eq(appEmailAssignmentsTable.id, id.data)));
    res.status(204).send();
    return;
  }
  await db.delete(appAssignmentsTable).where(and(eq(appAssignmentsTable.appId, app.id), eq(appAssignmentsTable.userId, userId.data)));
  res.status(204).end();
}));

router.post("/apps/:id/automation", devOnly as RequestHandler, handler(async (req, res) => {
  const app = await findApp(req, res);
  if (!app) return;
  const result = await configureTestFlight(app);
  await db.update(expoAppsTable).set({ automationConfigured: true, updatedAt: new Date() }).where(eq(expoAppsTable.id, app.id));
  res.json({ message: "TestFlight workflow configured. Expo iOS signing credentials and a GitHub-linked Expo project are still required.", url: result.url });
}));

router.post("/apps/:id/build", devOnly as RequestHandler, handler(async (req, res) => {
  const app = await findApp(req, res);
  if (!app) return;
  if (!app.automationConfigured) { res.status(409).json({ error: "Configure this app's TestFlight automation first." }); return; }
  const builds = await listExpoBuilds(app.id);
  if (builds.some((build) => ["NEW", "IN_QUEUE", "IN_PROGRESS", "PENDING_CANCEL"].includes(build.status))) {
    res.status(409).json({ error: "This app already has an active build. Check its status before starting another." }); return;
  }
  const now = new Date();
  const claimed = await db.update(expoAppsTable).set({ buildRequestedAt: now })
    .where(and(eq(expoAppsTable.id, app.id), or(isNull(expoAppsTable.buildRequestedAt), lt(expoAppsTable.buildRequestedAt, new Date(now.getTime() - 10 * 60_000)))))
    .returning({ id: expoAppsTable.id });
  if (!claimed.length) { res.status(409).json({ error: "A build was recently requested. Wait for it to appear in Expo before starting another." }); return; }
  try {
    const branch = await appSourceBranch(app);
    const run = await startExpoTestFlight(app.id, branch, app.appDirectory, TESTFLIGHT_WORKFLOW);
    await db.update(expoAppsTable).set({ buildRequestId: run.id, buildRequestUrl: run.url, updatedAt: now }).where(eq(expoAppsTable.id, app.id));
    res.status(202).json({ message: "Expo workflow requested. This builds iOS and submits to TestFlight; Apple processing and tester approval happen afterward.", url: run.url });
  } catch (error) {
    await db.update(expoAppsTable).set({ buildRequestedAt: null }).where(and(eq(expoAppsTable.id, app.id), eq(expoAppsTable.buildRequestedAt, now)));
    throw error;
  }
}));

export default router;