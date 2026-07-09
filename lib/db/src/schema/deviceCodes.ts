import { pgTable, text, timestamp, pgEnum, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deviceCodeStatusEnum = pgEnum("device_code_status", [
  "POLLING",
  "SUCCESS",
  "EXPIRED",
]);

export const deviceCodesTable = pgTable("device_codes", {
  id: serial("id").notNull(),
  userCode: text("user_code").primaryKey(),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  clientId: text("client_id").notNull(),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  status: deviceCodeStatusEnum("status").notNull().default("POLLING"),
});

export const insertDeviceCodeSchema = createInsertSchema(deviceCodesTable);
export type InsertDeviceCode = z.infer<typeof insertDeviceCodeSchema>;
export type DeviceCode = typeof deviceCodesTable.$inferSelect;
