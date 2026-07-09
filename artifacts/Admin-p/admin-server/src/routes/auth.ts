import { Router } from "express";
import { adminAuth } from "../middleware/adminAuth";
import { isAdminKeyConfigured, setAdminKey } from "../lib/adminKeyManager";

const router = Router();

router.get("/ping", adminAuth, (_req, res) => {
  res.json({ ok: true });
});

router.get("/setup-status", async (_req, res) => {
  try {
    const configured = await isAdminKeyConfigured();
    res.json({ configured });
  } catch {
    res.status(500).json({ error: "Could not check setup status." });
  }
});

router.post("/setup", async (req, res) => {
  try {
    const configured = await isAdminKeyConfigured();
    if (configured) {
      res.status(409).json({ error: "Admin key is already configured. Use your existing key to sign in." });
      return;
    }
    const { key } = req.body as { key?: string };
    if (!key || key.trim().length < 16) {
      res.status(400).json({ error: "Key must be at least 16 characters." });
      return;
    }
    await setAdminKey(key.trim());
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to configure admin key." });
  }
});

export default router;
