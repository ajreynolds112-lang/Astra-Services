import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

/** People the owner has granted dev access to. Emails are stored lowercased. */
export const devUsersTable = pgTable("dev_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  receiveUpdates: boolean("receive_updates").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DevUser = typeof devUsersTable.$inferSelect;
