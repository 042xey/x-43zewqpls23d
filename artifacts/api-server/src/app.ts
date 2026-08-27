import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";
import router from "./routes";
import { logger } from "./lib/logger";
import { recordHttpRequest } from "./lib/metrics";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const requestId = req.headers["x-request-id"];
      const id = typeof requestId === "string" && requestId.trim()
        ? requestId.trim().slice(0, 128)
        : randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.once("finish", () => recordHttpRequest(res.statusCode, Date.now() - startedAt));
  next();
});
const corsOrigins = new Set(
  (process.env["CORS_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      callback(null, !origin || corsOrigins.has(origin));
    },
  }),
);
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

// ─── Admin panel proxy ────────────────────────────────────────────────────────
// Forwards /admin-panel/* and /api/<admin-prefix>/* to the Admin Server so the
// admin panel is reachable through the main API server's origin. The Admin
// Server now runs as its own isolated Railway service, so its origin must be
// supplied via ADMIN_SERVER_URL (e.g. an internal Railway URL like
// http://admin-server.railway.internal:PORT, or a public domain) instead of
// being hardcoded to localhost.

const ADMIN_PREFIX = process.env["ADMIN_ROUTE_PREFIX"];
const ADMIN_ORIGIN = process.env["ADMIN_SERVER_URL"];
const UPSTREAM_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade",
]);

async function proxyToAdmin(req: Request, res: Response): Promise<void> {
  if (!ADMIN_ORIGIN) {
    res.status(502).json({
      error: "Admin Server URL is not configured. Set ADMIN_SERVER_URL.",
    });
    return;
  }

  const target = `${ADMIN_ORIGIN}${req.originalUrl}`;
  const adminHost = new URL(ADMIN_ORIGIN).host;

  const headers: Record<string, string> = { host: adminHost };
  for (const [key, val] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && val !== undefined) {
      headers[key] = Array.isArray(val) ? val.join(", ") : val;
    }
  }

  let body: string | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    body = JSON.stringify(req.body);
    headers["content-type"] = "application/json";
  }

  try {
    const upstream = await fetchWithTimeout(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    for (const [key, value] of upstream.headers.entries()) {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    res.status(upstream.status);
    const buf = await upstream.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch {
    if (!res.headersSent) {
      res.status(502).json({
        error: "Admin Server unavailable. Make sure the Admin Server is running and ADMIN_SERVER_URL is correct.",
      });
    }
  }
}

if (ADMIN_PREFIX) {
  app.use(`/api/${ADMIN_PREFIX}`, proxyToAdmin);
  app.use("/admin-panel", proxyToAdmin);
}

// ─── Main API routes ──────────────────────────────────────────────────────────
app.use("/api", router);

// ─── Frontend static files ────────────────────────────────────────────────────
const frontendDist = path.resolve(__dirname, "../../frontend/dist/public");
app.use(express.static(frontendDist));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  req.log.error({ err }, "Unhandled request error");
  res.status(500).json({ error: "Internal server error." });
});

export default app;
