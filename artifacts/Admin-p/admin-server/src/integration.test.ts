import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const databaseUrl = process.env["TEST_DATABASE_URL"]?.trim();
const safeDatabaseName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : "";
const enabled = Boolean(
  databaseUrl &&
    process.env["ALLOW_TEST_DATABASE"] === "YES" &&
    /(?:^|[-_])test(?:[-_]|$)|^testdb$/i.test(safeDatabaseName),
);

let server: Server | undefined;
let baseUrl = "";
let cookie = "";
let csrf = "";

const request = async (path: string, init: RequestInit = {}): Promise<Response> =>
  fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });

before(async () => {
  if (!enabled) return;
  process.env["DATABASE_URL"] = databaseUrl;
  process.env["ADMIN_ROUTE_PREFIX"] = "admin-test";
  process.env["ADMIN_BOOTSTRAP_TOKEN"] = "test-bootstrap-token";
  process.env["CONFIG_ENCRYPTION_KEY"] = "test-config-encryption-key-with-32-chars";
  process.env["NODE_ENV"] = "test";

  const { db, pool } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`delete from admin_sessions`);
  await db.execute(sql`delete from admin_users`);
  await db.execute(sql`delete from rate_limit_buckets`);
  const { default: app } = await import("./app");
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
  await pool.query("select 1");
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (enabled) {
    const { pool } = await import("@workspace/db");
    await pool.end();
  }
});

test("health and readiness endpoints report service state", { skip: !enabled }, async () => {
  const health = await request("/api/healthz");
  assert.equal(health.status, 200);
  const ready = await request("/api/readyz");
  assert.equal(ready.status, 200);
  const body = (await ready.json()) as { checks: { database: string } };
  assert.equal(body.checks.database, "ok");
});

test("bootstrap creates exactly one admin and establishes a session", { skip: !enabled }, async () => {
  const rejected = await request("/api/admin-test/setup", {
    method: "POST",
    headers: { "x-bootstrap-token": "wrong" },
    body: JSON.stringify({ username: "admin", password: "a-secure-password" }),
  });
  assert.equal(rejected.status, 401);

  const created = await request("/api/admin-test/setup", {
    method: "POST",
    headers: { "x-bootstrap-token": "test-bootstrap-token" },
    body: JSON.stringify({ username: "Admin", password: "a-secure-password" }),
  });
  assert.equal(created.status, 200);
  const setCookies = created.headers.getSetCookie();
  cookie = setCookies.map((part) => part.split(";")[0]).join("; ");
  csrf = cookie.match(/admin_csrf=([^;]+)/)?.[1] ?? "";
  assert.match(cookie, /admin_session=/);
  assert.match(cookie, /admin_csrf=/);

  const duplicate = await request("/api/admin-test/setup", {
    method: "POST",
    headers: { "x-bootstrap-token": "test-bootstrap-token" },
    body: JSON.stringify({ username: "second", password: "another-secure-password" }),
  });
  assert.equal(duplicate.status, 409);
});

test("login, CSRF enforcement, and logout revocation work together", { skip: !enabled }, async () => {
  cookie = "";
  const login = await request("/api/admin-test/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "a-secure-password" }),
  });
  assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie().map((part) => part.split(";")[0]).join("; ");
  csrf = cookie.match(/admin_csrf=([^;]+)/)?.[1] ?? "";

  assert.equal((await request("/api/admin-test/ping")).status, 200);
  assert.equal((await request("/api/admin-test/tokens")).status, 200);
  assert.equal((await request("/api/admin-test/proxies")).status, 200);

  const csrfFailure = await request("/api/admin-test/external-apps/webmail", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com" }),
  });
  assert.equal(csrfFailure.status, 403);

  const csrfSuccess = await request("/api/admin-test/external-apps", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ webmail_url: "", svg_generator_url: "" }),
  });
  assert.equal(csrfSuccess.status, 200);

  assert.equal((await request("/api/admin-test/logout")).status, 404);

  const logout = await request("/api/admin-test/logout", {
    method: "POST",
    redirect: "manual",
    headers: { "x-csrf-token": csrf },
  });
  assert.equal(logout.status, 302);
  assert.equal((await request("/api/admin-test/ping")).status, 401);
});

test("keyword alerts CRUD and Telegram flow", { skip: !enabled }, async () => {
  const { db } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`delete from keyword_alerts`);
  await db.execute(sql`delete from alert_events`);

  const cfg = await request("/api/admin-test/keyword-alerts");
  assert.equal(cfg.status, 200);
  const empty = await cfg.json() as unknown[];
  assert.equal(empty.length, 0);

  const createBody = {
    name: "Test Alert",
    description: "A test",
    severity: "high",
    keywords: ["urgent", "payment"],
    mode: "phrase",
    channels: ["in-app"],
    cooldown: 30,
  };
  const created = await request("/api/admin-test/keyword-alerts", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify(createBody),
  });
  assert.equal(created.status, 201);
  const alert = await created.json() as Record<string, unknown>;
  assert.equal(alert.name, "Test Alert");
  assert.equal(alert.severity, "high");
  assert.ok(alert.id);

  const updated = await request(`/api/admin-test/keyword-alerts/${alert.id}`, {
    method: "PATCH",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ name: "Updated Alert", enabled: false }),
  });
  assert.equal(updated.status, 200);
  const patched = await updated.json() as Record<string, unknown>;
  assert.equal(patched.name, "Updated Alert");
  assert.equal(patched.enabled, false);

  const dryRun = await request(`/api/admin-test/keyword-alerts/${alert.id}/test`, {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ sender: "treasury@example.com", recipient: "ops@example.com", subject: "Urgent payment hold", body: "Please wire transfer", attachment: "" }),
  });
  assert.equal(dryRun.status, 200);
  const result = await dryRun.json() as Record<string, unknown>;
  assert.equal(result.matched, true);

  const dryRunNoMatch = await request(`/api/admin-test/keyword-alerts/${alert.id}/test`, {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ sender: "noreply@example.com", recipient: "ops@example.com", subject: "Weekly newsletter", body: "Your weekly update", attachment: "" }),
  });
  assert.equal(dryRunNoMatch.status, 200);
  const noMatch = await dryRunNoMatch.json() as Record<string, unknown>;
  assert.equal(noMatch.matched, false);

  const eventsRes = await request("/api/admin-test/keyword-alert-events");
  assert.equal(eventsRes.status, 200);
  const events = await eventsRes.json() as unknown[];
  assert.equal(events.length, 0);

  const telegramGet = await request("/api/admin-test/telegram-connection");
  assert.equal(telegramGet.status, 200);
  const tgEmpty = await telegramGet.json() as Record<string, unknown>;
  assert.equal(tgEmpty.connected, false);

  const telegramSetup = await request("/api/admin-test/telegram-connection", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ botToken: "123456:ABCdefGHIjklmNOPqrstUVwxyzABCDEFGH", chatId: "-1001234567890" }),
  });
  assert.equal(telegramSetup.status, 200);
  const tgConnected = await telegramSetup.json() as Record<string, unknown>;
  assert.equal(tgConnected.connected, true);
  assert.equal(tgConnected.chatId, "-1001234567890");
  assert.equal(tgConnected.botName, "northstar-alerts");
  assert.ok(tgConnected.configuredAt);

  const telegramVerify = await request("/api/admin-test/telegram-connection");
  assert.equal(telegramVerify.status, 200);
  const tgVerify = await telegramVerify.json() as Record<string, unknown>;
  assert.equal(tgVerify.connected, true);
  assert.ok(!("botToken" in tgVerify));

  const telegramReplace = await request("/api/admin-test/telegram-connection", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ botToken: "654321:ZYXwvuTSRqponMLKJihgfeDCBAzyx9876", chatId: "-1009876543210" }),
  });
  assert.equal(telegramReplace.status, 200);

  const telegramDelete = await request("/api/admin-test/telegram-connection", {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
  });
  assert.equal(telegramDelete.status, 200);

  const telegramGone = await request("/api/admin-test/telegram-connection");
  assert.equal(telegramGone.status, 200);
  const tgGone = await telegramGone.json() as Record<string, unknown>;
  assert.equal(tgGone.connected, false);

  const deleted = await request(`/api/admin-test/keyword-alerts/${alert.id}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
  });
  assert.equal(deleted.status, 200);

  const gone = await request("/api/admin-test/keyword-alerts");
  assert.equal(gone.status, 200);
  const remaining = await gone.json() as unknown[];
  assert.equal(remaining.length, 0);
});

test("keyword alert validation rejects bad input", { skip: !enabled }, async () => {
  const noName = await request("/api/admin-test/keyword-alerts", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ keywords: ["test"], channels: ["in-app"] }),
  });
  assert.equal(noName.status, 400);

  const noKeywords = await request("/api/admin-test/keyword-alerts", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ name: "Test", channels: ["in-app"] }),
  });
  assert.equal(noKeywords.status, 400);

  const noChannels = await request("/api/admin-test/keyword-alerts", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ name: "Test", keywords: ["test"] }),
  });
  assert.equal(noChannels.status, 400);
});
