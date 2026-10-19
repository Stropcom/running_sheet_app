import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PossibleMatchDialog,
  type FaceMatchCandidate,
} from "@/components/PossibleMatchDialog";

/**
 * The moment the officer taps a face, look for similar faces already on file
 * and — when there are some — open the existing "possible match" pop-up on its
 * own (same zoom, source photo and similarity as the one shown after linking),
 * in its look-only form: nothing is linked or confirmed here, the officer
 * chooses who it is afterwards. A short status line sits under the photo
 * (checking / none found / "View" to reopen after closing). It opens once per
 * tapped face; tapping a different face opens it for that one.
 */
export function FaceMatchPreview({
  photoUrl,
  faceKey,
  bbox,
  matches,
  loading,
  error,
}: {
  photoUrl: string;
  /** Identifies the tapped face (its index), so a new tap opens it afresh. */
  faceKey: number;
  /** The tapped face in photo pixels, shown cropped on the "new" side. */
  bbox: [number, number, number, number] | undefined;
  matches: FaceMatchCandidate[] | undefined;
  loading?: boolean;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openedFor, setOpenedFor] = useState<number | null>(null);
  const count = matches?.length ?? 0;

  // A different face: close whatever was open and allow a fresh auto-open.
  useEffect(() => {
    setOpen(false);
  }, [faceKey]);

  useEffect(() => {
    if (count > 0 && openedFor !== faceKey) {
      setOpen(true);
      setOpenedFor(faceKey);
    }
  }, [count, faceKey, openedFor]);

  return (
    <>
      <p
        className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Checking for similar faces on file…
          </>
        ) : error ? (
          "Couldn't check for similar faces — you can still pick who it is below."
        ) : count === 0 ? (
          "No similar faces on file."
        ) : (
          <>
            {count} similar face{count === 1 ? "" : "s"} on file.
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => setOpen(true)}
            >
              View
            </Button>
          </>
        )}
      </p>
      {open && count > 0 && (
        <PossibleMatchDialog
          preview
          matches={(matches ?? []).map(match => ({
            newLinkId: 0,
            newPhotoUrl: photoUrl,
            match,
            ...(bbox ? { newFace: { bbox } } : {}),
          }))}
          onDone={() => setOpen(false)}
        />
      )}
    </>
  );
}
