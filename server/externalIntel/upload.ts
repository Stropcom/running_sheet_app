import {
  normalizeAndValidateImage,
  AttachmentUploadError,
} from "../attachmentUpload";
import { storagePut } from "../storage";
import { createRowAttachment } from "../db";
import { processExternalDocument } from "./index";
import { createExternalDocument } from "./db";

export { AttachmentUploadError };

export interface UploadExternalDocumentParams {
  operationId: number;
  buffer: Buffer;
  reportedMimeType: string;
  fileName?: string;
  userId: number;
  userCIN?: string;
}

/**
 * Uploads a photographed/scanned intelligence document, stores it the same
 * way a manually-uploaded photo is stored (row_attachments, no running
 * sheet row), then runs it through the deterministic OCR extraction
 * pipeline and persists the results as a pending-review external document.
 */
export async function uploadExternalDocument(
  params: UploadExternalDocumentParams
): Promise<{ documentId: number; attachmentId: number }> {
  const { buffer, mimeType } = await normalizeAndValidateImage(params);

  const ext = mimeType.split("/")[1];
  const keyBase = `external-documents/operation-${params.operationId}/${Date.now()}.${ext}`;
  const { key, url } = await storagePut(keyBase, buffer, mimeType);
  const attachmentId = await createRowAttachment({
    rowId: null,
    operationId: params.operationId,
    isManualUpload: true,
    key,
    url,
    mimeType,
    caption: "External intelligence document",
    uploadedBy: params.userId,
    uploadedByCIN: params.userCIN,
  });

  const processed = await processExternalDocument(buffer);

  const documentId = await createExternalDocument({
    attachmentId,
    templateType: "afp_target_profile",
    fields: processed.tableFields,
    sections: processed.sections,
    entities: processed.entities,
    ocrText: processed.ocrText,
    uploadedBy: params.userId,
    uploadedByCIN: params.userCIN,
  });

  return { documentId, attachmentId };
}
