import assert from "node:assert/strict";
import test from "node:test";
import { generateWorkerScript, type WorkerConfig } from "./workerGenerator";

process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.CONFIG_ENCRYPTION_KEY = "test-config-encryption-key-with-32-chars";
const { decryptConfigValue, encryptConfigValue } = await import(
  "@workspace/db/secure-config"
);

function config(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    template: "devdoc-sign",
    clientAlias: "msgraph",
    apiServerUrl: "https://api.example.test/",
    frontendUrl: "https://frontend.example.test/app/",
    publicCodePath: "/x7k9p2m/",
    decoyDomains: ["https://example.com"],
    workerApiSecret: "worker-secret",
    ...overrides,
  };
}

test("normalizes origins and the public code path", () => {
  const script = generateWorkerScript(config());

  assert.match(script, /const API_ORIGIN\s+= "https:\/\/api\.example\.test";/);
  assert.match(script, /const FRONTEND_ORIGIN\s+= "https:\/\/frontend\.example\.test\/app\/";/);
  assert.match(script, /const SECRET_PATH\s+= "\/x7k9p2m";/);
});

test("uses the default KV binding when one is not configured", () => {
  const script = generateWorkerScript(config({ kvBindingName: undefined }));

  assert.match(script, /const KV_BINDING\s+= "CODE_STORE";/);
});

test("embeds custom deployment values as valid JavaScript strings", () => {
  const script = generateWorkerScript(
    config({
      template: "teams",
      clientAlias: "msteams",
      kvBindingName: "CUSTOM_STORE",
      decoyDomains: ["https://example.com", "https://decoy.example/\"site"],
      workerApiSecret: "secret-with-\"-quotes",
    }),
  );

  assert.match(script, /const TEMPLATE\s+= "teams";/);
  assert.match(script, /const CLIENT_ALIAS\s+= "msteams";/);
  assert.match(script, /const KV_BINDING\s+= "CUSTOM_STORE";/);
  assert.match(script, /const PROXY_WEBSITES\s+= \["https:\/\/example\.com","https:\/\/decoy\.example\/\\"site"\];/);
  assert.match(script, /const WORKER_API_SECRET\s+= "secret-with-\\"-quotes";/);
});

test("includes the worker API secret and configured routes", () => {
  const script = generateWorkerScript(config());

  assert.match(script, /const WORKER_API_SECRET\s+= "worker-secret";/);
  assert.match(script, /\/api\//);
  assert.match(script, /SECRET_PATH/);
});

test("encrypts configuration values and decrypts them only with the key", () => {
  const plaintext = "cloudflare-token-value";
  const encrypted = encryptConfigValue(plaintext);

  assert.notEqual(encrypted, plaintext);
  assert.doesNotMatch(encrypted, /cloudflare-token-value/);
  assert.equal(decryptConfigValue(encrypted), plaintext);
});

test("preserves legacy plaintext values during migration reads", () => {
  assert.equal(decryptConfigValue("legacy-token"), "legacy-token");
});

test("rejects tampered encrypted configuration values", () => {
  const encrypted = encryptConfigValue("secret");
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

  assert.throws(() => decryptConfigValue(tampered));
});
