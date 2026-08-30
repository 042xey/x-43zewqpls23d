import { pool } from "@workspace/db";
import { rotateConfigEncryptionKey } from "@workspace/db/secure-config";

const previousKey = process.env["OLD_CONFIG_ENCRYPTION_KEY"]?.trim();
const nextKey = process.env["CONFIG_ENCRYPTION_KEY"]?.trim();
if (!previousKey || !nextKey) throw new Error("OLD_CONFIG_ENCRYPTION_KEY and CONFIG_ENCRYPTION_KEY are required.");
if (previousKey === nextKey) throw new Error("New encryption key must differ from the old key.");

try {
  await rotateConfigEncryptionKey(previousKey, nextKey);
} finally {
  await pool.end();
}
