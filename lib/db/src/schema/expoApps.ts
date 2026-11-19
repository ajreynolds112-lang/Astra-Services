import { pgTable, text, uuid, timestamp, boolean, primaryKey, unique } from "drizzle-orm/pg-core";

export const expoAppsTable = pgTable("expo_apps", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  owner: text("owner").notNull(),
  repositoryUrl: text("repository_url"),
  appDirectory: text("app_directory").notNull().default(""),
  siteUrl: text("site_url"),
  previewUrl: text("preview_url"),
  testflightUrl: text("testflight_url"),
  ascAppId: text("asc_app_id"),
  automationConfigured: boolean("automation_configured").notNull().default(false),
  buildRequestId: text("build_request_id"),
  buildRequestUrl: text("build_request_url"),
  buildRequestedAt: timestamp("build_requested_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appAssignmentsTable = pgTable("app_assignments", {
  appId: uuid("app_id").notNull().references(() => expoAppsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  assignedBy: text("assigned_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.appId, table.userId] })]);

// Email assignments work before a Clerk account exists; old user-ID grants remain valid.
export const appEmailAssignmentsTable = pgTable("app_email_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id").notNull().references(() => expoAppsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  assignedBy: text("assigned_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique().on(table.appId, table.email)]);