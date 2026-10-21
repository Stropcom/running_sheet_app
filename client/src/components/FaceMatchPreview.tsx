import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PossibleMatchDialog,
  type FaceMatchCandidate,
} from "@/components/PossibleMatchDialog";
import { triageMatches, type TriageChosen } from "@shared/faceMatchTriage";

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
  answers,
  chosen,
  onAnswer,
}: {
  photoUrl: string;
  /** Identifies the tapped face (its index), so a new tap opens it afresh. */
  faceKey: number;
  /** The tapped face in photo pixels, shown cropped on the "new" side. */
  bbox: [number, number, number, number] | undefined;
  matches: FaceMatchCandidate[] | undefined;
  loading?: boolean;
  error?: boolean;
  /** What the officer has already answered for this face, by matched link. */
  answers: Record<number, "same" | "different">;
  /** Who the photo is being linked to, when picked. */
  chosen?: TriageChosen | null;
  /** Called for each "Same person" / "Not the same person" answer. */
  onAnswer: (match: FaceMatchCandidate, answer: "same" | "different") => void;
}) {
  const [open, setOpen] = useState(false);
  // The matches the pop-up steps through, fixed when it opens — answers given
  // as it goes shrink `remaining`, which must not shift the pop-up under it.
  const [shown, setShown] = useState<FaceMatchCandidate[]>([]);
  const [openedFor, setOpenedFor] = useState<number | null>(null);
  // Only matches still worth asking are asked about: not ones already
  // answered, not other photos of a person already confirmed or turned down,
  // and not a lower-scoring match under another name once the photo is
  // confirmed as someone (shared/faceMatchTriage.ts).
  const remaining = triageMatches(
    matches ?? [],
    answers,
    chosen ?? null
  ).ask.filter(m => !answers[m.entityLinkId]);
  const count = remaining.length;
  const answered = (matches?.length ?? 0) - count;

  // A different face: close whatever was open and allow a fresh auto-open.
  useEffect(() => {
    setOpen(false);
  }, [faceKey]);

  const openDialog = () => {
    setShown(remaining);
    setOpen(true);
  };

  useEffect(() => {
    if (count > 0 && openedFor !== faceKey) {
      openDialog();
      setOpenedFor(faceKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        ) : (matches?.length ?? 0) === 0 ? (
          "No similar faces on file."
        ) : count === 0 ? (
          `All ${answered} similar face${answered === 1 ? "" : "s"} answered.`
        ) : (
          <>
            {count} similar face{count === 1 ? "" : "s"} on file.
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={openDialog}
            >
              View
            </Button>
          </>
        )}
      </p>
      {open && shown.length > 0 && (
        <PossibleMatchDialog
          onPreviewAnswer={onAnswer}
          matches={shown.map(match => ({
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
