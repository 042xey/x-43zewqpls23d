import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  base: {
    service: process.env["SERVICE_NAME"] ?? "api-server",
    environment: process.env.NODE_ENV ?? "development",
  },
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
