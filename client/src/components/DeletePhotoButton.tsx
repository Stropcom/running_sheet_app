import { useState } from "react";
import { X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Small "X" delete button used on photo thumbnails, gated behind a confirm
// step so a stray tap can't silently destroy an evidentiary photo.
export function DeletePhotoButton({
  onConfirm,
  pending,
  positionClassName = "absolute top-1.5 right-1.5",
  iconSize = "h-4 w-4 sm:h-5 sm:w-5",
  glyphSize = "h-2.5 w-2.5 sm:h-3 sm:w-3",
}: {
  onConfirm: () => void;
  pending?: boolean;
  /** Positioning only — sizing is separate. Match the paired AttachmentLinkBadge's own positionClassName. */
  positionClassName?: string;
  /** Size of the button circle — match the paired AttachmentLinkBadge's iconSize so both read as one size. */
  iconSize?: string;
  /** Size of the X glyph inside the button — match the paired AttachmentLinkBadge's glyphSize. */
  glyphSize?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        onClick={e => {
          e.stopPropagation();
          setConfirming(true);
        }}
        title="Delete photo"
        className={`${positionClassName} ${iconSize} rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity`}
      >
        <X className={glyphSize} />
      </button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete photo?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo? Any links to
              targets, associates, vehicles, or locations will be removed
              too. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                onConfirm();
                setConfirming(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
