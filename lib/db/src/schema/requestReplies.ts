import { pgTable, serial, integer, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { tweakRequestsTable } from "./tweakRequests";

export const requestRepliesTable = pgTable("request_replies", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => tweakRequestsTable.id),
  authorUserId: text("author_user_id").notNull(),
  authorName: text("author_name").notNull(),
  message: text("message").notNull(),
  clientKey: uuid("client_key").notNull().unique(),
  emailStatus: text("email_status").notNull().default("pending"),
  emailError: text("email_error"),
  emailId: text("email_id"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [index("request_replies_request_idx").on(table.requestId)]);
