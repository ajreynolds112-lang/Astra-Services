import { pgTable, text, serial, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

/**
 * Every App Tweaks Request submitted through the portal.
 * billing: free (monthly allowance) | paid ($20 fee via Stripe Checkout) | staff (owner/dev)
 * status: pending_payment -> delivering -> delivered
 */
export const tweakRequestsTable = pgTable("tweak_requests", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  planLabel: text("plan_label").notNull(),
  payload: jsonb("payload").notNull(),
  billing: text("billing").notNull(),
  status: text("status").notNull(),
  checkoutSessionId: text("checkout_session_id").unique(),
  fileName: text("file_name"),
  emailed: boolean("emailed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

export type TweakRequestRow = typeof tweakRequestsTable.$inferSelect;
