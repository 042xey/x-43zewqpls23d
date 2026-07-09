import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const proxyUrlsTable = pgTable("proxy_urls", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProxyUrl = typeof proxyUrlsTable.$inferSelect;
