import { and, eq, gt, lte } from "drizzle-orm";
import { db, activeAccessTokensTable, activeRefreshTokensTable, keywordAlertsTable, alertEventsTable, webhookSubscriptionsTable } from "@workspace/db";
import { decryptConfigValue } from "@workspace/db/secure-config";
import { evaluateDryRun, type AlertRule, type DryRunInput } from "./keywordAlertEngine";
import { refreshAccessToken } from "./msTokenclient";
import { logger } from "./logger";

const GRAPH_RESOURCE = "https://graph.microsoft.com";
const GRAPH_API = "https://graph.microsoft.com/v1.0";
const SUBSCRIPTION_EXPIRY_SEC = 3600;
const CLIENT_STATE = process.env.WEBHOOK_CLIENT_STATE ?? "keyword-alerts-v1";
const NOTIFICATION_URL = process.env.WEBHOOK_CALLBACK_URL ?? "";

function generateClientState(): string {
  return `${CLIENT_STATE}:${Date.now().toString(36)}`;
}

async function getGraphToken(userId: string): Promise<string | null> {
  const [row] = await db.select({ id: activeAccessTokensTable.id, accessToken: activeAccessTokensTable.accessToken, clientId: activeAccessTokensTable.clientId })
    .from(activeAccessTokensTable)
    .where(and(
      eq(activeAccessTokensTable.user, userId),
      eq(activeAccessTokensTable.resource, GRAPH_RESOURCE),
      gt(activeAccessTokensTable.expires, new Date()),
    ))
    .limit(1);
  if (!row) return null;
  const token = decryptConfigValue(row.accessToken);
  if (!token) return null;

  const [refreshRow] = await db.select()
    .from(activeRefreshTokensTable)
    .where(and(
      eq(activeRefreshTokensTable.user, userId),
      eq(activeRefreshTokensTable.resource, GRAPH_RESOURCE),
    ))
    .limit(1);
  if (!refreshRow?.refreshToken) return token;

  const decryptedRefresh = decryptConfigValue(refreshRow.refreshToken);
  if (!decryptedRefresh) return token;

  try {
    const result = await refreshAccessToken(row.clientId, decryptedRefresh, GRAPH_RESOURCE);
    await db.update(activeAccessTokensTable).set({ accessToken: result.access_token }).where(eq(activeAccessTokensTable.id, row.id));
    return result.access_token;
  } catch {
    return token;
  }
}

async function graphPost(token: string, path: string, body: unknown): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${GRAPH_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, path, body: text.slice(0, 300) }, "Graph POST failed");
    return null;
  }
  if (response.status === 204) return null;
  return response.json() as Promise<Record<string, unknown>>;
}

export async function createSubscription(userId: string, mailbox: string, token: string): Promise<string | null> {
  if (!NOTIFICATION_URL) {
    logger.warn("WEBHOOK_CALLBACK_URL not set — skipping subscription creation");
    return null;
  }
  const notificationUrl = `${NOTIFICATION_URL}/api/webhook/notifications`;
  const clientState = generateClientState();
  const expiration = new Date(Date.now() + SUBSCRIPTION_EXPIRY_SEC * 1000);

  const result = await graphPost(token, "/subscriptions", {
    changeType: "created",
    notificationUrl,
    resource: `/users/${encodeURIComponent(mailbox)}/messages`,
    expirationDateTime: expiration.toISOString(),
    clientState,
    includeResourceData: false,
  });

  if (!result?.id) {
    logger.error({ mailbox, userId }, "Failed to create Graph subscription");
    return null;
  }

  const subscriptionId = result.id as string;
  await db.insert(webhookSubscriptionsTable).values({
    subscriptionId,
    userId,
    mailbox,
    resource: `/users/${encodeURIComponent(mailbox)}/messages`,
    expirationDateTime: expiration,
    clientState,
    active: true,
    createdAt: new Date(),
    lastRenewedAt: new Date(),
  }).onConflictDoNothing({ target: webhookSubscriptionsTable.subscriptionId });

  logger.info({ subscriptionId, mailbox, expiresAt: expiration.toISOString() }, "Graph subscription created");
  return subscriptionId;
}

export async function renewSubscription(sub: typeof webhookSubscriptionsTable.$inferSelect): Promise<boolean> {
  const token = await getGraphToken(sub.userId);
  if (!token) return false;

  const newExpiration = new Date(Date.now() + SUBSCRIPTION_EXPIRY_SEC * 1000);
  const result = await graphPost(token, `/subscriptions/${sub.subscriptionId}`, {
    expirationDateTime: newExpiration.toISOString(),
  });

  if (!result) {
    logger.warn({ subscriptionId: sub.subscriptionId, mailbox: sub.mailbox }, "Subscription renewal failed");
    await db.update(webhookSubscriptionsTable).set({ active: false }).where(eq(webhookSubscriptionsTable.id, sub.id));
    return false;
  }

  await db.update(webhookSubscriptionsTable).set({
    expirationDateTime: newExpiration,
    lastRenewedAt: new Date(),
  }).where(eq(webhookSubscriptionsTable.id, sub.id));

  return true;
}

export async function renewExpiringSubscriptions(): Promise<void> {
  const soon = new Date(Date.now() + 30 * 60 * 1000);
  const expiring = await db.select()
    .from(webhookSubscriptionsTable)
    .where(and(
      eq(webhookSubscriptionsTable.active, true),
      lte(webhookSubscriptionsTable.expirationDateTime, soon),
    ));

  for (const sub of expiring) {
    try {
      await renewSubscription(sub);
    } catch (err) {
      logger.error({ err, subscriptionId: sub.subscriptionId }, "Failed to renew subscription");
    }
  }
}

export async function setupSubscriptionsForAllMailboxes(): Promise<void> {
  const tokens = await db.select({ user: activeAccessTokensTable.user, clientId: activeAccessTokensTable.clientId })
    .from(activeAccessTokensTable)
    .where(eq(activeAccessTokensTable.resource, GRAPH_RESOURCE));
  const uniqueUsers = [...new Set(tokens.map((t) => t.user))].filter(Boolean);

  for (const userId of uniqueUsers) {
    const [existing] = await db.select()
      .from(webhookSubscriptionsTable)
      .where(and(
        eq(webhookSubscriptionsTable.mailbox, userId),
        eq(webhookSubscriptionsTable.active, true),
        gt(webhookSubscriptionsTable.expirationDateTime, new Date()),
      ))
      .limit(1);
    if (existing) continue;

    const token = await getGraphToken(userId);
    if (!token) {
      logger.warn({ userId }, "No token available for subscription setup");
      continue;
    }
    await createSubscription(userId, userId, token);
  }
}

export async function processNotification(
  notifications: Array<{ subscriptionId?: string; clientState?: string; resource?: string; changeType?: string }>,
): Promise<void> {
  const alerts = await db.select().from(keywordAlertsTable).where(eq(keywordAlertsTable.enabled, true));
  if (alerts.length === 0) return;

  for (const notif of notifications) {
    try {
      const resource = notif.resource ?? "";
      const match = resource.match(/\/users\/([^/]+)\/messages\/([^/]+)/);
      if (!match) continue;

      const mailbox = decodeURIComponent(match[1]);
      const messageId = match[2];

      const [sub] = await db.select()
        .from(webhookSubscriptionsTable)
        .where(and(
          eq(webhookSubscriptionsTable.subscriptionId, notif.subscriptionId ?? ""),
          eq(webhookSubscriptionsTable.active, true),
        ))
        .limit(1);
      if (!sub) continue;

      const token = await getGraphToken(mailbox);
      if (!token) continue;

      const response = await fetch(`${GRAPH_API}/users/${encodeURIComponent(mailbox)}/messages/${messageId}?$select=id,subject,from,bodyPreview,receivedDateTime`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;

      const msg = await response.json() as Record<string, unknown>;
      const sender = (msg.from as Record<string, Record<string, string>> | null)?.emailAddress?.address ?? "";
      const subject = (msg.subject as string) ?? "";
      const body = (msg.bodyPreview as string) ?? "";
      const received = (msg.receivedDateTime as string) ?? new Date().toISOString();

      const sample: DryRunInput = { sender, recipient: mailbox, subject, body, attachment: "" };

      for (const alert of alerts) {
        if (alert.mailbox !== "All controlled mailboxes" && alert.mailbox !== mailbox) continue;

        const rule: AlertRule = {
          keywords: alert.keywords,
          mode: alert.mode as "exact" | "phrase" | "contains" | "regex",
          caseSensitive: alert.caseSensitive,
          senderPattern: alert.senderPattern,
          recipientPattern: alert.recipientPattern,
          subjectPattern: alert.subjectPattern,
          bodyPattern: alert.bodyPattern,
          attachmentPattern: alert.attachmentPattern,
        };
        const result = evaluateDryRun(rule, sample);

        if (result.matched) {
          if (alert.lastMatch && alert.cooldown > 0) {
            const elapsed = Date.now() - new Date(alert.lastMatch).getTime();
            if (elapsed < alert.cooldown * 60 * 1000) continue;
          }

          await db.insert(alertEventsTable).values({
            alertId: alert.id,
            alertName: alert.name,
            subject: subject.slice(0, 200),
            sender: sender.slice(0, 200),
            mailbox: mailbox.slice(0, 200),
            matched: result.explanation.slice(0, 200),
            timestamp: new Date(received),
            channel: "in-app",
          });
          await db.execute(
            // Using raw SQL since the db utility doesn't expose sql template
            (await import("drizzle-orm")).sql`UPDATE keyword_alerts SET match_count = match_count + 1, last_match = NOW() WHERE id = ${alert.id}`
          );
          logger.info({ alertName: alert.name, mailbox, subject: subject.slice(0, 80) }, "Webhook keyword alert matched");
        }
      }
    } catch (err) {
      logger.error({ err, subscriptionId: notif.subscriptionId }, "Failed to process webhook notification");
    }
  }
}