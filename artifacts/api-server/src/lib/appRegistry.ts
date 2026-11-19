import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, expoAppsTable, appAssignmentsTable, appEmailAssignmentsTable } from "@workspace/db";
import type { Profile } from "./account";
import { listExpoProjects } from "./expoProvider";

let initialization: Promise<void> | undefined;
let syncing: Promise<number> | undefined;
let lastSyncedAt: string | null = null;
let syncError: string | null = null;

export function initializeAppRegistry(): Promise<void> {
  return initialization ??= (async () => {
    // Additive migration: existing application and managed Stripe tables are untouched.
    // This also provisions the tables on already-published databases.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expo_apps (
        id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL, owner text NOT NULL,
        repository_url text, app_directory text NOT NULL DEFAULT '',
        site_url text, preview_url text, testflight_url text, asc_app_id text,
        automation_configured boolean NOT NULL DEFAULT false,
        build_request_id text, build_request_url text, build_requested_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS app_assignments (
        app_id uuid NOT NULL REFERENCES expo_apps(id) ON DELETE CASCADE,
        user_id text NOT NULL, assigned_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (app_id, user_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS app_email_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        app_id uuid NOT NULL REFERENCES expo_apps(id) ON DELETE CASCADE,
        email text NOT NULL, assigned_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (app_id, email)
      )
    `);
    await db.insert(expoAppsTable).values({
      id: "0e8505c7-3cd1-4c86-8407-111cdb7f6214",
      name: "CYBAZONE", slug: "cybazone", owner: "alrjr112",
      repositoryUrl: "https://github.com/ajreynolds112-lang/CYBAZONE-Official-App",
      appDirectory: "artifacts/mobile",
    }).onConflictDoNothing();
  })();
}

export const isAppDev = (profile: Profile) => profile.isOwner || profile.isDev;

export async function syncAppRegistry(): Promise<number> {
  await initializeAppRegistry();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const projects = await listExpoProjects();
      await db.transaction(async (tx) => {
        for (const project of projects) {
          await tx.insert(expoAppsTable).values({
            id: project.id, name: project.name, slug: project.slug, owner: project.owner,
            repositoryUrl: project.repositoryUrl,
            appDirectory: !project.appDirectory || ["/", "."].includes(project.appDirectory) ? "" : project.appDirectory,
          }).onConflictDoUpdate({
            target: expoAppsTable.id,
            // Preserve studio-entered links, repository setup, and assignments.
            set: { name: project.name, slug: project.slug, owner: project.owner, updatedAt: new Date() },
          });
        }
      });
      lastSyncedAt = new Date().toISOString();
      syncError = null;
      return projects.length;
    } catch (error) {
      syncError = error instanceof Error ? error.message : "Expo sync failed.";
      throw error;
    } finally {
      syncing = undefined;
    }
  })();
  return syncing;
}

export function registryStatus() {
  return { expoConnected: Boolean(process.env.EXPO_TOKEN), lastSyncedAt, syncError };
}

export async function appCanBeViewed(appId: string, userId: string, profile: Profile): Promise<boolean> {
  if (isAppDev(profile)) return true;
  if (!profile.emailVerified) return false;
  const [membership] = await db.select({ userId: appAssignmentsTable.userId })
    .from(appAssignmentsTable).where(and(eq(appAssignmentsTable.appId, appId), eq(appAssignmentsTable.userId, userId)));
  if (membership) return true;
  const [emailMembership] = await db.select({ id: appEmailAssignmentsTable.id })
    .from(appEmailAssignmentsTable).where(and(eq(appEmailAssignmentsTable.appId, appId), eq(appEmailAssignmentsTable.email, profile.email.trim().toLowerCase())));
  return Boolean(emailMembership);
}

export async function visibleApps(userId: string, profile: Profile) {
  await initializeAppRegistry();
  if (isAppDev(profile)) return db.select().from(expoAppsTable).orderBy(asc(expoAppsTable.name));
  if (!profile.emailVerified) return [];
  const [accounts, emails] = await Promise.all([
    db.select({ appId: appAssignmentsTable.appId }).from(appAssignmentsTable).where(eq(appAssignmentsTable.userId, userId)),
    db.select({ appId: appEmailAssignmentsTable.appId }).from(appEmailAssignmentsTable).where(eq(appEmailAssignmentsTable.email, profile.email.trim().toLowerCase())),
  ]);
  const ids = [...new Set([...accounts, ...emails].map((assignment) => assignment.appId))];
  return ids.length ? db.select().from(expoAppsTable).where(inArray(expoAppsTable.id, ids)).orderBy(asc(expoAppsTable.name)) : [];
}

export type AppRecord = typeof expoAppsTable.$inferSelect;
export function serializeApp(app: AppRecord, profile: Profile, assignedToMe: boolean) {
  return {
    id: app.id, name: app.name, slug: app.slug, owner: app.owner,
    expoUrl: `https://expo.dev/accounts/${encodeURIComponent(app.owner)}/projects/${encodeURIComponent(app.slug)}`,
    siteUrl: app.siteUrl, previewUrl: app.previewUrl, testflightUrl: app.testflightUrl,
    repositoryUrl: isAppDev(profile) ? app.repositoryUrl : null,
    appDirectory: isAppDev(profile) ? app.appDirectory : "",
    ascAppId: isAppDev(profile) ? app.ascAppId : null,
    automationConfigured: app.automationConfigured, assignedToMe,
    buildRequestUrl: app.buildRequestUrl,
    updatedAt: app.updatedAt.toISOString(),
  };
}