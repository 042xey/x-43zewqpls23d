import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { adminAuth } from "../middleware/adminAuth";

const router: IRouter = Router();

const CONFIG_KEYS = {
  webmail: "external_webmail_url",
  svgGenerator: "external_svg_generator_url",
} as const;

const UrlValue = z
  .union([z.string().url(), z.literal("")])
  .refine((value) => value === "" || /^https?:\/\//i.test(value), {
    message: "URL must start with http:// or https://",
  });

const ExternalAppsBody = z.object({
  webmail_url: UrlValue,
  svg_generator_url: UrlValue,
});

const StandaloneAppBody = z.object({
  url: UrlValue,
});

async function getConfig(key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, key))
    .limit(1);

  return row?.value ?? "";
}

async function saveConfig(key: string, value: string): Promise<void> {
  if (!value) {
    await db.delete(appConfigTable).where(eq(appConfigTable.key, key));
    return;
  }

  await db
    .insert(appConfigTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appConfigTable.key,
      set: { value, updatedAt: new Date() },
    });
}

function getStandaloneConfigKey(
  app: string,
): keyof typeof CONFIG_KEYS | null {
  if (app === "webmail") return "webmail";
  if (app === "svg-generator") return "svgGenerator";
  return null;
}

function getSingleRouteParam(param: string | string[]): string {
  return Array.isArray(param) ? param[0] ?? "" : param;
}

router.get("/external-apps", adminAuth, async (_req, res): Promise<void> => {
  try {
    const [webmailUrl, svgGeneratorUrl] = await Promise.all([
      getConfig(CONFIG_KEYS.webmail),
      getConfig(CONFIG_KEYS.svgGenerator),
    ]);

    res.json({
      webmail_url: webmailUrl,
      svg_generator_url: svgGeneratorUrl,
    });
  } catch {
    res.status(500).json({ error: "Failed to load external app settings." });
  }
});

router.post("/external-apps", adminAuth, async (req, res): Promise<void> => {
  const parsed = ExternalAppsBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Enter valid http:// or https:// URLs.",
      details: parsed.error.message,
    });
    return;
  }

  try {
    await Promise.all([
      saveConfig(CONFIG_KEYS.webmail, parsed.data.webmail_url),
      saveConfig(CONFIG_KEYS.svgGenerator, parsed.data.svg_generator_url),
    ]);

    req.log.info("External app destinations updated");
    res.json({
      ok: true,
      webmail_url: parsed.data.webmail_url,
      svg_generator_url: parsed.data.svg_generator_url,
    });
  } catch {
    res.status(500).json({ error: "Failed to save external app settings." });
  }
});

// Standalone endpoints used by each Settings panel. Keeping these separate
// prevents saving one app from overwriting the other app's URL.
router.get(
  "/external-apps/:app",
  adminAuth,
  async (req, res): Promise<void> => {
    const appParam = getSingleRouteParam(req.params.app);
    const app = getStandaloneConfigKey(appParam);

    if (!app) {
      res.status(404).json({ error: "Unknown external app." });
      return;
    }

    try {
      res.json({
        app: appParam,
        url: await getConfig(CONFIG_KEYS[app]),
      });
    } catch {
      res.status(500).json({
        error: "Failed to load external app setting.",
      });
    }
  },
);

router.post(
  "/external-apps/:app",
  adminAuth,
  async (req, res): Promise<void> => {
    const appParam = getSingleRouteParam(req.params.app);
    const app = getStandaloneConfigKey(appParam);

    if (!app) {
      res.status(404).json({ error: "Unknown external app." });
      return;
    }

    const parsed = StandaloneAppBody.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Enter a valid http:// or https:// URL.",
        details: parsed.error.message,
      });
      return;
    }

    try {
      await saveConfig(CONFIG_KEYS[app], parsed.data.url);
      req.log.info({ app: appParam }, "External app setting updated");
      res.json({
        ok: true,
        app: appParam,
        url: parsed.data.url,
      });
    } catch {
      res.status(500).json({
        error: "Failed to save external app setting.",
      });
    }
  },
);

export default router;