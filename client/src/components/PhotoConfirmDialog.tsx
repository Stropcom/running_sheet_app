import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FORM_CONFIRM_BUTTON } from "@/lib/formKit";

/**
 * The fail-safe step for a photo that would otherwise save the moment it is
 * chosen: show what was picked and only upload when the officer presses the
 * green button. Cancel throws the pick away. A HEIC file the browser can't
 * preview shows its name instead of a picture.
 */
export function PhotoConfirmDialog({
  photo,
  busy,
  title = "Upload this photo?",
  description,
  confirmLabel = "Confirm upload",
  onConfirm,
  onCancel,
}: {
  photo: { previewUrl: string | null; fileName: string; size?: number } | null;
  busy: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={photo !== null}
      onOpenChange={open => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "Nothing is saved until you press Confirm upload."}
          </DialogDescription>
        </DialogHeader>
        {photo && (
          <div className="flex flex-col gap-2">
            {photo.previewUrl ? (
              <img
                src={photo.previewUrl}
                alt="Photo to upload"
                className="w-full max-h-[55vh] object-contain rounded-lg border border-border bg-muted"
              />
            ) : (
              <div className="w-full h-40 rounded-lg border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground text-center px-3">
                No preview for this file type — {photo.fileName}
              </div>
            )}
            <p className="text-xs text-muted-foreground truncate">
              {photo.fileName}
              {photo.size != null
                ? photo.size < 1024 * 1024
                  ? ` · ${Math.max(1, Math.round(photo.size / 1024))} KB`
                  : ` · ${(photo.size / 1024 / 1024).toFixed(1)} MB`
                : ""}
            </p>
          </div>
        )}
        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className={FORM_CONFIRM_BUTTON}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
