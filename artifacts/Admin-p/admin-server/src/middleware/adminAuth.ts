import { type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";
import { csrfCookieName, getSessionToken, getSessionUser, isSensitiveActionLimited } from "../lib/auth";
import { audit } from "../lib/audit";

export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getSessionToken(req.headers.cookie);
  const user = token ? await getSessionUser(token) : null;
  if (!user) {
    logger.warn({ ip: req.socket.remoteAddress }, "Unauthorized admin access attempt");
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  res.locals.adminUserId = user.id;

  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (await isSensitiveActionLimited(`${user.id}:${req.path}`)) {
      res.status(429).json({ error: "Too many administrative actions. Try again later." });
      return;
    }
    const cookies = Object.fromEntries((req.headers.cookie ?? "").split(";").filter(Boolean).map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, decodeURIComponent(value.join("="))];
    }));
    if (!cookies[csrfCookieName] || cookies[csrfCookieName] !== req.headers["x-csrf-token"]) {
      res.status(403).json({ error: "CSRF validation failed." });
      return;
    }
    audit(req, "privileged_admin_action", "route", req.path, { method: req.method });
  }

  next();
}
