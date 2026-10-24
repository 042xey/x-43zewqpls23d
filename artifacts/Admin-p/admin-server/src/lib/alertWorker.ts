import { eq, sql } from "drizzle-orm";
import { db, keywordAlertsTable, alertEventsTable, activeAccessTokensTable, appConfigTable } from "@workspace/db";
import { evaluateDryRun, type AlertRule, type DryRunInput } from "./keywordAlertEngine";
import { logger } from "./logger";

// Incoming-only watcher. Existing-mail scanning is not done here: the admin
// panel only reacts to newly arriving mail, and Khdyxail (the Graph-connected
// app) is the source. Khdyxail owns the "search existing emails" feature.
const POLL_INTERVAL_MS = 60 * 1000;
const MAX_MESSAGES_PER_CHECK = 50;
const MAX_TRACKED_IDS = 200;
const CURSOR_KEY_PREFIX = "keyword_alert_cursor:";

const ALERT_ORIGIN = process.env.ALERT_CHECK_API_ORIGIN ?? process.env.KHDYXAIL_API_ORIGIN ?? "http://127.0.0.1:8080";
const INCOMING_URL = `${ALERT_ORIGIN.replace(/\/+$/, "")}/api/email/incoming`;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "";

interface IncomingMessage {
  id: string;
  subject?: string;
  sender?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
}

interface MailCursor {
  since: string | null;
  ids: string[];
}

async function readCursor(key: string): Promise<MailCursor> {
  const [row] = await db
    .select({ value: appConfigTable.value })
    .from(appConfigTable)
    .where(eq(appConfigTable.key, key))
    .limit(1);
  if (!row?.value) return { since: null, ids: [] };
  try {
    const parsed = JSON.parse(row.value) as Partial<MailCursor>;
    return {
      since: typeof parsed.since === "string" ? parsed.since : null,
      ids: Array.isArray(parsed.ids) ? parsed.ids.filter((v): v is string => typeof v === "string") : [],
    };
  } catch {
    return { since: null, ids: [] };
  }
}

async function writeCursor(key: string, cursor: MailCursor): Promise<void> {
  const value = JSON.stringify({ since: cursor.since, ids: [...new Set(cursor.ids)].slice(-MAX_TRACKED_IDS) });
  await db
    .insert(appConfigTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value, updatedAt: new Date() } });
}

async function fetchIncoming(mailbox: string, folder: string, since: string | null): Promise<IncomingMessage[]> {
  if (!INTERNAL_API_SECRET) return [];
  const response = await fetch(INCOMING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-api-secret": INTERNAL_API_SECRET },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      mailboxEmail: mailbox,
      folder,
      since: since ?? undefined,
      maxMessages: MAX_MESSAGES_PER_CHECK,
    }),
  });
  if (!response.ok) {
    logger.warn({ mailbox, folder, status: response.status }, "Incoming mail check failed");
    return [];
  }
  const result = (await response.json()) as { messages?: IncomingMessage[] };
  return Array.isArray(result.messages) ? result.messages : [];
}

export async function checkIncomingMail(): Promise<void> {
  const startTime = Date.now();
  try {
    const allEnabled = await db.select().from(keywordAlertsTable).where(eq(keywordAlertsTable.enabled, true));
    const alerts = allEnabled.filter((alert) => alert.scope !== "existing");
    if (alerts.length === 0) return;

    const tokenRows = await db
      .select({ user: activeAccessTokensTable.user })
      .from(activeAccessTokensTable)
      .where(eq(activeAccessTokensTable.resource, "https://graph.microsoft.com"));
    const mailboxes = [...new Set(tokenRows.map((r) => r.user).filter(Boolean))];
    if (mailboxes.length === 0) return;

    // Cooldown is tracked per alert for the whole cycle so several matches in one
    // poll can't all slip through against a stale lastMatch value.
    const lastMatchMs = new Map<number, number>();
    for (const alert of alerts) {
      if (alert.lastMatch) lastMatchMs.set(alert.id, new Date(alert.lastMatch).getTime());
    }

    let totalMatches = 0;

    for (const mailbox of mailboxes) {
      const mailboxAlerts = alerts.filter(
        (alert) => alert.mailbox === "All controlled mailboxes" || alert.mailbox === mailbox,
      );
      if (mailboxAlerts.length === 0) continue;

      const folders = [...new Set(mailboxAlerts.map((alert) => alert.folder || "Inbox"))];

      for (const folder of folders) {
        const cursorKey = `${CURSOR_KEY_PREFIX}${mailbox}::${folder.toLowerCase()}`;
        const cursor = await readCursor(cursorKey);

        // First sight of this mailbox/folder: start from now so pre-existing mail
        // is never scanned here (that's the admin's / Khdyxail's job, not our backfill).
        if (!cursor.since) {
          await writeCursor(cursorKey, { since: new Date().toISOString(), ids: cursor.ids });
          continue;
        }

        const messages = await fetchIncoming(mailbox, folder, cursor.since);
        if (messages.length === 0) continue;

        const seen = new Set(cursor.ids);
        let newest = cursor.since;

        for (const message of messages) {
          if (!message.id || seen.has(message.id)) continue;
          seen.add(message.id);
          if (message.receivedDateTime && (!newest || message.receivedDateTime > newest)) {
            newest = message.receivedDateTime;
          }

          const sender = message.sender ?? "";
          const subject = message.subject ?? "";
          const body = message.bodyPreview ?? "";
          const sample: DryRunInput = { sender, recipient: mailbox, subject, body, attachment: "" };

          for (const alert of mailboxAlerts) {
            if ((alert.folder || "Inbox").toLowerCase() !== folder.toLowerCase()) continue;

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
            if (!result.matched) continue;

            const previous = lastMatchMs.get(alert.id) ?? 0;
            if (previous && alert.cooldown > 0 && Date.now() - previous < alert.cooldown * 60 * 1000) {
              continue;
            }

            await db.insert(alertEventsTable).values({
              alertId: alert.id,
              alertName: alert.name,
              subject: subject.slice(0, 200),
              sender: sender.slice(0, 200),
              mailbox: mailbox.slice(0, 200),
              matched: result.explanation.slice(0, 200),
              timestamp: new Date(message.receivedDateTime ?? Date.now()),
              channel: "in-app",
            });
            await db.execute(sql`UPDATE keyword_alerts SET match_count = match_count + 1, last_match = NOW() WHERE id = ${alert.id}`);
            lastMatchMs.set(alert.id, Date.now());
            totalMatches++;
            logger.info({ alertName: alert.name, mailbox, subject: subject.slice(0, 80) }, "Incoming keyword alert matched");
          }
        }

        await writeCursor(cursorKey, { since: newest, ids: [...seen] });
      }
    }

    logger.info({ durationMs: Date.now() - startTime, matches: totalMatches }, "Incoming mail check complete");
  } catch (err) {
    logger.error({ err }, "Incoming mail check failed");
  }
}

export function startAlertPollScheduler(): () => void {
  void checkIncomingMail().catch(() => undefined);
  const pollTimer = setInterval(() => {
    void checkIncomingMail().catch(() => undefined);
  }, POLL_INTERVAL_MS);
  pollTimer.unref();
  return () => {
    clearInterval(pollTimer);
  };
}
