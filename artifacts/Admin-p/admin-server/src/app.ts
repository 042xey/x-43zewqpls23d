import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { recordHttpRequest } from "./lib/metrics";

const app: Express = express();

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

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
const allowedOrigins = new Set(
  (process.env["ADMIN_UI_ORIGIN"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.has(origin));
    },
  }),
);
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.once("finish", () => recordHttpRequest(res.statusCode, Date.now() - startedAt));
  next();
});
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));
app.use((req, res, next) => {
  const input = JSON.stringify({ body: req.body, query: req.query, params: req.params });
  if (input.length > 64 * 1024 || /"[^"\\]{4097}/.test(input)) {
    res.status(413).json({ error: "Request input is too large." });
    return;
  }
  next();
});

app.use("/api", router);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(__dirname, "../../admin-ui/dist/public");

app.use("/admin-panel", express.static(uiDir));

app.get("/admin-panel/{*path}", (_req, res) => {
  res.sendFile(path.join(uiDir, "index.html"));
});

app.get("/", (_req, res) => {
  res.redirect(301, "/admin-panel/");
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
