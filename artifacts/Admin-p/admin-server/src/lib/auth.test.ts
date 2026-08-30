import assert from "node:assert/strict";
import test from "node:test";

process.env["DATABASE_URL"] ??= "postgresql://test:test@localhost:5432/test";
const {
  getSessionToken,
  hashPassword,
  hashToken,
  newCsrfToken,
  newSessionCookie,
  normalizeUsername,
  verifyPassword,
} = await import("./auth");

test("normalizes usernames before lookup", () => {
  assert.equal(normalizeUsername("  Admin.User "), "admin.user");
  assert.equal(normalizeUsername(undefined), "");
});

test("password hashes verify only the original password", () => {
  const encoded = hashPassword("correct horse battery staple");
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(verifyPassword("correct horse battery staple", encoded), true);
  assert.equal(verifyPassword("wrong password", encoded), false);
  assert.equal(verifyPassword("correct horse battery staple", "invalid"), false);
});

test("session cookies expire in eight hours and tokens are hashed", () => {
  const before = Date.now();
  const session = newSessionCookie();
  const after = Date.now();
  assert.equal(session.token.length > 32, true);
  assert.equal(session.expiresAt.getTime() >= before + 8 * 60 * 60 * 1000, true);
  assert.equal(session.expiresAt.getTime() <= after + 8 * 60 * 60 * 1000, true);
  assert.notEqual(hashToken(session.token), session.token);
});

test("CSRF tokens are unpredictable and cookie parsing handles encoding", () => {
  const first = newCsrfToken();
  const second = newCsrfToken();
  assert.equal(first.length > 32, true);
  assert.notEqual(first, second);
  assert.equal(
    getSessionToken(`other=value; admin_session=${encodeURIComponent("session-value")}`),
    "session-value",
  );
  assert.equal(getSessionToken("admin_session=first; admin_session=second"), "first");
  assert.equal(getSessionToken(undefined), null);
});
