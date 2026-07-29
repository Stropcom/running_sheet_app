// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.
//
// Local dev fallback: BUILT_IN_FORGE_API_URL/KEY are Manus platform
// credentials that won't exist on a laptop running its own local database.
// When they're absent, storagePut writes straight to disk under uploads/
// and serves it back via the /local-uploads static route (registered in
// server/_core/index.ts) instead of failing outright.

import fs from "fs/promises";
import path from "path";
import type { Express } from "express";
import express from "express";
import { ENV } from "./_core/env";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "uploads");

function isForgeConfigured(): boolean {
  return !!(ENV.forgeApiUrl && ENV.forgeApiKey);
}

export function registerLocalUploadsRoute(app: Express) {
  app.use("/local-uploads", express.static(LOCAL_UPLOAD_DIR));
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  if (!isForgeConfigured()) {
    const filePath = path.join(LOCAL_UPLOAD_DIR, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, typeof data === "string" ? Buffer.from(data) : data);
    return { key, url: `/local-uploads/${key}` };
  }

  const { forgeUrl, forgeKey } = getForgeConfig();

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

/** Reads a previously-stored object's raw bytes back into memory — used by
 * server-side processing (e.g. face detection) that needs the actual pixel
 * data, not just a servable URL. */
export async function storageGetBytes(relKey: string): Promise<Buffer> {
  const key = normalizeKey(relKey);

  if (!isForgeConfigured()) {
    const filePath = path.join(LOCAL_UPLOAD_DIR, key);
    return fs.readFile(filePath);
  }

  const signedUrl = await storageGetSignedUrl(key);
  const resp = await fetch(signedUrl);
  if (!resp.ok) throw new Error(`Storage fetch failed (${resp.status})`);
  return Buffer.from(await resp.arrayBuffer());
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
