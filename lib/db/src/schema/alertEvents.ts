import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const alertEventsTable = pgTable("alert_events", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id").notNull(),
  alertName: text("alert_name").notNull(),
  subject: text("subject").notNull().default(""),
  sender: text("sender").notNull().default(""),
  mailbox: text("mailbox").notNull().default(""),
  matched: text("matched").notNull().default(""),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  channel: text("channel").notNull().default("in-app"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AlertEvent = typeof alertEventsTable.$inferSelect;