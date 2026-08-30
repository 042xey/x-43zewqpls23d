import assert from "node:assert/strict";
import test from "node:test";
import { adminUrl, authFetch, safeExternalUrl } from "./api";

test("admin URLs stay under the configured API prefix", () => {
  assert.equal(adminUrl("external-apps"), "/api/admin/external-apps");
  assert.equal(adminUrl("/tokens"), "/api/admin/tokens");
});

test("external URL validation accepts only HTTP(S)", () => {
  assert.equal(safeExternalUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(safeExternalUrl("http://localhost:8080"), "http://localhost:8080/");
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("not a URL"), null);
  assert.equal(safeExternalUrl(null), null);
});

test("authFetch forwards same-origin credentials and the CSRF cookie", async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  let captured: { url: string; init?: RequestInit } | undefined;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "admin_csrf=csrf-value" },
  });
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(null, { status: 204 });
  };

  await authFetch("/api/admin/ping", { method: "POST" });

  assert.equal(captured?.url, "/api/admin/ping");
  assert.equal(captured?.init?.credentials, "same-origin");
  assert.equal(
    new Headers(captured?.init?.headers).get("X-CSRF-Token"),
    "csrf-value",
  );
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
});
