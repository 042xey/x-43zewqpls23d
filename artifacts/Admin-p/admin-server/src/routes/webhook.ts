import { Router, type IRouter } from "express";
import { db, webhookSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth";
import { audit } from "../lib/audit";
import { processNotification, setupSubscriptionsForAllMailboxes, renewExpiringSubscriptions, renewSubscription, createSubscription } from "../lib/webhookManager";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Microsoft Graph validation endpoint — responds to GET with verification token
router.get("/webhook/notifications", async (req, res): Promise<void> => {
  const validationToken = Array.isArray(req.query.validationToken) ? req.query.validationToken[0] : (req.query.validationToken as string | undefined);
  if (validationToken) {
    res.type("text/plain").send(validationToken);
    return;
  }
  res.status(400).json({ error: "Missing validation token" });
});

// Microsoft Graph notification callback
router.post("/webhook/notifications", async (req, res): Promise<void> => {
  try {
    const body = req.body as { value?: Array<{ subscriptionId?: string; clientState?: string; resource?: string; changeType?: string }> };
    const notifications = body.value ?? [];
    if (notifications.length === 0) {
      res.status(202).json({ ok: true });
      return;
    }
    res.status(202).json({ ok: true });
    // Process asynchronously — respond 202 first to avoid timeout
    processNotification(notifications).catch((err) => logger.error({ err }, "Async notification processing failed"));
  } catch (err) {
    logger.error({ err }, "Failed to parse webhook notification");
    res.status(202).json({ ok: true });
  }
});

// Admin: list subscriptions
router.get("/webhook/subscriptions", adminAuth, async (_req, res): Promise<void> => {
  try {
    const subs = await db.select().from(webhookSubscriptionsTable).where(eq(webhookSubscriptionsTable.active, true));
    res.json(subs.map((s) => ({
      id: s.subscriptionId,
      mailbox: s.mailbox,
      expiresAt: s.expirationDateTime.toISOString(),
      active: s.active,
      lastRenewedAt: s.lastRenewedAt?.toISOString() ?? null,
    })));
  } catch (err) {
    logger.error({ err }, "Failed to list subscriptions");
    res.status(500).json({ error: "Failed to list subscriptions." });
  }
});

// Admin: create subscriptions for all mailboxes
router.post("/webhook/subscriptions/setup", adminAuth, async (req, res): Promise<void> => {
  try {
    await setupSubscriptionsForAllMailboxes();
    audit(req, "webhook_subscriptions_setup", "webhook", undefined, {});
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to setup subscriptions");
    res.status(500).json({ error: "Failed to setup subscriptions." });
  }
});

// Admin: renew all expiring subscriptions
router.post("/webhook/subscriptions/renew", adminAuth, async (req, res): Promise<void> => {
  try {
    await renewExpiringSubscriptions();
    audit(req, "webhook_subscriptions_renewed", "webhook", undefined, {});
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to renew subscriptions");
    res.status(500).json({ error: "Failed to renew subscriptions." });
  }
});

// Admin: delete subscription
router.delete("/webhook/subscriptions/:id", adminAuth, async (req, res): Promise<void> => {
  try {
    const subId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [sub] = await db.select().from(webhookSubscriptionsTable).where(eq(webhookSubscriptionsTable.subscriptionId, subId)).limit(1);
    if (!sub) { res.status(404).json({ error: "Subscription not found." }); return; }

    await db.update(webhookSubscriptionsTable).set({ active: false }).where(eq(webhookSubscriptionsTable.subscriptionId, subId));
    audit(req, "webhook_subscription_deleted", "webhook", subId, { mailbox: sub.mailbox });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete subscription");
    res.status(500).json({ error: "Failed to delete subscription." });
  }
});

export default router;