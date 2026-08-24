import { type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";
import { csrfCookieName, getSessionToken, getSessionUser } from "../lib/auth";

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

  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const cookies = Object.fromEntries((req.headers.cookie ?? "").split(";").filter(Boolean).map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, decodeURIComponent(value.join("="))];
    }));
    if (!cookies[csrfCookieName] || cookies[csrfCookieName] !== req.headers["x-csrf-token"]) {
      res.status(403).json({ error: "CSRF validation failed." });
      return;
    }
  }

  next();
}
