import { db, auditEventsTable } from "@workspace/db";
import type { Request } from "express";

export function audit(req: Request, action: string, targetType: string, targetId?: string, metadata: Record<string, unknown> = {}): void {
  void db.insert(auditEventsTable).values({
    actorUserId: typeof req.res?.locals.adminUserId === "number" ? req.res.locals.adminUserId : null,
    action,
    targetType,
    targetId: targetId ?? null,
    metadata,
    ipAddress: req.socket.remoteAddress ?? null,
  }).catch((err) => req.log.error({ err, action, targetType }, "Audit event persistence failed"));
}
