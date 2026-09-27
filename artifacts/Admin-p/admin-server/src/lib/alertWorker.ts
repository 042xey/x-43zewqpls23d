import { eq } from "drizzle-orm";
import { db, keywordAlertsTable, alertEventsTable } from "@workspace/db";
import { evaluateDryRun, type AlertRule, type DryRunInput } from "./keywordAlertEngine";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CHECK_PER_RULE = 50;
const KEYWORD_CHECK_URL = `${process.env.KHDYXAIL_API_ORIGIN ?? "http://127.0.0.1:8080"}/api/email/keyword-check`;
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

    let totalMatches = 0;
    let totalChecked = 0;

    for (const alert of alerts) {
      const response = await fetch(KEYWORD_CHECK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-api-secret": INTERNAL_API_SECRET,
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          keywords: alert.keywords,
          mailboxEmail: alert.mailbox !== "All controlled mailboxes" ? alert.mailbox : undefined,
          folder: alert.folder.toLowerCase(),
          since: alert.lastMatch ? new Date(alert.lastMatch).toISOString() : undefined,
          maxMessages: MAX_CHECK_PER_RULE,
        }),
      });

      if (!response.ok) {
        logger.warn({ alertName: alert.name, status: response.status }, "Keyword check request failed");
        continue;
      }

      const result = await response.json() as { matches: KeywordMatch[]; checkedCount: number; checkTimestamp: string };
      totalChecked += result.checkedCount;

      for (const match of result.matches) {
        const sender = match.sender ?? "";
        const subject = match.subject ?? "";
        const body = match.bodyPreview ?? "";

        const sample: DryRunInput = { sender, recipient: alert.mailbox, subject, body, attachment: "" };
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
            mailbox: alert.mailbox.slice(0, 200),
            matched: evalResult.explanation.slice(0, 200),
            timestamp: new Date(match.receivedDateTime ?? new Date()),
            channel: "in-app",
          });
          await db.update(keywordAlertsTable).set({
            matchCount: alert.matchCount + 1,
            lastMatch: new Date(),
          }).where(eq(keywordAlertsTable.id, alert.id));

          totalMatches++;
          logger.info({ alertName: alert.name, mailbox: alert.mailbox, subject: subject.slice(0, 80) }, "Keyword alert matched");
        }
      }
    }

    logger.info({
      durationMs: Date.now() - startTime,
      alerts: alerts.length,
      checkedCount: totalChecked,
      matches: totalMatches,
    }, "Keyword poll complete");
  } catch (err) {
    logger.error({ err }, "Keyword poll failed");
  }
}

export function startAlertPollScheduler(): () => void {
  const timer = setInterval(() => { void pollMailboxes().catch(() => undefined); }, POLL_INTERVAL_MS);
  timer.unref();
  void pollMailboxes().catch(() => undefined);
  return () => clearInterval(timer);
}
