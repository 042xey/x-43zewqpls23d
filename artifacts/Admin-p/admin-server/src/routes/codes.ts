import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { deviceCodesTable } from "@workspace/db";
import { adminAuth } from "../middleware/adminAuth";
import { CLIENT_ALIAS_MAP } from "../lib/clientAliases";

const router: IRouter = Router();

router.get("/code-status/:userCode", adminAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userCode)
    ? req.params.userCode[0]
    : req.params.userCode;

  if (!raw) {
    res.status(400).json({ error: "user_code is required" });
    return;
  }

  const [record] = await db
    .select()
    .from(deviceCodesTable)
    .where(eq(deviceCodesTable.userCode, raw));

  if (!record) {
    res.status(404).json({ error: "Code not found" });
    return;
  }

  const now = new Date();
  let status = record.status;
  if (status === "POLLING" && record.expiresAt <= now) {
    status = "EXPIRED";
    await db
      .update(deviceCodesTable)
      .set({ status: "EXPIRED" })
      .where(eq(deviceCodesTable.userCode, raw));
  }

  const expiresIn = Math.max(
    0,
    Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000),
  );

  const appName =
    CLIENT_ALIAS_MAP[record.clientId]?.name ?? record.clientId;

  res.json({
    user_code: record.userCode,
    status,
    app: appName,
    alias: record.clientId,
    generated_at: record.generatedAt.toISOString(),
    expires_at: record.expiresAt.toISOString(),
    expires_in: expiresIn,
    last_polled_at: record.lastPolledAt?.toISOString() ?? null,
  });
});

export default router;
