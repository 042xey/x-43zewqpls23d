import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  activeAccessTokensTable,
  activeRefreshTokensTable,
  appConfigTable,
} from "./schema";

const ENCRYPTED_PREFIX = "enc:v1:";
const KEY_ENV = "CONFIG_ENCRYPTION_KEY";
const SENSITIVE_CONFIG_KEYS = [
  "admin_api_key",
  "cloudflare_api_key",
  "cloudflare_tunnel_token",
] as const;

function encryptionKey(): Buffer {
  const configured = process.env[KEY_ENV]?.trim();
  if (!configured || configured.length < 32) {
    throw new Error(`${KEY_ENV} must be set to at least 32 characters.`);
  }
  return createHash("sha256").update(configured).digest();
}

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
  const plaintextAccessRows = accessRows.filter(
    (row) => !row.accessToken.startsWith(ENCRYPTED_PREFIX),
  );
  const plaintextRefreshRows = refreshRows.filter(
    (row) => row.refreshToken && !row.refreshToken.startsWith(ENCRYPTED_PREFIX),
  );
  if (plaintextAccessRows.length === 0 && plaintextRefreshRows.length === 0) {
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
  });
}
