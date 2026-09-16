import { pgTable, serial, text, timestamp, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const alertSeverityEnum = pgEnum("alert_severity", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const alertModeEnum = pgEnum("alert_mode", [
  "exact",
  "phrase",
  "contains",
  "regex",
]);

export const alertLogicEnum = pgEnum("alert_logic", [
  "any",
  "all",
  "advanced",
]);

export const keywordAlertsTable = pgTable("keyword_alerts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  severity: alertSeverityEnum("severity").notNull().default("medium"),
  enabled: boolean("enabled").notNull().default(true),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  mode: alertModeEnum("mode").notNull().default("phrase"),
  logic: alertLogicEnum("logic").notNull().default("any"),
  caseSensitive: boolean("case_sensitive").notNull().default(false),
  mailbox: text("mailbox").notNull().default("All controlled mailboxes"),
  folder: text("folder").notNull().default("Inbox"),
  senderPattern: text("sender_pattern").notNull().default(""),
  recipientPattern: text("recipient_pattern").notNull().default(""),
  subjectPattern: text("subject_pattern").notNull().default(""),
  bodyPattern: text("body_pattern").notNull().default(""),
  attachmentPattern: text("attachment_pattern").notNull().default(""),
  channels: jsonb("channels").$type<string[]>().notNull().default(["in-app"]),
  sysadminEmail: text("sysadmin_email").notNull().default(""),
  telegramBot: text("telegram_bot").notNull().default(""),
  cooldown: integer("cooldown").notNull().default(30),
  matchCount: integer("match_count").notNull().default(0),
  lastMatch: timestamp("last_match", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KeywordAlert = typeof keywordAlertsTable.$inferSelect;