import { eq, sql } from "drizzle-orm";
import { db, keywordAlertsTable, alertEventsTable, activeAccessTokensTable } from "@workspace/db";
import { evaluateDryRun, type AlertRule, type DryRunInput } from "./keywordAlertEngine";
import { setupSubscriptionsForAllMailboxes as setupGraphSubscriptions, renewExpiringSubscriptions } from "./webhookManager";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const SUBSCRIPTION_INTERVAL_MS = 15 * 60 * 1000;
const MAX_CHECK_PER_RULE = 50;
const ALERT_ORIGIN = process.env.ALERT_CHECK_API_ORIGIN ?? process.env.KHDYXAIL_API_ORIGIN ?? "http://127.0.0.1:8080";
const KEYWORD_CHECK_URL = `${ALERT_ORIGIN}/api/email/keyword-check`;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "";

interface KeywordMatch {
  id: string;
  subject?: string;
  sender?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
  matchedKeywords?: string[];
}

export async function pollMailboxes(): Promise<void> {
  const startTime = Date.now();
  logger.info("Starting keyword mailbox poll via Khdyxail API");

  try {
    const alerts = await db.select()
      .from(keywordAlertsTable)
      .where(eq(keywordAlertsTable.enabled, true));

    if (alerts.length === 0) {
      logger.info("No enabled alerts to check");
      return;
    }

    const mailboxes = await db.select({ user: activeAccessTokensTable.user })
      .from(activeAccessTokensTable)
      .where(eq(activeAccessTokensTable.resource, "https://graph.microsoft.com"));
    const uniqueMailboxes = [...new Set(mailboxes.map((r) => r.user).filter(Boolean))];
    logger.info({ mailboxCount: uniqueMailboxes.length, alertCount: alerts.length }, "Starting poll");

    let totalMatches = 0;
    let totalChecked = 0;

    for (const alert of alerts) {
      const targets = alert.mailbox === "All controlled mailboxes" ? uniqueMailboxes : [alert.mailbox];

      for (const mailbox of targets) {
        const response = await fetch(KEYWORD_CHECK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-api-secret": INTERNAL_API_SECRET },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            keywords: alert.keywords,
            mailboxEmail: mailbox,
            folder: alert.folder.toLowerCase(),
            since: alert.lastMatch ? new Date(alert.lastMatch).toISOString() : undefined,
            maxMessages: MAX_CHECK_PER_RULE,
          }),
        });

        if (!response.ok) {
          logger.warn({ alertName: alert.name, mailbox, status: response.status }, "Keyword check failed");
          continue;
        }

        const result = await response.json() as { matches: KeywordMatch[]; checkedCount: number };
        totalChecked += result.checkedCount;

        for (const match of result.matches) {
          const sender = match.sender ?? "";
          const subject = match.subject ?? "";
          const body = match.bodyPreview ?? "";
          const sample: DryRunInput = { sender, recipient: mailbox, subject, body, attachment: "" };
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
          const evalResult = evaluateDryRun(rule, sample);

          if (evalResult.matched) {
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
              matched: evalResult.explanation.slice(0, 200),
              timestamp: new Date(match.receivedDateTime ?? new Date()),
              channel: "in-app",
            });
            await db.execute(sql`UPDATE keyword_alerts SET match_count = match_count + 1, last_match = NOW() WHERE id = ${alert.id}`);
            totalMatches++;
            logger.info({ alertName: alert.name, mailbox, subject: subject.slice(0, 80) }, "Keyword alert matched");
          }
        }
      }
    }

    logger.info({ durationMs: Date.now() - startTime, checkedCount: totalChecked, matches: totalMatches }, "Poll complete");
  } catch (err) {
    logger.error({ err }, "Keyword poll failed");
  }
}

export function startAlertPollScheduler(): () => void {
  // Initial setup
  void pollMailboxes().catch(() => undefined);
  void setupGraphSubscriptions().catch(() => undefined);

  // Periodic poll
  const pollTimer = setInterval(() => { void pollMailboxes().catch(() => undefined); }, POLL_INTERVAL_MS);
  pollTimer.unref();

  // Subscription renewal (every 15 minutes)
  const subTimer = setInterval(() => {
    void renewExpiringSubscriptions().catch(() => undefined);
  }, SUBSCRIPTION_INTERVAL_MS);
  subTimer.unref();

  return () => { clearInterval(pollTimer); clearInterval(subTimer); };
}