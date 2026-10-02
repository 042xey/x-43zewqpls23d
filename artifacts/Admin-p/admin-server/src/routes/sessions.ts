import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  activeRefreshTokensTable,
  deviceCodesTable,
} from "@workspace/db";
import { adminAuth } from "../middleware/adminAuth";
import { CLIENT_ALIAS_MAP } from "../lib/clientAliases";
import { buildSessionAudit } from "../lib/sessions";

const router: IRouter = Router();

router.get("/sessions", adminAuth, async (_req, res): Promise<void> => {
  const [deviceRows, refreshRows] = await Promise.all([
    db
      .select()
      .from(deviceCodesTable)
      .orderBy(desc(deviceCodesTable.generatedAt)),
    db.select().from(activeRefreshTokensTable),
  ]);

  const sessions = buildSessionAudit(deviceRows, refreshRows, new Date());

  const aliases = Object.entries(CLIENT_ALIAS_MAP).map(([alias, info]) => ({
    alias,
    name: info.name,
  }));

  res.json({ sessions, aliases });
});

export default router;
