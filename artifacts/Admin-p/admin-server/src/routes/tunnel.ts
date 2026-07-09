import { Router } from "express";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

async function getConfig(key: string): Promise<string | null> {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, key)).limit(1);
  return row?.value ?? null;
}

router.post("/tunnel/config", adminAuth, async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token?.trim()) {
    res.status(400).json({ error: "Tunnel token is required." });
    return;
  }
  try {
    await db.insert(appConfigTable)
      .values({ key: "cloudflare_tunnel_token", value: token.trim() })
      .onConflictDoUpdate({ target: appConfigTable.key, set: { value: token.trim() } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save tunnel token." });
  }
});

router.get("/tunnel/status", adminAuth, async (_req, res) => {
  try {
    const [configured, url] = await Promise.all([
      getConfig("cloudflare_tunnel_token"),
      getConfig("cloudflare_tunnel_url"),
    ]);
    res.json({ configured: !!configured, url: url ?? null });
  } catch {
    res.status(500).json({ error: "Failed to read tunnel status." });
  }
});

router.delete("/tunnel/config", adminAuth, async (_req, res) => {
  try {
    await Promise.all([
      db.delete(appConfigTable).where(eq(appConfigTable.key, "cloudflare_tunnel_token")),
      db.delete(appConfigTable).where(eq(appConfigTable.key, "cloudflare_tunnel_url")),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove tunnel config." });
  }
});

export default router;
