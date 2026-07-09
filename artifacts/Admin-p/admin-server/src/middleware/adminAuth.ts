import { type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";
import { getAdminKey } from "../lib/adminKeyManager";

export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const adminKey = await getAdminKey();

  if (!adminKey) {
    res.status(503).json({ error: "Admin access is not configured.", setup_required: true });
    return;
  }

  const provided = req.headers["x-admin-key"];

  if (!provided || provided !== adminKey) {
    logger.warn({ ip: req.socket.remoteAddress }, "Unauthorized admin access attempt");
    res.status(401).json({ error: "Unauthorized. Provide a valid X-Admin-Key header." });
    return;
  }

  next();
}
