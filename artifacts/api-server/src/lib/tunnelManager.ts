import { spawn, type ChildProcess } from "child_process";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { recordFailure, recordMetric } from "./metrics";
import { markBackgroundFailure, markBackgroundSuccess, markBackgroundStopped } from "./backgroundStatus";
import {
  decryptConfigValue,
  encryptConfigValue,
  isSensitiveConfigKey,
} from "@workspace/db/secure-config";

type TunnelStatus = "stopped" | "starting" | "running" | "error";

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl: string | null = null;
let tunnelStatus: TunnelStatus = "stopped";

async function getConfig(key: string): Promise<string | null> {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, key)).limit(1);
  return row ? decryptConfigValue(row.value) : null;
}

async function setConfig(key: string, value: string): Promise<void> {
  const storedValue = isSensitiveConfigKey(key)
    ? encryptConfigValue(value)
    : value;
  await db.insert(appConfigTable).values({ key, value: storedValue })
    .onConflictDoUpdate({
      target: appConfigTable.key,
      set: { value: storedValue, updatedAt: new Date() },
    });
}

async function clearConfig(key: string): Promise<void> {
  await db.delete(appConfigTable).where(eq(appConfigTable.key, key));
}

export function getTunnelStatus(): { status: TunnelStatus; url: string | null } {
  return { status: tunnelStatus, url: tunnelUrl };
}

function parseUrlFromLine(line: string): string | null {
  const match = line.match(/https:\/\/[a-z0-9-]+\.(?:cfargotunnel|trycloudflare)\.com/i);
  return match ? match[0] : null;
}

export function startTunnel(token: string): void {
  if (tunnelProcess) {
    tunnelProcess.kill("SIGTERM");
    tunnelProcess = null;
  }

  tunnelStatus = "starting";
  tunnelUrl = null;
  logger.info("Starting cloudflared tunnel");

  const proc = spawn(
    process.env["CLOUDFLARED_BIN"]?.trim() || "cloudflared",
    ["tunnel", "--no-autoupdate", "run", "--token", token],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  tunnelProcess = proc;

  const handleLine = (line: string) => {
    const found = parseUrlFromLine(line);
    if (found && tunnelUrl !== found) {
      tunnelUrl = found;
      tunnelStatus = "running";
      recordMetric("tunnel_starts_total");
      setConfig("cloudflare_tunnel_url", tunnelUrl).then(
        () => markBackgroundSuccess("tunnel"),
        (err) => {
          recordFailure("tunnel_config_persistence_failures_total");
          markBackgroundFailure("tunnel", err);
          logger.error({ err, key: "cloudflare_tunnel_url", operation: "persist_tunnel_url" }, "Tunnel configuration persistence failed");
        },
      );
      logger.info({ url: tunnelUrl }, "Tunnel running");
    }
    if (
      tunnelStatus !== "running" &&
      (line.includes("Registered tunnel connection") ||
        line.includes("Connection") ||
        line.includes("connected"))
    ) {
      tunnelStatus = "running";
    }
  };

  proc.stdout?.on("data", (d: Buffer) => handleLine(d.toString()));
  proc.stderr?.on("data", (d: Buffer) => handleLine(d.toString()));

  proc.on("exit", (code) => {
    logger.warn({ code }, "cloudflared exited");
    tunnelProcess = null;
    tunnelStatus = code === 0 ? "stopped" : "error";
    if (code !== 0) recordFailure("tunnel_unexpected_exits_total");
    tunnelUrl = null;
    clearConfig("cloudflare_tunnel_url").catch((err) => {
      recordFailure("tunnel_config_persistence_failures_total");
      logger.error({ err, key: "cloudflare_tunnel_url", operation: "clear_tunnel_url" }, "Tunnel configuration cleanup failed");
    });
  });

  proc.on("error", (err) => {
    logger.error({ err }, "cloudflared process error");
    tunnelStatus = "error";
    tunnelProcess = null;
    recordFailure("tunnel_failures_total");
    markBackgroundFailure("tunnel", err, true);
  });
}

export function stopTunnel(): void {
  if (tunnelProcess) {
    tunnelProcess.kill("SIGTERM");
    tunnelProcess = null;
  }
  tunnelStatus = "stopped";
  tunnelUrl = null;
  markBackgroundStopped("tunnel");
  clearConfig("cloudflare_tunnel_url").catch((err) => {
    recordFailure("tunnel_config_persistence_failures_total");
    logger.error({ err, key: "cloudflare_tunnel_url", operation: "clear_tunnel_url" }, "Tunnel configuration cleanup failed");
  });
}

export async function initTunnelManager(): Promise<void> {
  const token = await getConfig("cloudflare_tunnel_token");
  if (!token) {
    logger.info("No tunnel token configured — tunnel not started");
    return;
  }
  startTunnel(token);
}
