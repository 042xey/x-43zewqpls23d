import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth";
import { CLIENT_ALIAS_MAP } from "../lib/clientAliases";
import { z } from "zod/v4";

const router: IRouter = Router();

const CONFIG_KEY = "active_alias";

router.get("/aliases", adminAuth, (_req, res): void => {
  const aliases = Object.entries(CLIENT_ALIAS_MAP).map(
    ([alias, { id, name, resource }]) => ({
      alias,
      name,
      client_id: id,
      resource,
    }),
  );
  res.json({ aliases });
});

router.get("/config", adminAuth, async (_req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, CONFIG_KEY));

  const activeAlias = row?.value ?? null;
  const aliases = Object.entries(CLIENT_ALIAS_MAP).map(
    ([alias, { id, name, resource }]) => ({
      alias,
      name,
      client_id: id,
      resource,
      active: alias === activeAlias,
    }),
  );

  res.json({
    active_alias: activeAlias,
    aliases,
  });
});

const SetConfigBody = z.object({
  active_alias: z.string().refine((a) => a in CLIENT_ALIAS_MAP, {
    message: `Must be one of: ${Object.keys(CLIENT_ALIAS_MAP).join(", ")}`,
  }),
});

router.post("/config", adminAuth, async (req, res): Promise<void> => {
  const parsed = SetConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid config", details: parsed.error.message });
    return;
  }

  const { active_alias } = parsed.data;

  await db
    .insert(appConfigTable)
    .values({ key: CONFIG_KEY, value: active_alias })
    .onConflictDoUpdate({
      target: appConfigTable.key,
      set: { value: active_alias, updatedAt: new Date() },
    });

  req.log.info({ active_alias }, "Active alias updated");

  const client = CLIENT_ALIAS_MAP[active_alias]!;
  res.json({
    active_alias,
    name: client.name,
    client_id: client.id,
    resource: client.resource,
  });
});

export default router;
