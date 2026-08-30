/**
 * connectorVault.ts
 *
 * AES-256-GCM encryption/decryption for external-integration connector
 * credentials at rest (API keys, RTSP passwords, tokens, etc). Mirrors
 * wipcVault.ts's approach, but keyed separately via CONNECTOR_VAULT_KEY —
 * connector credentials and WIPC witness-protection data must never share
 * a key boundary, so a rotation of one can never touch the other.
 *
 * CONNECTOR_VAULT_KEY must be a 64-character hex string (32 bytes).
 * Encrypted values are stored as:
 *   <iv_hex>:<authTag_hex>:<ciphertext_base64>
 *
 * This module is SERVER-SIDE ONLY. Never import from client code.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

function getKey(): Buffer {
  const raw = process.env.CONNECTOR_VAULT_KEY;
  if (!raw || raw.length !== 64) {
    throw new Error(
      "CONNECTOR_VAULT_KEY is not set or is not a valid 64-character hex string. " +
        "All connector credential operations are blocked until this is resolved."
    );
  }
  return Buffer.from(raw, "hex");
}

/**
 * Encrypt a plaintext string. Returns a compact encoded string safe to store in the DB.
 * Returns empty string if input is empty/null.
 */
export function vaultEncrypt(plaintext: string | null | undefined): string {
  if (!plaintext) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt a vault-encrypted string. Returns the original plaintext.
 * Returns empty string if input is empty/null.
 * Throws if the data is tampered or the key is wrong.
 */
export function vaultDecrypt(encoded: string | null | undefined): string {
  if (!encoded) return "";
  const key = getKey();
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid vault-encoded string format.");
  }
  const [ivHex, authTagHex, ciphertextBase64] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextBase64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Encrypt a connector's credentials object (whatever shape that connector
 * type needs — RTSP username/password, an API key, a token) into a single
 * opaque string for the connectors.credentialsRef column. Returns "" for
 * an empty/missing credentials object.
 */
export function encryptCredentials(
  credentials: Record<string, unknown> | null | undefined
): string {
  if (!credentials || Object.keys(credentials).length === 0) return "";
  return vaultEncrypt(JSON.stringify(credentials));
}

/**
 * Decrypt a connectors.credentialsRef value back into its credentials
 * object. Returns null for an empty/missing value.
 */
export function decryptCredentials(
  encoded: string | null | undefined
): Record<string, unknown> | null {
  if (!encoded) return null;
  const plaintext = vaultDecrypt(encoded);
  if (!plaintext) return null;
  return JSON.parse(plaintext) as Record<string, unknown>;
}

/**
 * A non-reversible fingerprint of the current CONNECTOR_VAULT_KEY (sha256,
 * truncated). Not wired into a startup check in Phase 1 — kept for parity
 * with wipcVault.ts in case a canary-row check is added later.
 */
export function fingerprintVaultKey(): string {
  const key = getKey();
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}
