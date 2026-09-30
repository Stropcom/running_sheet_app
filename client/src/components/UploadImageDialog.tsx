import { trpc } from "@/lib/trpc";
import { compressAttachmentImage } from "@/lib/imageCompress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  SuggestedFaceMatchDialog,
  type FaceMatchSuggestion,
} from "@/components/SuggestedFaceMatchDialog";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Manual upload from the Images folder — independent of any running sheet
// row. Deliberately mirrors the running sheet's own photo upload exactly
// (ObservationAttachments in SheetDetail.tsx): pick a photo, it uploads
// immediately, then the same single-face auto-match check runs and offers
// SuggestedFaceMatchDialog if it finds anything. The only extra step here
// is Operation (required — a manual upload has no row to infer it from);
// there's no pre-upload entity picker, same as the running sheet has none.
// Linking to a specific Target/Associate/Vehicle/Location/Unidentified
// Person always happens afterward, via the amber "not linked" pill →
// LinkAttachmentDialog, identically to every other photo in the app.
export function UploadImageDialog({
  open,
  onOpenChange,
  defaultOperationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOperationId?: number;
}) {
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<{
    blob: Blob;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [operationId, setOperationId] = useState<number | null>(
    defaultOperationId ?? null
  );
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [rowId, setRowId] = useState<number | null>(null);

  // Same one-shot pattern as the running sheet's own suggestCheck/suggestion
  // pair: set right after upload so the query below has something to check,
  // cleared as soon as it comes back either way.
  const [suggestCheck, setSuggestCheck] = useState<{
    id: number;
    url: string;
  } | null>(null);
  const [suggestion, setSuggestion] = useState<{
    id: number;
    url: string;
    match: FaceMatchSuggestion;
  } | null>(null);

  const { data: facePreview, isFetched: facePreviewFetched } =
    trpc.attachment.previewFaceMatch.useQuery(
      { attachmentId: suggestCheck?.id ?? 0 },
      { enabled: suggestCheck !== null, retry: false }
    );

  useEffect(() => {
    if (!suggestCheck || !facePreviewFetched) return;
    if (facePreview?.suggestion) {
      setSuggestion({
        id: suggestCheck.id,
        url: suggestCheck.url,
        match: facePreview.suggestion,
      });
    }
    setSuggestCheck(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facePreviewFetched, facePreview]);

  const { data: allOperations } = trpc.operation.list.useQuery(undefined, {
    enabled: open,
  });
  const operationOptions = (allOperations ?? []) as any[];

  const { data: sheets } = trpc.sheet.listByOperation.useQuery(
    { operationId: operationId ?? -1 },
    { enabled: operationId != null }
  );

  const { data: rows } = trpc.row.list.useQuery(
    { sheetId: sheetId ?? -1 },
    { enabled: sheetId != null }
  );

  const reset = () => {
    setFile(null);
    setPreview(null);
    setOperationId(defaultOperationId ?? null);
    setSheetId(null);
    setRowId(null);
    setSuggestCheck(null);
    setSuggestion(null);
  };

  const uploadManual = trpc.attachment.uploadManual.useMutation();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const compressed = await compressAttachmentImage(f);
      const blob = compressed?.blob ?? f;
      const mimeType = compressed?.mimeType ?? f.type;
      const fileName = compressed?.fileName ?? f.name;
      if (blob.size > 25 * 1024 * 1024) {
        toast.error("Photo must be under 25 MB.");
        return;
      }
      setFile({ blob, mimeType, fileName });
      const isHeic =
        !compressed &&
        (/^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name));
      if (!isHeic) {
        const reader = new FileReader();
        reader.onload = () => setPreview(reader.result as string);
        reader.readAsDataURL(blob);
      } else {
        setPreview(null);
      }
    } catch {
      toast.error(
        "Couldn't process that photo — try again, or use a different photo."
      );
    }
  };

  const canSubmit = !!file && operationId != null && !uploadManual.isPending;

  const handleSubmit = async () => {
    if (!file || operationId == null) return;
    const dataBase64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve((reader.result as string).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("Could not read photo."));
      reader.readAsDataURL(file.blob);
    });

    try {
      const result = await uploadManual.mutateAsync({
        operationId,
        rowId: rowId ?? undefined,
        dataBase64,
        mimeType: file.mimeType,
        fileName: file.fileName,
      });

      utils.attachment.listByOperation.invalidate({ operationId });
      if (sheetId != null) utils.attachment.listBySheet.invalidate({ sheetId });
      if (rowId != null)
        utils.row.list.invalidate({ sheetId: sheetId ?? undefined });
      toast.success("Photo uploaded");
      setSuggestCheck(result);
      setFile(null);
      setPreview(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed.");
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={o => {
          if (!o) reset();
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload photo</DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border border-l-4 border-border border-l-muted-foreground/40 bg-muted/20 p-3 flex flex-col gap-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Photo
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            {file ? (
              <div className="flex flex-col gap-2">
                {preview ? (
                  <img
                    src={preview}
                    alt="Selected photograph"
                    className="w-full max-h-80 object-contain rounded-lg border border-border bg-background"
                  />
                ) : (
                  <div className="w-full h-56 rounded-lg border border-border bg-background flex items-center justify-center text-xs text-muted-foreground text-center px-2">
                    No preview available for this file type
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {file.fileName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatFileSize(file.blob.size)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => inputRef.current?.click()}
                    className="shrink-0"
                  >
                    Change photo
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 rounded-lg border-[1.5px] border-dashed border-border bg-background py-8 px-4 text-center hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors"
              >
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Choose photo</span>
                <span className="text-[11px] text-muted-foreground">
                  JPEG, PNG or HEIC, up to 25 MB
                </span>
              </button>
            )}
          </div>

          <div className="rounded-lg border border-l-4 border-sky-500/30 border-l-sky-500 bg-sky-500/5 p-3 flex flex-col gap-2">
            <p className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
              Operation
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500 text-white tracking-wider">
                REQUIRED
              </span>
            </p>
            {operationOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No operations found.
              </p>
            ) : (
              <Select
                value={operationId != null ? String(operationId) : undefined}
                onValueChange={v => {
                  setOperationId(Number(v));
                  setSheetId(null);
                  setRowId(null);
                }}
              >
                <SelectTrigger className="h-9 text-sm bg-background">
                  <SelectValue placeholder="Select operation…" />
                </SelectTrigger>
                <SelectContent>
                  {operationOptions.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {operationId != null && (
            <div className="rounded-lg border border-l-4 border-emerald-500/30 border-l-emerald-500 bg-emerald-500/5 p-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                Running sheet
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-background border border-border text-muted-foreground tracking-wider">
                  OPTIONAL
                </span>
              </p>
              <Select
                value={sheetId != null ? String(sheetId) : "__none__"}
                onValueChange={v => {
                  setSheetId(v === "__none__" ? null : Number(v));
                  setRowId(null);
                }}
              >
                <SelectTrigger className="h-9 text-sm bg-background">
                  <SelectValue placeholder="Select running sheet…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {(sheets ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.title || `Sheet #${s.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {sheetId != null && (
                <Select
                  value={rowId != null ? String(rowId) : "__none__"}
                  onValueChange={v =>
                    setRowId(v === "__none__" ? null : Number(v))
                  }
                >
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Select row…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(rows ?? []).map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {(r.time ?? "—") +
                          " · " +
                          (r.observation
                            ? String(r.observation).slice(0, 60)
                            : "(no observation)")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground px-1">
            After uploading, this photo is checked against everyone already
            confirmed elsewhere in the app — link it to a specific Target,
            Associate, Vehicle, Location, or Unidentified Person afterward from
            its "not linked" tag.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              Close
            </Button>
            <Button disabled={!canSubmit} onClick={handleSubmit}>
              {uploadManual.isPending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {suggestion && (
        <SuggestedFaceMatchDialog
          attachmentId={suggestion.id}
          photoUrl={suggestion.url}
          suggestion={suggestion.match}
          onDone={() => setSuggestion(null)}
        />
      )}
    </>
  );
}
