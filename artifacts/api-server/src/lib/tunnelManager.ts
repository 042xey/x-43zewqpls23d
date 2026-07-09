import { spawn, type ChildProcess } from "child_process";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

type TunnelStatus = "stopped" | "starting" | "running" | "error";

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl: string | null = null;
let tunnelStatus: TunnelStatus = "stopped";

async function getConfig(key: string): Promise<string | null> {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, key)).limit(1);
  return row?.value ?? null;
}

async function setConfig(key: string, value: string): Promise<void> {
  await db.insert(appConfigTable).values({ key, value })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value } });
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
    "cloudflared",
    ["tunnel", "--no-autoupdate", "run", "--token", token],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  tunnelProcess = proc;

  const handleLine = (line: string) => {
    const found = parseUrlFromLine(line);
    if (found && tunnelUrl !== found) {
      tunnelUrl = found;
      tunnelStatus = "running";
      setConfig("cloudflare_tunnel_url", tunnelUrl).catch(() => {});
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
    tunnelUrl = null;
    clearConfig("cloudflare_tunnel_url").catch(() => {});
  });

  proc.on("error", (err) => {
    logger.error({ err }, "cloudflared process error");
    tunnelStatus = "error";
    tunnelProcess = null;
  });
}

export function stopTunnel(): void {
  if (tunnelProcess) {
    tunnelProcess.kill("SIGTERM");
    tunnelProcess = null;
  }
  tunnelStatus = "stopped";
  tunnelUrl = null;
  clearConfig("cloudflare_tunnel_url").catch(() => {});
}

export async function initTunnelManager(): Promise<void> {
  const token = await getConfig("cloudflare_tunnel_token");
  if (!token) {
    logger.info("No tunnel token configured — tunnel not started");
    return;
  }
  startTunnel(token);
}
