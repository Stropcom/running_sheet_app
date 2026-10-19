import { Loader2 } from "lucide-react";

/** One similar face on file — what attachment.faceMatches returns. */
export interface FaceMatchRow {
  entityLinkId: number;
  category: string;
  targetId: number | null;
  entityLabel: string;
  similarity: number;
  attachmentId: number;
  photoUrl: string;
  sourceSheetId: number | null;
  sourceSheetTitle: string | null;
  sourceOperationId: number;
  sourceOperationName: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  target: "Target",
  associate: "Associate",
  unidentified_person: "Unidentified Person",
};

/**
 * What the picked face looks like to the face matcher: the closest few faces
 * already on file, each with its photo, who it is filed as, where the photo
 * came from and a similarity score. A look, not a decision — nothing here
 * links anything; the officer chooses who it is below, having seen the
 * evidence. Shown only for a face the officer tapped.
 */
export function FaceMatchPanel({
  matches,
  loading,
  error,
}: {
  matches: FaceMatchRow[] | undefined;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <div
      className="rounded-md border border-border bg-muted/40 p-2.5 flex flex-col gap-2"
      aria-live="polite"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-foreground/80">
        Similar faces on file
      </p>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Checking for similar faces…
        </p>
      ) : error ? (
        <p className="text-xs text-muted-foreground">
          Couldn't check for similar faces. You can still pick who it is below.
        </p>
      ) : !matches || matches.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No similar faces on file.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {matches.map(m => (
              <li
                key={m.entityLinkId}
                className="flex items-center gap-2.5 rounded border border-border bg-card p-1.5"
              >
                <img
                  src={m.photoUrl}
                  alt={`Photo of ${m.entityLabel}`}
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded object-cover border border-border"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {m.entityLabel}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {CATEGORY_LABEL[m.category] ?? m.category}
                    {" · "}
                    {m.sourceOperationName}
                    {m.sourceSheetTitle ? ` · ${m.sourceSheetTitle}` : ""}
                  </p>
                </div>
                <div className="w-14 shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums">
                    {m.similarity.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    similarity
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            A guide only — compare the photos yourself before choosing who it
            is.
          </p>
        </>
      )}
    </div>
  );
}
