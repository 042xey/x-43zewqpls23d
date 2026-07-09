import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import * as net from "net";
import { db } from "@workspace/db";
import { proxyUrlsTable } from "@workspace/db";
import { adminAuth } from "../middleware/adminAuth";
import { z } from "zod/v4";

const router: IRouter = Router();

const ProxyListBody = z.object({
  proxies: z.array(
    z.object({
      url: z
        .string()
        .url()
        .refine((u: string) => u.startsWith("http"), {
          message: "Proxy URL must start with http",
        }),
    }),
  ),
});

router.get("/proxies", adminAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(proxyUrlsTable);
  res.json({
    count: rows.length,
    proxies: rows.map((r) => ({
      id: r.id,
      url: r.url,
      added_at: r.addedAt.toISOString(),
    })),
  });
});

router.post("/proxies", adminAuth, async (req, res): Promise<void> => {
  const parsed = ProxyListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid proxy list", details: parsed.error.message });
    return;
  }

  await db.delete(proxyUrlsTable);

  if (parsed.data.proxies.length > 0) {
    await db.insert(proxyUrlsTable).values(
      parsed.data.proxies.map((p) => ({ url: p.url })),
    );
  }

  req.log.info({ count: parsed.data.proxies.length }, "Proxy list replaced");
  res.json({ message: `${parsed.data.proxies.length} proxies configured`, count: parsed.data.proxies.length });
});

router.post("/proxies/add", adminAuth, async (req, res): Promise<void> => {
  const body = z.object({ url: z.string().url() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }
  const url = body.data.url;
  if (!url.startsWith("http")) {
    res.status(400).json({ error: "Proxy URL must start with http" });
    return;
  }
  const [inserted] = await db.insert(proxyUrlsTable).values({ url }).returning();
  req.log.info({ url }, "Proxy added");
  res.json({ id: inserted!.id, url: inserted!.url, added_at: inserted!.addedAt.toISOString() });
});

router.delete("/proxies/:id", adminAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const deleted = await db.delete(proxyUrlsTable).where(eq(proxyUrlsTable.id, id)).returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Proxy not found" });
    return;
  }
  req.log.info({ id }, "Proxy deleted");
  res.json({ deleted: true });
});

function tcpTest(host: string, port: number, timeoutMs = 5000): Promise<{ ok: boolean; latencyMs: number | null }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    const done = (ok: boolean) => {
      sock.destroy();
      resolve({ ok, latencyMs: ok ? Date.now() - start : null });
    };
    sock.setTimeout(timeoutMs);
    sock.connect(port, host, () => done(true));
    sock.on("error", () => done(false));
    sock.on("timeout", () => done(false));
  });
}

router.post("/proxies/test", adminAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(proxyUrlsTable);

  const results = await Promise.all(
    rows.map(async (r) => {
      try {
        const parsed = new URL(r.url);
        const host = parsed.hostname;
        const port = parseInt(parsed.port) || (parsed.protocol === "https:" ? 443 : 80);
        const { ok, latencyMs } = await tcpTest(host, port);
        return { id: r.id, url: r.url, reachable: ok, latency_ms: latencyMs };
      } catch {
        return { id: r.id, url: r.url, reachable: false, latency_ms: null };
      }
    }),
  );

  res.json({ results });
});

export default router;
