import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();
const CONFIG_KEY = "active_template";
export const DEFAULT_TEMPLATE = "devdoc-sign";

router.get("/template", async (_req, res): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(appConfigTable)
      .where(eq(appConfigTable.key, CONFIG_KEY));
    res.json({ template: row?.value ?? DEFAULT_TEMPLATE });
  } catch {
    res.json({ template: DEFAULT_TEMPLATE });
  }
});

export default router;
