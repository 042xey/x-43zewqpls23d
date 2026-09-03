import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  activeAccessTokensTable,
  activeRefreshTokensTable,
  appConfigTable,
  proxyUrlsTable,
} from "./schema";

const ENCRYPTED_PREFIX = "enc:v1:";
const KEY_ENV = "CONFIG_ENCRYPTION_KEY";
const KEY_FINGERPRINT_CONFIG = "config_encryption_key_fingerprint";
const SENSITIVE_CONFIG_KEYS = [
  "admin_api_key",
  "cloudflare_api_key",
  "cloudflare_tunnel_token",
] as const;

function encryptionKey(configured = process.env[KEY_ENV]?.trim()): Buffer {
  if (!configured || configured.length < 32) {
    throw new Error(`${KEY_ENV} must be set to at least 32 characters.`);
  }
  return createHash("sha256").update(configured).digest();
}

function keyFingerprint(configured = process.env[KEY_ENV]?.trim()): string {
  encryptionKey(configured);
  return createHash("sha256").update(configured!).digest("hex");
}

export function validateConfigEncryptionKey(): void {
  encryptionKey();
}

export async function ensureEncryptionKeyFingerprint(): Promise<void> {
  const fingerprint = keyFingerprint();
  const [existing] = await db
    .select({ value: appConfigTable.value })
    .from(appConfigTable)
    .where(eq(appConfigTable.key, KEY_FINGERPRINT_CONFIG))
    .limit(1);

  if (existing && existing.value !== fingerprint) {
    throw new Error(
      `${KEY_ENV} does not match the key registered for this database. Run the key rotation job with the previous and replacement keys before starting the service.`,
    );
  }

  if (!existing) {
    await db
      .insert(appConfigTable)
      .values({ key: KEY_FINGERPRINT_CONFIG, value: fingerprint })
      .onConflictDoNothing();
  }
}

function keyFor(value: string): Buffer { return encryptionKey(value); }

export function isSensitiveConfigKey(key: string): boolean {
  return (SENSITIVE_CONFIG_KEYS as readonly string[]).includes(key);
}

export function encryptConfigValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${ENCRYPTED_PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptConfigValue(value: string): string {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
  const [ivEncoded, tagEncoded, ciphertextEncoded] = value.slice(ENCRYPTED_PREFIX.length).split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error("Invalid encrypted configuration value.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function migrateConfigSecrets(): Promise<void> {
  const rows = await db
    .select()
    .from(appConfigTable)
    .where(inArray(appConfigTable.key, [...SENSITIVE_CONFIG_KEYS]));
  const plaintextRows = rows.filter((row) => !row.value.startsWith(ENCRYPTED_PREFIX));
  if (plaintextRows.length === 0) return;

  await db.transaction(async (tx) => {
    for (const row of plaintextRows) {
      await tx
        .update(appConfigTable)
        .set({ value: encryptConfigValue(row.value), updatedAt: new Date() })
        .where(eq(appConfigTable.key, row.key));
    }
  });
}

export async function migrateTokenSecrets(): Promise<void> {
  const [accessRows, refreshRows] = await Promise.all([
    db.select().from(activeAccessTokensTable),
    db.select().from(activeRefreshTokensTable),
  ]);
  const proxyRows = await db.select().from(proxyUrlsTable);
  const plaintextAccessRows = accessRows.filter(
    (row) => !row.accessToken.startsWith(ENCRYPTED_PREFIX),
  );
  const plaintextRefreshRows = refreshRows.filter(
    (row) => row.refreshToken && !row.refreshToken.startsWith(ENCRYPTED_PREFIX),
  );
  if (plaintextAccessRows.length === 0 && plaintextRefreshRows.length === 0 && proxyRows.every((row) => row.url.startsWith(ENCRYPTED_PREFIX))) {
    return;
  }

  await db.transaction(async (tx) => {
    for (const row of plaintextAccessRows) {
      await tx
        .update(activeAccessTokensTable)
        .set({ accessToken: encryptConfigValue(row.accessToken) })
        .where(eq(activeAccessTokensTable.id, row.id));
    }
    for (const row of plaintextRefreshRows) {
      await tx
        .update(activeRefreshTokensTable)
        .set({ refreshToken: encryptConfigValue(row.refreshToken!) })
        .where(eq(activeRefreshTokensTable.id, row.id));
    }
    for (const row of proxyRows.filter((item) => !item.url.startsWith(ENCRYPTED_PREFIX))) {
      await tx.update(proxyUrlsTable).set({ url: encryptConfigValue(row.url) }).where(eq(proxyUrlsTable.id, row.id));
    }
  });
}

export async function rotateConfigEncryptionKey(previousKey: string, nextKey: string): Promise<void> {
  const oldKey = keyFor(previousKey);
  const newKey = keyFor(nextKey);
  const nextFingerprint = keyFingerprint(nextKey);
  const [configs, accessRows, refreshRows, proxyRows] = await Promise.all([
    db.select().from(appConfigTable),
    db.select().from(activeAccessTokensTable),
    db.select().from(activeRefreshTokensTable),
    db.select().from(proxyUrlsTable),
  ]);
  const decryptWith = (value: string): string => {
    if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
    return decryptValue(value, oldKey);
  };
  await db.transaction(async (tx) => {
    for (const row of configs.filter((item) => isSensitiveConfigKey(item.key) && item.value)) {
      await tx.update(appConfigTable).set({ value: encryptValue(decryptWith(row.value), newKey), updatedAt: new Date() }).where(eq(appConfigTable.key, row.key));
    }
    for (const row of accessRows) await tx.update(activeAccessTokensTable).set({ accessToken: encryptValue(decryptWith(row.accessToken), newKey) }).where(eq(activeAccessTokensTable.id, row.id));
    for (const row of refreshRows.filter((item) => item.refreshToken)) await tx.update(activeRefreshTokensTable).set({ refreshToken: encryptValue(decryptWith(row.refreshToken!), newKey) }).where(eq(activeRefreshTokensTable.id, row.id));
    for (const row of proxyRows) await tx.update(proxyUrlsTable).set({ url: encryptValue(decryptWith(row.url), newKey) }).where(eq(proxyUrlsTable.id, row.id));
    await tx
      .insert(appConfigTable)
      .values({ key: KEY_FINGERPRINT_CONFIG, value: nextFingerprint })
      .onConflictDoUpdate({
        target: appConfigTable.key,
        set: { value: nextFingerprint, updatedAt: new Date() },
      });
  });
}

function encryptValue(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${ENCRYPTED_PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptValue(value: string, key: Buffer): string {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = value.slice(ENCRYPTED_PREFIX.length).split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Invalid encrypted configuration value.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
}
