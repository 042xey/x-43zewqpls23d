import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Admin panel proxy ────────────────────────────────────────────────────────
// Forwards /admin-panel/* and /api/<admin-prefix>/* to the Admin Server on
// port 8099 so the admin panel is reachable through the main preview (port 5000).

const ADMIN_PREFIX = process.env["ADMIN_ROUTE_PREFIX"];
const ADMIN_ORIGIN = "http://localhost:8099";

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade",
]);

async function proxyToAdmin(req: Request, res: Response): Promise<void> {
  const target = `${ADMIN_ORIGIN}${req.originalUrl}`;

  const headers: Record<string, string> = { host: "localhost:8099" };
  for (const [key, val] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && val !== undefined) {
      headers[key] = Array.isArray(val) ? val.join(", ") : val;
    }
  }

  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    body = JSON.stringify(req.body);
    headers["content-type"] = "application/json";
  }

  try {
    const upstream = await fetch(target, {
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
        error: "Admin Server unavailable. Make sure the Admin Server workflow is running.",
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

export default app;
