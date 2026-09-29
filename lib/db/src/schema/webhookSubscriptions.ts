import { pgTable, text, timestamp, serial, integer, boolean } from "drizzle-orm/pg-core";

export const webhookSubscriptionsTable = pgTable("webhook_subscriptions", {
  id: serial("id").primaryKey(),
  subscriptionId: text("subscription_id").notNull().unique(),
  userId: text("user_id").notNull(),
  mailbox: text("mailbox").notNull(),
  resource: text("resource").notNull(),
  expirationDateTime: timestamp("expiration_date_time", { withTimezone: true }).notNull(),
  clientState: text("client_state").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastRenewedAt: timestamp("last_renewed_at", { withTimezone: true }),
});

export type WebhookSubscription = typeof webhookSubscriptionsTable.$inferSelect;