import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth";
import { z } from "zod/v4";

const router: IRouter = Router();
const CONFIG_KEY = "active_template";
const DEFAULT_TEMPLATE = "devdoc-sign";

export const VALID_TEMPLATES = [
  "devdoc-sign",
  "adobe-sign",
  "docusign",
  "office365",
  "teams",
] as const;

export type TemplateId = (typeof VALID_TEMPLATES)[number];

router.get("/template", adminAuth, async (_req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, CONFIG_KEY));
  res.json({ template: row?.value ?? DEFAULT_TEMPLATE });
});

const SetTemplateBody = z.object({
  template: z.enum(VALID_TEMPLATES),
});

router.post("/template", adminAuth, async (req, res): Promise<void> => {
  const parsed = SetTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid template",
      details: parsed.error.message,
    });
    return;
  }

  const { template } = parsed.data;

  await db
    .insert(appConfigTable)
    .values({ key: CONFIG_KEY, value: template })
    .onConflictDoUpdate({
      target: appConfigTable.key,
      set: { value: template, updatedAt: new Date() },
    });

  req.log.info({ template }, "Active template updated");
  res.json({ template });
});

export default router;
