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
