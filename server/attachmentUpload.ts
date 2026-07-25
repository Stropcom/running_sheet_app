import type { Express, Request, Response } from "express";
import express from "express";
import heicConvert from "heic-convert";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";
import { createAuditLog, createRowAttachment, getRowById } from "./db";

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
};

export class AttachmentUploadError extends Error {
  constructor(public status: 400 | 404, message: string) {
    super(message);
  }
}

/**
 * Core logic shared by the tRPC (base64/JSON) upload mutation and the raw
 * binary upload route below. Kept in one place so HEIC handling, mimeType
 * normalization, size limits, and the storage key format can't drift
 * between the two entry points.
 */
export async function processAttachmentUpload(params: {
  rowId: number;
  buffer: Buffer;
  reportedMimeType: string;
  fileName?: string;
  caption?: string;
  userId: number;
  userCIN?: string;
}): Promise<{ id: number; url: string }> {
  const row = await getRowById(params.rowId);
  if (!row) throw new AttachmentUploadError(404, "Row not found.");

  let buffer = params.buffer;
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentUploadError(400, "Photo must be under 25 MB.");
  }

  const fileExt = (params.fileName ?? "").split(".").pop()?.toLowerCase();
  let mimeType = /^image\//.test(params.reportedMimeType)
    ? params.reportedMimeType
    : (fileExt && EXT_TO_MIME[fileExt]) || params.reportedMimeType;

  // No trailing $ — iOS reports variants like "image/heic-sequence" for
  // Portrait/Burst/Live photos, which are still HEIC containers heicConvert
  // can read.
  const isHeic = /^image\/hei[cf]/i.test(mimeType) || /\.hei[cf]$/i.test(params.fileName ?? "");
  if (isHeic) {
    try {
      buffer = await heicConvert({ buffer, format: "JPEG", quality: 0.9 });
    } catch (err) {
      console.error("HEIC conversion failed:", err);
      throw new AttachmentUploadError(400, "Could not read that HEIC/HEIF photo.");
    }
    mimeType = "image/jpeg";
  }

  if (!/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) {
    throw new AttachmentUploadError(400, "Only JPEG, PNG, WebP, GIF, or HEIC/HEIF images are allowed.");
  }

  const ext = mimeType.split("/")[1];
  const key = `row-attachments/sheet-${row.sheetId}/row-${row.id}/${Date.now()}.${ext}`;
  const { url } = await storagePut(key, buffer, mimeType);
  const id = await createRowAttachment({
    rowId: row.id,
    key,
    url,
    mimeType,
    caption: params.caption,
    uploadedBy: params.userId,
    uploadedByCIN: params.userCIN,
  });
  await createAuditLog({
    sheetId: row.sheetId,
    rowId: row.id,
    userId: params.userId,
    userName: params.userCIN ?? "Unknown",
    userCIN: params.userCIN,
    action: "attachment_added",
    details: `Photo attached to row`,
    createdAt: Date.now(),
  });

  return { id, url };
}

// Plain (non-tRPC) route that accepts the raw photo bytes as the request
// body, instead of base64-encoding it into a JSON payload. A base64 JSON
// blob for a several-MB Portrait-mode iPhone photo (the source format
// doesn't downscale as reliably client-side) is what was intermittently
// failing on weak mobile connections with a cryptic browser error — raw
// binary avoids both the ~33% base64 size inflation and the giant
// in-memory JSON string that triggered it.
export function registerRawAttachmentUploadRoute(app: Express) {
  app.post(
    "/api/attachments/upload-raw",
    express.raw({ type: () => true, limit: "26mb" }),
    async (req: Request, res: Response) => {
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const rowId = Number(req.query.rowId);
      if (!Number.isFinite(rowId)) {
        return res.status(400).json({ error: "Invalid rowId." });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "Empty photo." });
      }

      const fileName = typeof req.query.fileName === "string" ? req.query.fileName : undefined;
      const mimeType = typeof req.query.mimeType === "string" ? req.query.mimeType : "";

      try {
        const result = await processAttachmentUpload({
          rowId,
          buffer: req.body,
          reportedMimeType: mimeType,
          fileName,
          userId: user.id,
          userCIN: user.cin ?? undefined,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof AttachmentUploadError) {
          return res.status(err.status).json({ error: err.message });
        }
        console.error("Attachment upload failed:", err);
        res.status(500).json({ error: "Upload failed." });
      }
    }
  );
}
