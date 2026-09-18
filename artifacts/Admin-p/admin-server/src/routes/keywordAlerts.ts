import { Router, type IRouter } from "express";
import { db, keywordAlertsTable, alertEventsTable, appConfigTable, activeAccessTokensTable } from "@workspace/db";
import { encryptConfigValue } from "@workspace/db/secure-config";
import { eq, desc, and, sql, like } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth";
import { audit } from "../lib/audit";
import { evaluateDryRun } from "../lib/keywordAlertEngine";

const router: IRouter = Router();

const VALID_SEVERITIES = ["critical", "high", "medium", "low"] as const;
const VALID_MODES = ["exact", "phrase", "contains", "regex"] as const;
const VALID_LOGIC = ["any", "all", "advanced"] as const;
const VALID_CHANNELS = ["in-app", "email", "webhook", "telegram"] as const;
const MAX_KEYWORD_LENGTH = 200;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_PATTERN_LENGTH = 500;

const TELEGRAM_TOKEN_KEY = "telegram_bot_token";
const TELEGRAM_CHAT_KEY = "telegram_chat_id";
const TELEGRAM_BOT_NAME_KEY = "telegram_bot_name";
const TELEGRAM_CONFIGURED_AT_KEY = "telegram_configured_at";

function readConfig(key: string): Promise<string | null> {
  return db.select({ value: appConfigTable.value })
    .from(appConfigTable)
    .where(eq(appConfigTable.key, key))
    .limit(1)
    .then((rows) => rows[0]?.value ?? null);
}

function writeConfig(key: string, value: string): Promise<void> {
  return db.insert(appConfigTable).values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value, updatedAt: new Date() } })
    .then(() => undefined);
}

function deleteConfig(key: string): Promise<void> {
  return db.delete(appConfigTable).where(eq(appConfigTable.key, key)).then(() => undefined);
}

router.get("/keyword-alerts", adminAuth, async (_req, res): Promise<void> => {
  try {
    const alerts = await db.select().from(keywordAlertsTable).orderBy(desc(keywordAlertsTable.createdAt));
    res.json(alerts.map(mapAlert));
  } catch {
    res.status(500).json({ error: "Failed to list alerts." });
  }
});

router.post("/keyword-alerts", adminAuth, async (req, res): Promise<void> => {
  try {
    const error = validateAlertBody(req.body);
    if (error) { res.status(400).json({ error }); return; }

    const body = req.body as Record<string, unknown>;
    const rows = await (db.insert(keywordAlertsTable) as any).values({
      name: String(body.name).trim(),
      description: String(body.description ?? "").trim(),
      severity: body.severity as string,
      enabled: body.enabled !== false,
      keywords: body.keywords as string[],
      mode: body.mode as string,
      logic: body.logic as string,
      caseSensitive: body.caseSensitive === true,
      mailbox: String(body.mailbox ?? "All controlled mailboxes"),
      folder: String(body.folder ?? "Inbox"),
      senderPattern: String(body.senderPattern ?? ""),
      recipientPattern: String(body.recipientPattern ?? ""),
      subjectPattern: String(body.subjectPattern ?? ""),
      bodyPattern: String(body.bodyPattern ?? ""),
      attachmentPattern: String(body.attachmentPattern ?? ""),
      channels: body.channels as string[],
      sysadminEmail: String(body.sysadminEmail ?? ""),
      telegramBot: String(body.telegramBot ?? ""),
      cooldown: typeof body.cooldown === "number" ? body.cooldown : 30,
    }).returning();
    const alert = rows[0];

    audit(req, "keyword_alert_created", "keyword_alert", String(alert.id), { name: alert.name });
    res.status(201).json(mapAlert(alert));
  } catch (err) {
    req.log.error({ err }, "Failed to create alert");
    res.status(500).json({ error: "Failed to create alert." });
  }
});

router.patch("/keyword-alerts/:id", adminAuth, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid alert ID." }); return; }

    const [existing] = await db.select().from(keywordAlertsTable).where(eq(keywordAlertsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Alert not found." }); return; }

    const body = req.body as Record<string, unknown>;
    if (body.name !== undefined || body.keywords !== undefined || body.channels !== undefined) {
      const partial = { ...existing, ...body };
      const error = validateAlertBody(partial);
      if (error) { res.status(400).json({ error }); return; }
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.description !== undefined) updates.description = String(body.description).trim();
    if (body.severity !== undefined) updates.severity = body.severity;
    if (body.enabled !== undefined) updates.enabled = body.enabled === true;
    if (body.keywords !== undefined) updates.keywords = body.keywords;
    if (body.mode !== undefined) updates.mode = body.mode;
    if (body.logic !== undefined) updates.logic = body.logic;
    if (body.caseSensitive !== undefined) updates.caseSensitive = body.caseSensitive === true;
    if (body.mailbox !== undefined) updates.mailbox = String(body.mailbox);
    if (body.folder !== undefined) updates.folder = String(body.folder);
    if (body.senderPattern !== undefined) updates.senderPattern = String(body.senderPattern);
    if (body.recipientPattern !== undefined) updates.recipientPattern = String(body.recipientPattern);
    if (body.subjectPattern !== undefined) updates.subjectPattern = String(body.subjectPattern);
    if (body.bodyPattern !== undefined) updates.bodyPattern = String(body.bodyPattern);
    if (body.attachmentPattern !== undefined) updates.attachmentPattern = String(body.attachmentPattern);
    if (body.channels !== undefined) updates.channels = body.channels;
    if (body.sysadminEmail !== undefined) updates.sysadminEmail = String(body.sysadminEmail);
    if (body.telegramBot !== undefined) updates.telegramBot = String(body.telegramBot);
    if (body.cooldown !== undefined) updates.cooldown = typeof body.cooldown === "number" ? body.cooldown : 30;
    updates.updatedAt = new Date();

    const [updated] = await db.update(keywordAlertsTable)
      .set(updates)
      .where(eq(keywordAlertsTable.id, id))
      .returning();

    audit(req, "keyword_alert_updated", "keyword_alert", String(id), { name: updated.name });
    res.json(mapAlert(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update alert");
    res.status(500).json({ error: "Failed to update alert." });
  }
});

router.delete("/keyword-alerts/:id", adminAuth, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid alert ID." }); return; }

    const [existing] = await db.select().from(keywordAlertsTable).where(eq(keywordAlertsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Alert not found." }); return; }

    await db.delete(keywordAlertsTable).where(eq(keywordAlertsTable.id, id));
    audit(req, "keyword_alert_deleted", "keyword_alert", String(id), { name: existing.name });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete alert");
    res.status(500).json({ error: "Failed to delete alert." });
  }
});

router.post("/keyword-alerts/:id/test", adminAuth, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid alert ID." }); return; }

    const [alert] = await db.select().from(keywordAlertsTable).where(eq(keywordAlertsTable.id, id)).limit(1);
    if (!alert) { res.status(404).json({ error: "Alert not found." }); return; }

    const { sender = "", recipient = "", subject = "", body = "", attachment = "" } = req.body as Record<string, string | undefined>;
    const result = evaluateDryRun({
      keywords: alert.keywords,
      mode: alert.mode as "exact" | "phrase" | "contains" | "regex",
      caseSensitive: alert.caseSensitive,
      senderPattern: alert.senderPattern,
      recipientPattern: alert.recipientPattern,
      subjectPattern: alert.subjectPattern,
      bodyPattern: alert.bodyPattern,
      attachmentPattern: alert.attachmentPattern,
    }, { sender, recipient, subject, body, attachment });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to run dry test");
    res.status(500).json({ error: "Failed to run dry test." });
  }
});

router.get("/keyword-alert-events", adminAuth, async (req, res): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offsetValue = (page - 1) * limit;
    const alertId = req.query.alertId ? Number(req.query.alertId) : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    let conditions: ReturnType<typeof eq>[] = [];
    if (alertId && Number.isInteger(alertId) && alertId > 0) {
      conditions.push(eq(alertEventsTable.alertId, alertId));
    }
    let whereClause;
    if (search) {
      const pattern = `%${search}%`;
      const searchCond = sql`${alertEventsTable.subject} ilike ${pattern} or ${alertEventsTable.sender} ilike ${pattern} or ${alertEventsTable.alertName} ilike ${pattern}`;
      whereClause = conditions.length > 0 ? and(...conditions, searchCond) : searchCond;
    } else {
      whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    }

    const events = whereClause
      ? await db.select().from(alertEventsTable).where(whereClause).orderBy(desc(alertEventsTable.createdAt)).limit(limit).offset(offsetValue)
      : await db.select().from(alertEventsTable).orderBy(desc(alertEventsTable.createdAt)).limit(limit).offset(offsetValue);
    res.json(events.map(mapEvent));
  } catch (err) {
    req.log.error({ err }, "Failed to list events");
    res.status(500).json({ error: "Failed to list events." });
  }
});

router.get("/mailboxes", adminAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select({ user: activeAccessTokensTable.user }).from(activeAccessTokensTable);
    const unique = [...new Set(rows.map((r) => r.user))].filter(Boolean).sort();
    res.json(unique);
  } catch (err) {
    _req.log.error({ err }, "Failed to list mailboxes");
    res.status(500).json({ error: "Failed to list mailboxes." });
  }
});

router.get("/telegram-connection", adminAuth, async (_req, res): Promise<void> => {
  try {
    const [chatId, botName, configuredAt] = await Promise.all([
      readConfig(TELEGRAM_CHAT_KEY),
      readConfig(TELEGRAM_BOT_NAME_KEY),
      readConfig(TELEGRAM_CONFIGURED_AT_KEY),
    ]);

    if (!chatId) {
      res.json({ connected: false, chatId: "", botName: "", configuredAt: null });
      return;
    }

    res.json({
      connected: true,
      chatId,
      botName: botName ?? "",
      configuredAt: configuredAt ?? null,
    });
  } catch (err) {
    _req.log.error({ err }, "Failed to read Telegram connection");
    res.status(500).json({ error: "Failed to read Telegram connection." });
  }
});

router.post("/telegram-connection", adminAuth, async (req, res): Promise<void> => {
  try {
    const { botToken, chatId } = req.body as Record<string, string | undefined>;
    if (!botToken || typeof botToken !== "string" || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken.trim())) {
      res.status(400).json({ error: "Invalid Telegram bot token format." });
      return;
    }
    if (!chatId || typeof chatId !== "string" || !/^-?\d{5,}$/.test(chatId.trim())) {
      res.status(400).json({ error: "Invalid Telegram chat ID format." });
      return;
    }

    const encryptedToken = encryptConfigValue(botToken.trim());
    const now = new Date().toISOString().slice(0, 10);

    await Promise.all([
      writeConfig(TELEGRAM_TOKEN_KEY, encryptedToken),
      writeConfig(TELEGRAM_CHAT_KEY, chatId.trim()),
      writeConfig(TELEGRAM_BOT_NAME_KEY, "northstar-alerts"),
      writeConfig(TELEGRAM_CONFIGURED_AT_KEY, now),
    ]);

    audit(req, "telegram_connection_updated", "telegram_connection", undefined, { chatId: chatId.trim() });

    res.json({
      connected: true,
      chatId: chatId.trim(),
      botName: "northstar-alerts",
      configuredAt: now,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to save Telegram connection");
    res.status(500).json({ error: "Failed to save Telegram connection." });
  }
});

router.delete("/telegram-connection", adminAuth, async (req, res): Promise<void> => {
  try {
    const keys = [TELEGRAM_TOKEN_KEY, TELEGRAM_CHAT_KEY, TELEGRAM_BOT_NAME_KEY, TELEGRAM_CONFIGURED_AT_KEY];
    await Promise.all(keys.map(deleteConfig));
    audit(req, "telegram_connection_deleted", "telegram_connection");
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete Telegram connection");
    res.status(500).json({ error: "Failed to delete Telegram connection." });
  }
});

function mapAlert(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    severity: row.severity,
    enabled: row.enabled,
    keywords: row.keywords,
    mode: row.mode,
    logic: row.logic,
    caseSensitive: row.caseSensitive,
    mailbox: row.mailbox,
    folder: row.folder,
    senderPattern: row.senderPattern,
    recipientPattern: row.recipientPattern,
    subjectPattern: row.subjectPattern,
    bodyPattern: row.bodyPattern,
    attachmentPattern: row.attachmentPattern,
    channels: row.channels,
    sysadminEmail: row.sysadminEmail,
    telegramBot: row.telegramBot,
    cooldown: row.cooldown,
    matchCount: row.matchCount,
    lastMatch: row.lastMatch ?? null,
    createdAt: row.createdAt ? String(row.createdAt).slice(0, 10) : "",
  };
}

function mapEvent(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    alertId: String(row.alertId),
    alertName: row.alertName,
    subject: row.subject,
    sender: row.sender,
    mailbox: row.mailbox,
    matched: row.matched,
    timestamp: row.timestamp ? formatRelativeTime(row.timestamp as Date) : "",
    channel: row.channel,
  };
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} sec ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return String(date).slice(0, 10);
}

function validateAlertBody(body: Record<string, unknown>): string | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return "Alert name is required.";
  if (name.length > MAX_NAME_LENGTH) return `Alert name must be ${MAX_NAME_LENGTH} characters or fewer.`;

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length > MAX_DESCRIPTION_LENGTH) return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;

  const keywords = body.keywords;
  if (!Array.isArray(keywords) || keywords.length === 0) return "At least one keyword is required.";
  for (const keyword of keywords) {
    if (typeof keyword !== "string" || keyword.length > MAX_KEYWORD_LENGTH) {
      return `Each keyword must be ${MAX_KEYWORD_LENGTH} characters or fewer.`;
    }
  }

  const channels = body.channels;
  if (!Array.isArray(channels) || channels.length === 0) return "At least one notification channel is required.";
  for (const channel of channels) {
    if (!(VALID_CHANNELS as readonly string[]).includes(channel)) {
      return `Invalid channel: "${channel}". Must be one of: ${VALID_CHANNELS.join(", ")}.`;
    }
  }

  const severity = body.severity;
  if (severity && !(VALID_SEVERITIES as readonly string[]).includes(severity as string)) {
    return `Invalid severity: "${severity}". Must be one of: ${VALID_SEVERITIES.join(", ")}.`;
  }

  const mode = body.mode;
  if (mode && !(VALID_MODES as readonly string[]).includes(mode as string)) {
    return `Invalid mode: "${mode}". Must be one of: ${VALID_MODES.join(", ")}.`;
  }

  const logic = body.logic;
  if (logic && !(VALID_LOGIC as readonly string[]).includes(logic as string)) {
    return `Invalid logic: "${logic}". Must be one of: ${VALID_LOGIC.join(", ")}.`;
  }

  const cooldown = body.cooldown;
  if (cooldown !== undefined && (typeof cooldown !== "number" || cooldown < 0)) {
    return "Cooldown must be a non-negative number.";
  }

  if (channels.includes("email")) {
    const email = typeof body.sysadminEmail === "string" ? body.sysadminEmail.trim() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Invalid sysadmin email format.";
    }
  }

  if (mode === "regex") {
    for (const keyword of keywords) {
      try {
        new RegExp(keyword);
      } catch {
        return `Invalid regex in keyword "${keyword}".`;
      }
    }
  }

  const patterns = [body.senderPattern, body.recipientPattern, body.subjectPattern, body.bodyPattern, body.attachmentPattern];
  for (const pattern of patterns) {
    if (typeof pattern === "string" && pattern.length > MAX_PATTERN_LENGTH) {
      return `Each pattern must be ${MAX_PATTERN_LENGTH} characters or fewer.`;
    }
    if (typeof pattern === "string" && pattern) {
      try { new RegExp(pattern); } catch { return `Invalid regex pattern: "${pattern}".`; }
    }
  }

  return null;
}

export default router;