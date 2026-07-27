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
}: {
  onConfirm: () => void;
  pending?: boolean;
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
        className="absolute top-1.5 right-1.5 h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
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
