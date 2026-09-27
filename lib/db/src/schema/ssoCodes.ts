import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";

export const ssoCodesTable = pgTable("sso_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  assertion: text("assertion").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});