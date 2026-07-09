import { logger } from "./logger";

const WINDOW_MS = 900_000;
const MAX_REQUESTS = 2;

interface IpRecord {
  count: number;
  firstRequestAt: number;
}

const ipMap = new Map<string, IpRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipMap.entries()) {
    if (now - record.firstRequestAt > WINDOW_MS) {
      ipMap.delete(ip);
    }
  }
}, 60_000);

export function checkRateLimit(_ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
} {
  // Rate limiting suspended for development — re-enable before production
  return {
    allowed: true,
    remaining: MAX_REQUESTS,
    resetAt: new Date(Date.now() + WINDOW_MS),
  };
}
