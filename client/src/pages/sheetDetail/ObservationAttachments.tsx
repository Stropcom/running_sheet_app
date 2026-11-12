import { IMAGERY_PHRASE_PATTERN } from "@shared/rowImagery";
import { LinkAttachmentDialog } from "@/components/LinkAttachmentDialog";
import { LinkedEntityPills } from "@/components/LinkedEntityPills";
import { ResizablePhoto } from "@/components/ResizablePhoto";
import { DeletePhotoButton } from "@/components/DeletePhotoButton";
import { Camera } from "lucide-react";
import React, { useState, useRef } from "react";
import { compressAttachmentImage } from "@/lib/imageCompress";
import { toast } from "sonner";
import type { SheetRow } from "./types";

// ─── Observation Photo Attachments ─────────────────────────────────────────────
// Shown inline under the observation text whenever it contains an imagery
// phrase (e.g. "PHOTOGRAPH/S TAKEN" from the PT shortcut). Photos render
// directly in the cell at ~1/3 width — same proportion used in the PDF export.

export function ObservationAttachments({
  row,
  canEdit,
  onUpload,
  onDelete,
  uploading,
  deletePending,
  operationId,
}: {
  row: SheetRow;
  canEdit: boolean;
  onUpload: (
    rowId: number,
    blob: Blob,
    mimeType: string,
    fileName: string
  ) => Promise<{ id: number; url: string }>;
  onDelete: (id: number) => void;
  uploading: boolean;
  deletePending?: boolean;
  operationId?: number;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  // A photo chosen but not yet uploaded: it opens the "Link photo to entity"
  // window with the photo ready, and only goes up when the officer presses the
  // green Confirm upload at the bottom right of that window.
  const [pendingPhoto, setPendingPhoto] = useState<{
    blob: Blob;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ id: number; url: string } | null>(
    null
  );
  // This row's real CINs (excluding the "__SPACE__" spacer) — a single-CIN
  // row gets its photos auto-linked at upload (see
  // autoLinkAttachmentToRowMemberIfSingle in db.ts), so this is only
  // actually used for the badge's "properly linked" check and, on a
  // multi-CIN row, LinkAttachmentDialog's own CIN picker section below.
  const rowCins = row.members
    .map(m => m.memberName)
    .filter(cin => cin !== "__SPACE__");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!IMAGERY_PHRASE_PATTERN.test(row.observation ?? "")) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const compressed = await compressAttachmentImage(file);
      const blob: Blob = compressed?.blob ?? file;
      const mimeType = compressed?.mimeType ?? file.type;
      const fileName = compressed?.fileName ?? file.name;

      if (blob.size > 25 * 1024 * 1024) {
        toast.error("Photo must be under 25 MB.");
        return;
      }

      // Staged only — nothing is uploaded until Confirm upload is pressed in
      // the link window.
      setPendingPhoto({ blob, mimeType, fileName });
    } catch {
      toast.error(
        "Couldn't process that photo — try again, or use a different photo."
      );
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      {row.attachments.map(a => (
        <ResizablePhoto key={a.id} photoId={a.id}>
          {handle => (
            <>
              <div className="relative">
                <img
                  src={a.url}
                  alt="Attached photograph"
                  className="w-full rounded border border-border cursor-zoom-in"
                  onClick={() => setLightbox(a.url)}
                />
                {handle}
              </div>
              {canEdit && (
                <DeletePhotoButton
                  pending={deletePending}
                  onConfirm={() => onDelete(a.id)}
                  positionClassName="absolute -top-1.5 -right-1.5"
                  iconSize="h-3.5 w-3.5 sm:h-4 sm:w-4"
                  glyphSize="h-2 w-2 sm:h-2.5 sm:w-2.5"
                />
              )}
              <LinkedEntityPills
                entities={a.linkedEntities}
                faceCount={a.faceCount}
                hasRow
                onClick={() => setLinking({ id: a.id, url: a.url })}
              />
            </>
          )}
        </ResizablePhoto>
      ))}
      {preview && uploading && (
        <div style={{ width: "33%", minWidth: 90, maxWidth: 160 }}>
          <img
            src={preview}
            alt="Uploading…"
            className="w-full rounded border border-border opacity-50"
          />
        </div>
      )}
      {canEdit && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            title="Attach photo"
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={handleFile}
          />
        </>
      )}

      {pendingPhoto && operationId != null && (
        <LinkAttachmentDialog
          open
          onOpenChange={o => {
            if (!o) setPendingPhoto(null);
          }}
          currentOperationId={operationId}
          rowCins={row.members
            .map(m => m.memberName)
            .filter(cin => cin !== "__SPACE__")}
          stagedPhoto={{
            ...pendingPhoto,
            operationId,
            upload: async (blob, mimeType, fileName) => {
              // The same row upload as before — it just waits for Confirm.
              setPreview(URL.createObjectURL(blob));
              return onUpload(row.id, blob, mimeType, fileName);
            },
          }}
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Attached photograph"
            className="max-w-full max-h-full rounded shadow-2xl"
          />
        </div>
      )}

      {linking !== null && (
        <LinkAttachmentDialog
          attachmentId={linking.id}
          photoUrl={linking.url}
          open={linking !== null}
          onOpenChange={open => {
            if (!open) setLinking(null);
          }}
          currentOperationId={operationId}
          rowCins={rowCins}
        />
      )}
    </div>
  );
}
