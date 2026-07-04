/**
 * wipcVault.ts
 *
 * AES-256-GCM encryption/decryption for WIPC sensitive data at rest.
 * The WIPC_VAULT_KEY environment variable must be a 64-character hex string (32 bytes).
 * All encrypted values are stored as base64-encoded strings in the format:
 *   <iv_hex>:<authTag_hex>:<ciphertext_base64>
 *
 * This module is SERVER-SIDE ONLY. Never import from client code.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

function getKey(): Buffer {
  const raw = process.env.WIPC_VAULT_KEY;
  if (!raw || raw.length !== 64) {
    throw new Error(
      "WIPC_VAULT_KEY is not set or is not a valid 64-character hex string. " +
        "All WIPC sensitive data operations are blocked until this is resolved."
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
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv_hex:authTag_hex:ciphertext_base64
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
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Encrypt an object's specified fields, returning a new object with those fields encrypted.
 * Non-specified fields are passed through unchanged.
 */
export function vaultEncryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    const val = obj[field];
    if (typeof val === "string") {
      (result as Record<string, unknown>)[field as string] = vaultEncrypt(val);
    }
  }
  return result;
}

/**
 * Decrypt an object's specified fields, returning a new object with those fields decrypted.
 */
export function vaultDecryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    const val = obj[field];
    if (typeof val === "string") {
      (result as Record<string, unknown>)[field as string] = vaultDecrypt(val);
    }
  }
  return result;
}
